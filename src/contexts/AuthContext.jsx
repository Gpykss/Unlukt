// src/contexts/AuthContext.jsx - FIXED: All social auth sets profileCompleted: false

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

  const signup = async (email, password, additionalData = {}) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // ✅ Avoid profile duplication edge cases
      const existingProfile = await getUserProfile(userCredential.user.uid);
      if (!existingProfile) {
        await createUserProfile(userCredential.user.uid, {
          email,
          profileCompleted: false,
          ...additionalData
        });
      }

      // ✅ Send custom verification email via Resend Cloud Function
      const token = await userCredential.user.getIdToken();
      const functionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 'https://us-central1-ogfans-2d4a6.cloudfunctions.net';
      
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
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      const existingProfile = await getUserProfile(result.user.uid);
      if (!existingProfile) {
        await createUserProfile(result.user.uid, {
          email: result.user.email,
          displayName: result.user.displayName,
          avatar: result.user.photoURL,
          profileCompleted: false
        });
      }
      return result;
    } catch (error) {
      console.error('Google sign in error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in popup was closed. Please try again.');
      }
      throw error;
    }
  };

  const signInWithTwitter = async () => {
    try {
      const provider = new TwitterAuthProvider();
      const result = await signInWithPopup(auth, provider);

      console.log('Twitter login successful:', result);

      const existingProfile = await getUserProfile(result.user.uid);
      if (!existingProfile) {
        await createUserProfile(result.user.uid, {
          email: result.user.email || '',
          displayName: result.user.displayName || 'Twitter User',
          avatar: result.user.photoURL || '🐦',
          profileCompleted: false
        });
      }
      return result;
    } catch (error) {
      console.error('Twitter sign in error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Twitter sign-in popup was closed. Please try again.');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email. Please use a different sign-in method.');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('Twitter authentication failed. Please make sure Twitter login is properly configured in Firebase Console.');
      } else if (error.code === 'auth/unauthorized-domain') {
        throw new Error('This domain is not authorized for Twitter login. Please add it to Firebase authorized domains.');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Twitter login is not enabled. Please enable it in Firebase Console.');
      }
      throw error;
    }
  };

  const signInWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      provider.setCustomParameters({ display: 'popup' });
      const result = await signInWithPopup(auth, provider);

      const existingProfile = await getUserProfile(result.user.uid);
      if (!existingProfile) {
        await createUserProfile(result.user.uid, {
          email: result.user.email || '',
          displayName: result.user.displayName || 'Facebook User',
          avatar: result.user.photoURL || '📘',
          profileCompleted: false
        });
      }
      return result;
    } catch (error) {
      console.error('Facebook sign in error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Facebook sign-in popup was closed. Please try again.');
      }
      throw error;
    }
  };

  const resendVerificationEmail = async () => {
    if (!currentUser) {
      throw new Error('No authenticated user. Please log in again.');
    }
    const token = await currentUser.getIdToken();
    const functionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 'https://us-central1-ogfans-2d4a6.cloudfunctions.net';
    
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
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
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
