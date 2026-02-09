// src/pages/Auth/Register.jsx - FIXED: Social Auth UI

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Mail, Lock, Phone, Check, X, LockKeyhole, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Animated Floating Creator Card Component
function AnimatedCreatorCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const creators = [
    { emoji: '👩', name: 'Sarah M', role: 'Model', earnings: '$12.5K/mo', fans: '3.2K' },
    { emoji: '🧔', name: 'Mike D', role: 'Fitness', earnings: '$8.9K/mo', fans: '2.1K' },
    { emoji: '👱‍♀️', name: 'Emma L', role: 'Artist', earnings: '$15.2K/mo', fans: '4.8K' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % creators.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-96">
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        exit={{ opacity: 0, scale: 0.9, rotateY: 15 }}
        transition={{ duration: 0.6 }}
        className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 relative overflow-hidden"
      >
        <motion.div
          animate={{
            background: [
              'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
              'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 opacity-30"
        />

        <div className="relative z-10">
          <div className="flex justify-between items-center mb-4">
            <div className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center space-x-1">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              <span>ONLINE</span>
            </div>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-5 h-5 text-yellow-500" />
            </motion.div>
          </div>

          <div className="aspect-[3/4] bg-gradient-to-br from-red-100 via-red-50 to-orange-100 rounded-2xl mb-4 flex items-center justify-center overflow-hidden relative">
            <motion.span
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-9xl"
            >
              {creators[currentIndex].emoji}
            </motion.span>
          </div>

          <div className="text-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 mb-1">{creators[currentIndex].name}</h3>
            <p className="text-gray-500 text-sm mb-3">{creators[currentIndex].role}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Monthly Earnings</p>
                <p className="text-lg font-bold text-green-600">{creators[currentIndex].earnings}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Fans</p>
                <p className="text-lg font-bold text-blue-600">{creators[currentIndex].fans}</p>
              </div>
            </div>

            <button className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl hover:scale-105">
              Join Now
            </button>
          </div>

          <div className="flex justify-center space-x-2">
            {creators.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex ? 'w-8 bg-red-500' : 'w-1.5 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="absolute -top-4 -right-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
      >
        🔥 Top Earner
      </motion.div>

      <motion.div
        animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
        className="absolute -bottom-4 -left-4 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
      >
        ⚡ 80% Payout
      </motion.div>
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { signup, signInWithGoogle, signInWithTwitter, 
  signInWithFacebook, fetchUserProfile } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    agreeToTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);

  const getPasswordStrength = (password) => {
    if (password.length === 0) return { strength: 0, label: '', color: '' };
    if (password.length < 6) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    if (password.length < 10) return { strength: 2, label: 'Medium', color: 'bg-yellow-500' };
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)) {
      return { strength: 3, label: 'Strong', color: 'bg-green-500' };
    }
    return { strength: 2, label: 'Medium', color: 'bg-yellow-500' };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all required fields');
      setIsLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (!formData.agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      setIsLoading(false);
      return;
    }

    try {
      await signup(formData.email, formData.password, {
        phoneNumber: formData.phoneNumber
      });
      
      setShowVerificationMessage(true);
      setIsLoading(false);
      
    } catch (err) {
      console.error('Registration error:', err);
      
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('This email is already registered. Please login instead.');
          break;
        case 'auth/invalid-email':
          setError('Invalid email address');
          break;
        case 'auth/weak-password':
          setError('Password is too weak. Please choose a stronger password.');
          break;
        case 'auth/operation-not-allowed':
          setError('Email/password accounts are not enabled. Please contact support.');
          break;
        default:
          setError('Registration failed. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
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
    console.error('Google signup error:', err);
    setError(err.message || 'Failed to sign up with Google. Please try again.');
    setIsLoading(false);
  }
};

const handleTwitterSignup = async () => {
  setError('');
  setIsLoading(true);
  
  try {
    const result = await signInWithTwitter();
    const userProfileData = await fetchUserProfile(result.user.uid);
    
    if (!userProfileData?.profileCompleted) {
      navigate('/complete-profile');
    } else {
      navigate('/feed');
    }
  } catch (err) {
    console.error('Twitter signup error:', err);
    setError(err.message || 'Failed to sign up with Twitter. Please try again.');
    setIsLoading(false);
  }
};

  if (showVerificationMessage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-pink-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
          <p className="text-gray-600 mb-6">
            We've sent a verification link to <strong>{formData.email}</strong>. 
            Please check your inbox and click the link to verify your account.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              💡 <strong>Tip:</strong> Check your spam folder if you don't see the email within a few minutes.
            </p>
          </div>
          <button
            onClick={() => navigate('/complete-profile')}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold transition shadow-sm mb-3"
          >
            Continue to Setup Profile
          </button>
          <p className="text-sm text-gray-500">
            Complete your profile to get started
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-pink-50 flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
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
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100 max-h-[85vh] overflow-y-auto"
          >
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Your Account</h1>
              <p className="text-gray-600 text-sm">Start your journey with unlukt</p>
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
                  Email address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter your email"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition text-sm"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Create a password"
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition text-sm"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${passwordStrength.color} transition-all duration-300`}
                          style={{ width: `${(passwordStrength.strength / 3) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{passwordStrength.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">At least 6 characters recommended</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition text-sm"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>
                {formData.confirmPassword && (
                  <div className="mt-2 flex items-center space-x-2">
                    {formData.password === formData.confirmPassword ? (
                      <>
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-green-600">Passwords match</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-600">Passwords don't match</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="text-gray-400">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="Enter phone number"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition text-sm"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex items-start space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={formData.agreeToTerms}
                  onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                  className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500 mt-0.5"
                  disabled={isLoading}
                />
                <label htmlFor="terms" className="text-xs text-gray-600">
                  I agree to the{' '}
                  <button type="button" className="text-red-500 hover:text-red-600 font-medium">
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button type="button" className="text-red-500 hover:text-red-600 font-medium">
                    Privacy Policy
                  </button>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold transition shadow-sm mt-6 flex items-center justify-center space-x-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <span>Sign Up</span>
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

            {/* ✅ SOCIAL AUTH BUTTONS */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleGoogleSignup}
                disabled={isLoading}
                className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-red-300 py-3 rounded-lg transition flex items-center justify-center disabled:opacity-50 shadow-sm"
                title="Continue with Google"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </button>
              
              <button
                onClick={handleTwitterSignup}
                disabled={isLoading}
                className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-red-300 py-3 rounded-lg transition flex items-center justify-center disabled:opacity-50 shadow-sm"
                title="Continue with Twitter"
              >
                <svg className="w-5 h-5" fill="#1DA1F2" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                </svg>
              </button>
              
              <button
                onClick={() => alert('Facebook signup coming soon! Configure Facebook OAuth in Firebase Console.')}
                disabled={isLoading}
                className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-red-300 py-3 rounded-lg transition flex items-center justify-center disabled:opacity-50 shadow-sm"
                title="Continue with Facebook (Coming Soon)"
              >
                <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </button>
            </div>

            <div className="text-center mt-6">
              <p className="text-gray-600 text-sm">
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="font-semibold text-red-500 hover:text-red-600 transition"
                  disabled={isLoading}
                >
                  Log in
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

      {/* Right Side - Animated Card (Hidden on mobile) */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="hidden lg:flex flex-1 items-center justify-center p-8 bg-gradient-to-br from-red-100 to-orange-100"
      >
        <AnimatedCreatorCard />
      </motion.div>
    </div>
  );
}
