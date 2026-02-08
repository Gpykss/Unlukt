import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requireVerification = false }) {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (requireVerification && !currentUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return children;
}