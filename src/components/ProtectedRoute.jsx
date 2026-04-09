// src/components/ProtectedRoute.jsx

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requireVerification = false }) {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();

  // Step 1: Not logged in at all → go to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Step 2: Logged in but email NOT verified in Firebase Auth
  // (applies to email/password users)
  const isEmailUser = currentUser.providerData?.[0]?.providerId === 'password';
  if (isEmailUser && !currentUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // Step 3: Wait for userProfile to load from Firestore
  if (userProfile === null || userProfile === undefined) {
    // If profile doesn't exist in Firestore at all → send to complete-profile
    // We check this by waiting briefly — AuthContext sets userProfile after fetch
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Step 4: Profile exists but not completed → go to complete-profile
  if (
    userProfile.profileCompleted === false &&
    location.pathname !== '/complete-profile'
  ) {
    return <Navigate to="/complete-profile" replace />;
  }

  // Step 5: Twitter/social user who still needs to verify email
  // (emailVerified is stored in Firestore for social users)
  const isTwitterUser = currentUser.providerData?.[0]?.providerId === 'twitter.com';
  const isGoogleUser = currentUser.providerData?.[0]?.providerId === 'google.com';

  if (isTwitterUser && userProfile.emailVerified === false && location.pathname !== '/verify-email') {
    return <Navigate to="/verify-email" replace />;
  }

  // Step 6: Profile completed but still on complete-profile → go to feed
  if (
    location.pathname === '/complete-profile' &&
    userProfile.profileCompleted === true
  ) {
    return <Navigate to="/feed" replace />;
  }

  return children;
}
