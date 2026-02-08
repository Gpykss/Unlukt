import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, AtSign, FileText, Mail, Phone, Loader2, CheckCircle, Camera, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { updateUserProfile, checkUsernameAvailability } from '../../services/firestoreService';

export default function EditProfile() {
  const navigate = useNavigate();
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    bio: '',
    phoneNumber: '',
    socialLinks: {
      instagram: '',
      twitter: '',
      tiktok: '',
      website: ''
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [usernameError, setUsernameError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        username: userProfile.username || '',
        displayName: userProfile.displayName || '',
        bio: userProfile.bio || '',
        phoneNumber: userProfile.phoneNumber || '',
        socialLinks: userProfile.socialLinks || {
          instagram: '',
          twitter: '',
          tiktok: '',
          website: ''
        }
      });
    }
  }, [userProfile]);

  // Check username availability
  useEffect(() => {
    const checkUsername = async () => {
      // Skip if username hasn't changed
      if (formData.username === userProfile?.username) {
        setUsernameAvailable(true);
        setUsernameError('');
        return;
      }

      if (!formData.username || formData.username.length < 3) {
        setUsernameAvailable(null);
        setUsernameError('');
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(formData.username)) {
        setUsernameAvailable(false);
        setUsernameError('Username can only contain letters, numbers, and underscores');
        return;
      }

      setUsernameChecking(true);
      setUsernameError('');

      try {
        const available = await checkUsernameAvailability(formData.username);
        setUsernameAvailable(available);
        if (!available) {
          setUsernameError('Username is already taken');
        }
      } catch (err) {
        console.error('Error checking username:', err);
      } finally {
        setUsernameChecking(false);
      }
    };

    const debounceTimer = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounceTimer);
  }, [formData.username, userProfile?.username]);

  // Track changes
  useEffect(() => {
    if (userProfile) {
      const changed = 
        formData.username !== (userProfile.username || '') ||
        formData.displayName !== (userProfile.displayName || '') ||
        formData.bio !== (userProfile.bio || '') ||
        formData.phoneNumber !== (userProfile.phoneNumber || '') ||
        JSON.stringify(formData.socialLinks) !== JSON.stringify(userProfile.socialLinks || {});
      
      setHasChanges(changed);
    }
  }, [formData, userProfile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!formData.username || !formData.displayName) {
      setError('Username and display name are required');
      setIsLoading(false);
      return;
    }

    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      setIsLoading(false);
      return;
    }

    if (formData.username !== userProfile?.username && !usernameAvailable) {
      setError('Please choose an available username');
      setIsLoading(false);
      return;
    }

    try {
      await updateUserProfile(currentUser.uid, {
        username: formData.username.toLowerCase(),
        displayName: formData.displayName,
        bio: formData.bio,
        phoneNumber: formData.phoneNumber,
        socialLinks: formData.socialLinks
      });

      await fetchUserProfile(currentUser.uid);
      
      setSuccess('Profile updated successfully!');
      setHasChanges(false);
      
      setTimeout(() => {
        navigate('/settings');
      }, 1500);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/settings')}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center space-x-2"
          >
            <span>←</span>
            <span>Back to Settings</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Profile</h1>
          <p className="text-gray-600 mt-2">Update your profile information</p>
        </div>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        >
          {/* Avatar Section */}
          <div className="flex items-center space-x-6 mb-8 pb-8 border-b border-gray-200">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-3xl">
                {userProfile?.avatar ? (
                  <img 
                    src={userProfile.avatar} 
                    alt={formData.displayName} 
                    className="w-full h-full rounded-full object-cover" 
                  />
                ) : (
                  formData.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow-lg transition">
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{formData.displayName || 'Your Name'}</h3>
              <p className="text-sm text-gray-500">@{formData.username || 'username'}</p>
              <p className="text-xs text-gray-400 mt-1">Click camera icon to change avatar</p>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center space-x-2"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{success}</span>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg"
            >
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              
              <div className="space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username *
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                      placeholder="johndoe"
                      className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                      disabled={isLoading}
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                      {usernameChecking && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
                      {!usernameChecking && usernameAvailable === true && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {!usernameChecking && usernameAvailable === false && (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </div>
                  {usernameError && (
                    <p className="text-xs text-red-600 mt-1">{usernameError}</p>
                  )}
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="John Doe"
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bio
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-4 w-5 h-5 text-gray-400" />
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Tell us about yourself..."
                      rows="4"
                      maxLength="150"
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition resize-none"
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/150 characters</p>
                </div>
              </div>
            </div>

            {/* Contact Section */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
              
              <div className="space-y-4">
                {/* Email (readonly) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={currentUser?.email || ''}
                      className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 cursor-not-allowed"
                      disabled
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Social Links Section */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Social Media</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instagram
                  </label>
                  <input
                    type="text"
                    value={formData.socialLinks.instagram}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      socialLinks: { ...formData.socialLinks, instagram: e.target.value }
                    })}
                    placeholder="@username"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Twitter/X
                  </label>
                  <input
                    type="text"
                    value={formData.socialLinks.twitter}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      socialLinks: { ...formData.socialLinks, twitter: e.target.value }
                    })}
                    placeholder="@username"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    TikTok
                  </label>
                  <input
                    type="text"
                    value={formData.socialLinks.tiktok}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      socialLinks: { ...formData.socialLinks, tiktok: e.target.value }
                    })}
                    placeholder="@username"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    value={formData.socialLinks.website}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      socialLinks: { ...formData.socialLinks, website: e.target.value }
                    })}
                    placeholder="https://yourwebsite.com"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-4 pt-6">
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !hasChanges || (formData.username !== userProfile?.username && !usernameAvailable)}
                className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition flex items-center space-x-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
