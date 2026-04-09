// src/contexts/AuthContext.jsx

import { createContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  TwitterAuthProvider,
  FacebookAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../services/firestoreService';
import { updateUserOnlineStatus } from '../services/messageService';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper: send welcome email for social users via Firebase Function
  const sendWelcomeEmailForSocialUser = async (uid, email, displayName) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const functionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL ||
        'https://us-central1-ogfans-2d4a6.cloudfunctions.net';

      await fetch(`${functionsUrl}/sendSocialWelcomeEmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, displayName })
      });
    } catch (err) {
      // Non-critical — don't block auth flow
      console.warn('Welcome email failed:', err);
    }
  };

  const signup = async (email, password, additionalData = {}) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const existingProfile = await getUserProfile(userCredential.user.uid);
      if (!existingProfile) {
        await createUserProfile(userCredential.user.uid, {
          email,
          profileCompleted: false,
          emailVerified: false,
          provider: 'email',
          needsEmail: false,
          ...additionalData
        });
      }

      // Send custom verification email via Firebase Function
      const token = await userCredential.user.getIdToken();
      const functionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL ||
        'https://us-central1-ogfans-2d4a6.cloudfunctions.net';

      await fetch(`${functionsUrl}/sendCustomVerification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return userCredential;
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (currentUser) {
      await updateUserOnlineStatus(currentUser.uid, false);
    }
    setUserProfile(null);
    return signOut(auth);
  };

  // ✅ Helper: process social auth result (shared by Google/Twitter/Facebook)
  const handleSocialAuthResult = async (result) => {
    const user = result.user;
    const uid = user.uid;
    const displayName = user.displayName || '';
    const photoURL = user.photoURL || '';
    const providerData = user.providerData?.[0] || {};
    const providerName = providerData.providerId || '';
    const email = user.email || providerData.email || null;

    console.log('Social auth success:', { uid, email, displayName, providerName });

    // Check if user already exists in Firestore
    const existingProfile = await getUserProfile(uid);

    if (!existingProfile) {
      // New user — create profile
      await createUserProfile(uid, {
        email: email || '',
        displayName: displayName || '',
        avatar: photoURL || '',
        phoneNumber: '',
        profileCompleted: false,
        emailVerified: email ? true : false,
        provider: providerName,
        needsEmail: !email,
        createdAt: new Date().toISOString(),
      });

      if (email) {
        await sendWelcomeEmailForSocialUser(uid, email, displayName);
      }

      return { isNew: true, profileCompleted: false };
    } else {
      // Existing user — update email if newly available
      if (email && !existingProfile.email) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../config/firebase');
        await updateDoc(doc(db, 'users', uid), {
          email,
          emailVerified: true,
          needsEmail: false,
        });
      }

      return { isNew: false, profileCompleted: !!existingProfile.profileCompleted };
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    // ✅ Using signInWithPopup — returns result directly, no redirect issues
    const result = await signInWithPopup(auth, provider);
    return await handleSocialAuthResult(result);
  };

  const signInWithTwitter = async () => {
    const provider = new TwitterAuthProvider();
    provider.setCustomParameters({ force_login: 'true' });
    const result = await signInWithPopup(auth, provider);
    return await handleSocialAuthResult(result);
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    const result = await signInWithPopup(auth, provider);
    return await handleSocialAuthResult(result);
  };

  const resendVerificationEmail = async () => {
    if (!currentUser) {
      throw new Error('No authenticated user. Please log in again.');
    }
    const token = await currentUser.getIdToken();
    const functionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL ||
      'https://us-central1-ogfans-2d4a6.cloudfunctions.net';

    const response = await fetch(`${functionsUrl}/sendCustomVerification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to send verification email. Please try again later.');
    }

    return true;
  };

  const fetchUserProfile = async (userId) => {
    try {
      const profile = await getUserProfile(userId);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUserProfile(null);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Force reload to get fresh token and emailVerified status
      if (user) await user.reload().catch(() => {});
      setCurrentUser(user ? auth.currentUser : null);
      if (user) {
        const profile = await fetchUserProfile(user.uid);

        // ⚠️ Firestore profile missing (deleted manually from Firebase Console)
        // DO NOT auto-recreate — sign the user out so they must re-register properly
        if (!profile) {
          console.warn('⚠️ User authenticated but no Firestore profile found. Signing out.');
          await signOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentUser && !loading) {
      // Safe wrapper — silently catches errors if user was signed out mid-update
      const safeUpdateStatus = (uid, isOnline) => {
        if (!auth.currentUser) return; // user was signed out
        updateUserOnlineStatus(uid, isOnline).catch(() => {});
      };

      safeUpdateStatus(currentUser.uid, true);

      const handleBeforeUnload = () => {
        safeUpdateStatus(currentUser.uid, false);
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          safeUpdateStatus(currentUser.uid, false);
        } else {
          safeUpdateStatus(currentUser.uid, true);
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        safeUpdateStatus(currentUser.uid, false);
      };
    }
  }, [currentUser, loading]);

  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    logout,
    signInWithGoogle,
    signInWithTwitter,
    signInWithFacebook,
    resendVerificationEmail,
    fetchUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
