// src/pages/Auth/Login.jsx - UNLUKT FINAL VERSION

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Mail, Lock, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, signInWithGoogle, fetchUserProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await login(formData.email, formData.password);
      
      if (formData.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
      
      const userProfileData = await fetchUserProfile(userCredential.user.uid);
      
      if (!userProfileData?.profileCompleted) {
        navigate('/complete-profile');
      } else {
        navigate('/feed');
      }
      
    } catch (err) {
      console.error('Login error:', err);
      
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Invalid email or password');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later.');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled');
          break;
        default:
          setError('Failed to login. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const result = await signInWithGoogle();
      const userProfileData = await fetchUserProfile(result.user.uid);
      
      if (!userProfileData?.profileCompleted) {
        navigate('/complete-profile');
      } else {
        navigate('/feed');
      }
    } catch (err) {
      console.error('Google login error:', err);
      setError('Failed to login with Google. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          {/* ✅ UNLUKT LOGO WITH ICON + TEXT */}
          <div className="flex items-center justify-center mb-6">
            <span className="text-4xl font-black text-gray-900 flex items-center tracking-tight" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
              Unl
              <LockKeyhole className="w-10 h-10 text-red-600 mx-1" strokeWidth={1.8} fill="none" />
              kt
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-600 text-sm">Sign in to your account</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter your email"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                  disabled={isLoading}
                />
                <span className="text-gray-600">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Password reset feature coming soon!')}
                className="text-red-500 hover:text-red-600 font-medium"
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold transition shadow-sm mt-6 flex items-center justify-center space-x-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-gray-500">or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2.5 rounded-lg font-medium text-gray-700 transition flex items-center justify-center disabled:opacity-50"
            >
              <span className="text-lg">G</span>
            </button>
            <button
              onClick={() => alert('Apple login coming soon!')}
              disabled={isLoading}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2.5 rounded-lg font-medium text-gray-700 transition flex items-center justify-center disabled:opacity-50"
            >
              <span className="text-lg"></span>
            </button>
            <button
              onClick={() => alert('Facebook login coming soon!')}
              disabled={isLoading}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2.5 rounded-lg font-medium text-gray-700 transition flex items-center justify-center disabled:opacity-50"
            >
              <span className="text-lg">f</span>
            </button>
          </div>

          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/register')}
                className="font-semibold text-red-500 hover:text-red-600 transition"
                disabled={isLoading}
              >
                Sign up
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
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-gray-900 font-medium transition text-sm"
            disabled={isLoading}
          >
            ← Back to home
          </button>
        </motion.div>
      </div>
    </div>
  );
}