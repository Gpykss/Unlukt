// src/pages/Profile/CompleteProfile.jsx - FIXED AVATAR HANDLING

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, X, User, MapPin, FileText, Sparkles, Camera, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { updateUserProfile, getUserByUsername } from '../../services/firestoreService';

const avatarEmojis = ['👤', '😊', '🎨', '🎭', '🎪', '🎬', '🎮', '🎯', '🎲', '🎸', '🎹', '🎤', '🎧', '🎼', '🎵', '💎', '👑', '🔥', '⚡', '✨', '🌟', '💫', '🌈', '🦄', '🐉', '🦋', '🌸', '🌺', '🌻', '🌷'];

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { currentUser, fetchUserProfile, userProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  
  // ✅ Initialize avatar - convert URL to emoji if needed
  const getInitialAvatar = () => {
    const currentAvatar = userProfile?.avatar || '👤';
    // If it's a URL (starts with http), use default emoji instead
    if (typeof currentAvatar === 'string' && currentAvatar.startsWith('http')) {
      return '👤';
    }
    return currentAvatar;
  };

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    location: '',
    avatar: getInitialAvatar()
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const checkUsernameAvailability = async (username) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    try {
      const existingUser = await getUserByUsername(username);
      setUsernameAvailable(!existingUser);
    } catch (error) {
      console.error('Error checking username:', error);
    }
  };

  const handleUsernameChange = (e) => {
    let value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);

    setFormData({ ...formData, username: value });
    checkUsernameAvailability(value);
  };

  const handleNext = () => {
    if (currentStep === 1 && (!formData.username || !usernameAvailable)) {
      setError('Please choose an available username');
      return;
    }
    setError('');
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!formData.username) {
      setError('Username is required');
      setIsLoading(false);
      return;
    }

    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      setIsLoading(false);
      return;
    }

    if (!usernameAvailable) {
      setError('Username is already taken');
      setIsLoading(false);
      return;
    }

    try {
      await updateUserProfile(currentUser.uid, {
        username: formData.username,
        bio: formData.bio || '',
        location: formData.location || '',
        avatar: formData.avatar,
        profileCompleted: true
      });

      await fetchUserProfile(currentUser.uid);
      
      // Success animation delay
      await new Promise(resolve => setTimeout(resolve, 800));
      navigate('/feed');
    } catch (err) {
      console.error('Error completing profile:', err);
      setError('Failed to complete profile. Please try again.');
      setIsLoading(false);
    }
  };

  const progress = (currentStep / 3) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-pink-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -top-20 -right-20 w-64 h-64 bg-red-200 rounded-full opacity-20 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [90, 0, 90],
          }}
          transition={{ duration: 15, repeat: Infinity }}
          className="absolute -bottom-20 -left-20 w-80 h-80 bg-orange-200 rounded-full opacity-20 blur-3xl"
        />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center mb-4">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-12 h-12 text-red-500" />
            </motion.div>
          </div>
          <h1 className="text-4xl font-black text-gray-900 mb-2 flex items-center justify-center gap-2">
            Welcome to{' '}
            <span className="flex items-center">
              Unl<LockKeyhole className="w-8 h-8 text-red-600 mx-1" />kt
            </span>
          </h1>
          <p className="text-gray-600">Let's set up your profile in 3 easy steps</p>
        </motion.div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2 text-sm font-medium text-gray-600">
            <span>Step {currentStep} of 3</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-white/50 rounded-full overflow-hidden backdrop-blur-sm">
            <motion.div
              className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/50"
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2"
            >
              <X className="w-5 h-5" />
              {error}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* Step 1: Username */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <User className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Username</h2>
                  <p className="text-gray-600 text-sm">This is how others will find you</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Username *
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg font-semibold">@</span>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={handleUsernameChange}
                      placeholder="yourname"
                      autoFocus
                      className="w-full pl-10 pr-12 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-900 text-lg placeholder-gray-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                    />
                    {formData.username && (
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                        {usernameAvailable === null ? (
                          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        ) : usernameAvailable ? (
                          <Check className="w-6 h-6 text-green-500" />
                        ) : (
                          <X className="w-6 h-6 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  
                  {formData.username && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-sm mt-2 font-medium flex items-center gap-2 ${
                        usernameAvailable === null ? 'text-gray-500' :
                        usernameAvailable ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {usernameAvailable === null ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Checking availability...
                        </>
                      ) : usernameAvailable ? (
                        <>
                          <Check className="w-4 h-4" />
                          Username available!
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4" />
                          Username taken
                        </>
                      )}
                    </motion.p>
                  )}

                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs text-blue-800">
                      <strong>Tips:</strong> Use 3-20 characters. Only letters, numbers, and underscores allowed.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Avatar - FIXED */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Camera className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Avatar</h2>
                  <p className="text-gray-600 text-sm">Pick an emoji that represents you</p>
                </div>

                {/* ✅ FIXED: Avatar Display */}
                <div className="text-center">
                  <div className="w-32 h-32 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-white">
                    <span className="text-6xl select-none">{formData.avatar}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                    className="px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-full font-semibold transition-all shadow-lg"
                  >
                    {showAvatarPicker ? 'Close Picker' : 'Change Avatar'}
                  </button>
                </div>

                <AnimatePresence>
                  {showAvatarPicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-6 gap-3 p-4 bg-gray-50 rounded-2xl max-h-64 overflow-y-auto"
                    >
                      {avatarEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, avatar: emoji });
                            setShowAvatarPicker(false);
                          }}
                          className={`aspect-square rounded-xl text-3xl hover:scale-110 transition-transform ${
                            formData.avatar === emoji ? 'bg-red-100 ring-2 ring-red-500' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Step 3: Bio & Location */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <FileText className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Tell Us About You</h2>
                  <p className="text-gray-600 text-sm">Optional but helps people know you better</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Bio <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value.slice(0, 150) })}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={150}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-2">{formData.bio.length}/150 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="City, Country"
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex gap-4 mt-8">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isLoading}
                className="flex-1 px-6 py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-2xl font-semibold transition-all disabled:opacity-50"
              >
                Back
              </button>
            )}
            
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 1 && (!formData.username || !usernameAvailable)}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-2xl font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-2xl font-semibold transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating Profile...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Complete Setup
                  </>
                )}
              </button>
            )}
          </div>

          {/* Profile Preview */}
          {currentStep === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-gray-100"
            >
              <p className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">Preview</p>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">{formData.avatar}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">@{formData.username}</h3>
                  {formData.bio && <p className="text-gray-600 text-sm mt-1">{formData.bio}</p>}
                  {formData.location && (
                    <p className="text-gray-500 text-sm mt-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {formData.location}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6 text-sm text-gray-600"
        >
          You can always change this later in settings
        </motion.p>
      </div>
    </div>
  );
}