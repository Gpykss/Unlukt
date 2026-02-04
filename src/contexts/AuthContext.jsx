import { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../services/firestoreService';
import { updateUserOnlineStatus } from '../services/messageService';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign up with email and password
  const signup = async (email, password, additionalData = {}) => {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create Firestore profile
      await createUserProfile(userCredential.user.uid, {
        email: email,
        ...additionalData
      });
      
      // Send verification email
      await sendEmailVerification(userCredential.user);
      
      return userCredential;
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  // Login with email and password
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Logout
  const logout = async () => {
    // Set user offline before logging out
    if (currentUser) {
      await updateUserOnlineStatus(currentUser.uid, false);
    }
    setUserProfile(null);
    return signOut(auth);
  };

  // Google Sign In
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      
      const existingProfile = await getUserProfile(result.user.uid);
      
      if (!existingProfile) {
        await createUserProfile(result.user.uid, {
          email: result.user.email,
          displayName: result.user.displayName,
          avatar: result.user.photoURL
        });
      }
      
      return result;
    } catch (error) {
      console.error('Google sign in error:', error);
      
      // Better error messages
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in popup was closed. Please try again.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection.');
      } else if (error.code === 'auth/internal-error') {
        throw new Error('Google Sign-In temporarily unavailable. Please use email/password or try again later.');
      }
      
      throw error;
    }
  };

  // Resend verification email
  const resendVerificationEmail = () => {
    if (currentUser) {
      return sendEmailVerification(currentUser);
    }
  };

  // Fetch user profile from Firestore
  const fetchUserProfile = async (userId) => {
    try {
      const profile = await getUserProfile(userId);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Don't block the app if Firestore is not ready
      // Just set userProfile to null and continue
      setUserProfile(null);
      return null;
    }
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      // Fetch user profile if logged in
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ✅ ONLINE STATUS TRACKING
  useEffect(() => {
    if (currentUser && !loading) {
      // Set user online when they login
      updateUserOnlineStatus(currentUser.uid, true);
      
      // Set user offline when they close the tab/window
      const handleBeforeUnload = () => {
        updateUserOnlineStatus(currentUser.uid, false);
      };
      
      // Set user offline on visibility change (when tab becomes hidden)
      const handleVisibilityChange = () => {
        if (document.hidden) {
          updateUserOnlineStatus(currentUser.uid, false);
        } else {
          updateUserOnlineStatus(currentUser.uid, true);
        }
      };
      
      // Add event listeners
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Cleanup
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
    resendVerificationEmail,
    fetchUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}