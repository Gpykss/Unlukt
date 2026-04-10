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

  // Step 2: Email verification check — ONLY when requireVerification={true}
  // Checks BOTH Firebase Auth emailVerified AND Firestore profile emailVerified
  // So you can manually verify by setting emailVerified=true in Firestore users collection
  const isEmailUser = currentUser.providerData?.[0]?.providerId === 'password';
  const isEmailVerified = currentUser.emailVerified || userProfile?.emailVerified === true;
  if (requireVerification && isEmailUser && !isEmailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // Step 3: Wait for userProfile to load from Firestore
  if (userProfile === null || userProfile === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Step 4: Profile exists but not completed → go to complete-profile
  // Allow /verify-email too so unverified users aren't stuck in a redirect loop
  if (
    userProfile.profileCompleted === false &&
    location.pathname !== '/complete-profile' &&
    location.pathname !== '/verify-email'
  ) {
    return <Navigate to="/complete-profile" replace />;
  }

  // Step 5: Twitter/social user who still needs to verify email
  // (emailVerified is stored in Firestore for social users)
  const isTwitterUser = currentUser.providerData?.[0]?.providerId === 'twitter.com';

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
