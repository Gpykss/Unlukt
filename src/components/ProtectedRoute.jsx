// src/components/ProtectedRoute.jsx - FIXED

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requireVerification = false }) {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();

  // ✅ Step 1: Check if user is logged in
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // ✅ Step 2: Check email verification if required
  if (requireVerification && !currentUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // ✅ Step 3: Wait for userProfile to load before making decisions
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // ✅ Step 4: Redirect to complete-profile if needed (but NOT if already on that page)
  if (
    userProfile.profileCompleted === false && 
    location.pathname !== '/complete-profile'
  ) {
    return <Navigate to="/complete-profile" replace />;
  }

  // ✅ Step 5: If on complete-profile but profile is already completed, redirect to feed
  if (
    location.pathname === '/complete-profile' && 
    userProfile.profileCompleted === true
  ) {
    return <Navigate to="/feed" replace />;
  }

  return children;
}