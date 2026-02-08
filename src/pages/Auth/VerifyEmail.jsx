import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, Mail, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { currentUser, resendVerificationEmail, logout } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(new Date());

  useEffect(() => {
    if (currentUser?.emailVerified) {
      navigate('/feed');
    }
  }, [currentUser, navigate]);

  // Auto-check every 5 seconds
  useEffect(() => {
    if (!currentUser?.emailVerified && autoChecking) {
      const interval = setInterval(async () => {
        try {
          await currentUser.reload();
          setLastChecked(new Date());
          if (currentUser.emailVerified) {
            navigate('/feed');
          }
        } catch (err) {
          console.error('Auto-check error:', err);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [currentUser, autoChecking, navigate]);

  const handleResendEmail = async () => {
    setIsResending(true);
    setResendError('');
    setResendSuccess(false);

    try {
      await resendVerificationEmail();
      setResendSuccess(true);
      
      setTimeout(() => {
        setResendSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Resend error:', err);
      
      if (err.code === 'auth/too-many-requests') {
        setResendError('Too many requests. Please wait a few minutes before trying again.');
      } else {
        setResendError('Failed to resend email. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsChecking(true);
    
    try {
      await currentUser.reload();
      setLastChecked(new Date());
      
      if (currentUser.emailVerified) {
        navigate('/feed');
      } else {
        setResendError('Email not verified yet. Please check your inbox and click the verification link.');
        setTimeout(() => setResendError(''), 4000);
      }
    } catch (err) {
      console.error('Check verification error:', err);
      setResendError('Failed to check verification status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center space-x-2 mb-6">
            <div className="w-10 h-10 bg-rose-500 rounded-lg flex items-center justify-center shadow-sm">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">unlukt</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
        >
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-rose-500" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
            <p className="text-gray-600 text-sm">
              We sent a verification link to
            </p>
            <p className="text-gray-900 font-semibold mt-1">
              {currentUser?.email}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Check your inbox</p>
                <ul className="space-y-1 list-disc list-inside text-blue-700">
                  <li>Click the verification link in the email</li>
                  <li>Check your spam folder if needed</li>
                  <li>The link expires in 24 hours</li>
                </ul>
              </div>
            </div>
          </div>

          {resendSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2"
            >
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700">
                Verification email sent successfully! Check your inbox.
              </p>
            </motion.div>
          )}

          {resendError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm"
            >
              {resendError}
            </motion.div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleCheckVerification}
              disabled={isChecking}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-semibold transition shadow-sm flex items-center justify-center space-x-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>I've Verified My Email</span>
                </>
              )}
            </button>

            <button
              onClick={handleResendEmail}
              disabled={isResending || resendSuccess}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-semibold transition border border-gray-200 flex items-center justify-center space-x-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              {isResending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : resendSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>Email Sent!</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  <span>Resend Verification Email</span>
                </>
              )}
            </button>
          </div>

          {/* Auto-check Toggle */}
          <div className="mt-4 text-center">
            <label className="inline-flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoChecking}
                onChange={(e) => setAutoChecking(e.target.checked)}
                className="w-4 h-4 text-rose-500 border-gray-300 rounded focus:ring-rose-500"
              />
              <span>Auto-check every 5 seconds</span>
            </label>
            {autoChecking && (
              <p className="text-xs text-gray-500 mt-1">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
          </div>

          <div className="text-center space-y-3">
            <p className="text-sm text-gray-600">
              Wrong email address?{' '}
              <button
                onClick={handleLogout}
                className="text-rose-500 hover:text-rose-600 font-semibold"
              >
                Sign out and try again
              </button>
            </p>
            
            <p className="text-xs text-gray-500">
              Need help?{' '}
              <button
                onClick={() => window.open('mailto:support@unlukt.com', '_blank')}
                className="text-rose-500 hover:text-rose-600 font-medium"
              >
                Contact Support
              </button>
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-6"
        >
          <p className="text-sm text-gray-600">
            💡 {autoChecking ? 'Auto-checking...' : 'Click "I\'ve Verified My Email" after verifying'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
