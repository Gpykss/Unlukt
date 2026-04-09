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
        if (result && result.user) {
          const existingProfile = await getUserProfile(result.user.uid);
          if (!existingProfile) {
            // Brand new user — create profile and send to complete profile
            await createUserProfile(result.user.uid, {
              email: result.user.email || '',
              displayName: result.user.displayName || 'Social User',
              avatar: result.user.photoURL || '',
              profileCompleted: false
            });
            window.location.href = '/complete-profile';
          } else if (!existingProfile.profileCompleted) {
            // Existing user but profile not completed
            window.location.href = '/complete-profile';
          } else {
            // Fully set up user — go to feed
            window.location.href = '/feed';
          }
        }
      } catch (error) {
        console.error('Redirect login error:', error);
      }
    };
    handleRedirectResult();
  }, []);

  const signup = async (email, password, additionalData = {}) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const existingProfile = await getUserProfile(userCredential.user.uid);
      if (!existingProfile) {
        await createUserProfile(userCredential.user.uid, {
          email,
          profileCompleted: false,
          ...additionalData
        });
      }

      // Send custom verification email via Firebase Function
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
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithRedirect(auth, provider);
  };

  const signInWithTwitter = async () => {
    const provider = new TwitterAuthProvider();
    return signInWithRedirect(auth, provider);
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    provider.setCustomParameters({ display: 'popup' });
    return signInWithRedirect(auth, provider);
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
