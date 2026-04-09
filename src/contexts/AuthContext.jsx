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
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../services/firestoreService';
import { updateUserOnlineStatus } from '../services/messageService';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Handle redirect result when app mounts (Google/Twitter/Facebook login)
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);

        // No redirect result — user just opened the app normally
        if (!result) return;

        const user = result.user;

        // ✅ Fetch all available data from the provider
        const uid = user.uid;
        const displayName = user.displayName || '';
        const photoURL = user.photoURL || '';
        const providerData = user.providerData?.[0] || {};
        const providerName = providerData.providerId || '';

        // ⚠️ Twitter often returns null email — we handle this below
        const email = user.email || providerData.email || null;

        console.log('Social auth success:', { uid, email, displayName, providerName });

        // ✅ Check if user already exists in Firestore
        const existingProfile = await getUserProfile(uid);

        if (!existingProfile) {
          // 🆕 Brand new user — save whatever data we have from provider
          await createUserProfile(uid, {
            email: email || '',          // may be empty for Twitter — filled in on complete-profile
            displayName: displayName || '',
            avatar: photoURL || '',
            phoneNumber: '',
            profileCompleted: false,
            emailVerified: email ? true : false,  // Google email is verified, Twitter may not have one
            provider: providerName,
            needsEmail: !email,          // flag so complete-profile knows to ask for email
            createdAt: new Date().toISOString(),
          });

          // Send welcome + verification email if we have their email
          if (email) {
            await sendWelcomeEmailForSocialUser(uid, email, displayName);
          }

          // New user always goes to complete-profile
          window.location.href = '/complete-profile';

        } else {
          // 👤 Existing user

          // If we now have an email but didn't before, update it
          if (email && !existingProfile.email) {
            const { doc, updateDoc } = await import('firebase/firestore');
            const { db } = await import('../config/firebase');
            await updateDoc(doc(db, 'users', uid), {
              email,
              emailVerified: true,
              needsEmail: false,
            });
          }

          if (!existingProfile.profileCompleted) {
            window.location.href = '/complete-profile';
          } else {
            window.location.href = '/feed';
          }
        }

      } catch (error) {
        console.error('Redirect login error:', error);

        // User cancelled — just stay on the page
        if (
          error.code === 'auth/popup-closed-by-user' ||
          error.code === 'auth/cancelled-popup-request' ||
          error.code === 'auth/user-cancelled'
        ) {
          console.log('User cancelled social login');
          return;
        }

        // Other errors — go back to register
        window.location.href = '/register?error=social_auth_failed';
      }
    };

    handleRedirectResult();
  }, []);

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

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    // ✅ Force account selection — prevents auto-login with cached session
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithRedirect(auth, provider);
  };

  const signInWithTwitter = async () => {
    const provider = new TwitterAuthProvider();
    // ✅ Firebase uses OAuth 1.0a for Twitter — no extra scopes needed
    // Twitter will show its own login/authorization screen
    // force_login=true ensures Twitter always shows the login page
    provider.setCustomParameters({ force_login: 'true' });
    return signInWithRedirect(auth, provider);
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    return signInWithRedirect(auth, provider);
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
      updateUserOnlineStatus(currentUser.uid, true);

      const handleBeforeUnload = () => {
        updateUserOnlineStatus(currentUser.uid, false);
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          updateUserOnlineStatus(currentUser.uid, false);
        } else {
          updateUserOnlineStatus(currentUser.uid, true);
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        updateUserOnlineStatus(currentUser.uid, false);
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
