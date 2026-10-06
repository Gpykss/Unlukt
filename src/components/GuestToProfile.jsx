// src/components/GuestToProfile.jsx
// Shared links like /livestream/:creatorId or /book-video-call/:creatorId shouldn't bounce a
// logged-out visitor straight to sign-up. Show them the creator's profile first (it shows the
// LIVE / scheduled badge and booking buttons); any action there leads to sign-up and back.
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { rememberNext } from '../utils/authRedirect';
import ProtectedRoute from './ProtectedRoute';

function RedirectToProfile({ creatorId }) {
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    // After signing up from the profile, bring them back to what the link pointed at
    rememberNext(window.location.pathname);
    getDoc(doc(db, 'users', creatorId))
      .then((snap) => {
        if (!alive) return;
        const handle = snap.exists() ? (snap.data().username || creatorId) : null;
        navigate(handle ? `/creator/${String(handle).replace('@', '')}` : '/', { replace: true });
      })
      .catch(() => alive && navigate('/', { replace: true }));
    return () => { alive = false; };
  }, [creatorId, navigate]);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function GuestToProfile({ children }) {
  const { currentUser } = useAuth();
  const { creatorId } = useParams();
  if (!currentUser) {
    if (!creatorId) return <Navigate to="/" replace />;
    return <RedirectToProfile creatorId={creatorId} />;
  }
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
