// src/pages/Profile/EditProfile.jsx - FIXED WITH CLOUDINARY AND LOCATION DROPDOWN

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, AtSign, FileText, Mail, Phone, Loader2, CheckCircle, Camera, X, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { updateUserProfile, checkUsernameAvailability } from '../../services/firestoreService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';

// ✅ Popular cities/countries list
const LOCATIONS = [
  // Nigeria
  'Lagos, Nigeria',
  'Port Harcourt, Nigeria',
  'Abuja, Nigeria',
  'Kano, Nigeria',
  'Ibadan, Nigeria',
  'Enugu, Nigeria',
  'Calabar, Nigeria',
  'Warri, Nigeria',
  
  // USA
  'New York, USA',
  'Los Angeles, USA',
  'Chicago, USA',
  'Houston, USA',
  'Miami, USA',
  'Atlanta, USA',
  
  // UK
  'London, UK',
  'Manchester, UK',
  'Birmingham, UK',
  
  // Other popular cities
  'Dubai, UAE',
  'Toronto, Canada',
  'Sydney, Australia',
  'Singapore',
  'Paris, France',
  'Berlin, Germany',
  'Tokyo, Japan',
  
  // More
  'Custom...'
];

export default function EditProfile() {
  const navigate = useNavigate();
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    bio: '',
    phoneNumber: '',
    location: '',
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
  
  // ✅ NEW: Avatar/Banner upload states
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  
  // ✅ NEW: Location dropdown states
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [customLocation, setCustomLocation] = useState('');
  const [isCustomLocation, setIsCustomLocation] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        username: userProfile.username || '',
        displayName: userProfile.displayName || '',
        bio: userProfile.bio || '',
        phoneNumber: userProfile.phoneNumber || '',
        location: userProfile.location || '',
        socialLinks: userProfile.socialLinks || {
          instagram: '',
          twitter: '',
          tiktok: '',
          website: ''
        }
      });
      setAvatarPreview(userProfile.avatar || null);
      setBannerPreview(userProfile.banner || null);
      
      // Check if location is custom
      if (userProfile.location && !LOCATIONS.includes(userProfile.location)) {
        setIsCustomLocation(true);
        setCustomLocation(userProfile.location);
      }
    }
  }, [userProfile]);

  // Check username availability
  useEffect(() => {
    const checkUsername = async () => {
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
        formData.location !== (userProfile.location || '') ||
        JSON.stringify(formData.socialLinks) !== JSON.stringify(userProfile.socialLinks || {});
      
      setHasChanges(changed);
    }
  }, [formData, userProfile]);

  // ✅ NEW: Handle avatar upload
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    try {
      setUploadingAvatar(true);
      setError('');
      
      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
      
      // Upload to Cloudinary
      const result = await uploadMedia(file, 'avatars', (progress) => {
        console.log(`Avatar upload: ${progress}%`);
      });
      
      // Update user profile
      await updateUserProfile(currentUser.uid, { avatar: result.cdnUrl });
      await fetchUserProfile(currentUser.uid);
      
      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error uploading avatar:', err);
      setError('Failed to upload profile picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ✅ NEW: Handle banner upload
  const handleBannerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    try {
      setUploadingBanner(true);
      setError('');
      
      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setBannerPreview(reader.result);
      };
      reader.readAsDataURL(file);
      
      // Upload to Cloudinary
      const result = await uploadMedia(file, 'banners', (progress) => {
        console.log(`Banner upload: ${progress}%`);
      });
      
      // Update user profile
      await updateUserProfile(currentUser.uid, { banner: result.cdnUrl });
      await fetchUserProfile(currentUser.uid);
      
      setSuccess('Banner updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error uploading banner:', err);
      setError('Failed to upload banner');
    } finally {
      setUploadingBanner(false);
    }
  };

  // ✅ NEW: Handle location selection
  const handleLocationSelect = (location) => {
    if (location === 'Custom...') {
      setIsCustomLocation(true);
      setFormData({ ...formData, location: customLocation });
    } else {
      setIsCustomLocation(false);
      setFormData({ ...formData, location });
    }
    setShowLocationDropdown(false);
  };

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
      const finalLocation = isCustomLocation ? customLocation : formData.location;
      
      await updateUserProfile(currentUser.uid, {
        username: formData.username.toLowerCase(),
        displayName: formData.displayName,
        bio: formData.bio,
        phoneNumber: formData.phoneNumber,
        location: finalLocation,
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
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
        >
          {/* ✅ NEW: Banner Section */}
          <div className="relative h-40 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 group">
            {bannerPreview && (
              <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover" />
            )}
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
                disabled={uploadingBanner}
              />
              {uploadingBanner ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <div className="text-white text-center">
                  <Camera className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm font-medium">Change Banner</p>
                </div>
              )}
            </label>
          </div>

          <div className="p-8">
            {/* Avatar + Name — name placed BELOW avatar row so it's never clipped by banner */}
            <div className="mb-6 pb-6 border-b border-gray-200" style={{ marginTop: '-3rem' }}>
              {/* Avatar row */}
              <div className="flex items-end justify-between mb-3">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-3xl border-4 border-white overflow-hidden shadow-md">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={formData.displayName} className="w-full h-full object-cover" />
                    ) : (
                      formData.displayName.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-full cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
                    {uploadingAvatar ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
                  </label>
                </div>
              </div>
              {/* Name row — always fully visible below avatar */}
              <div>
                <h3 className="font-bold text-gray-900 text-lg">{formData.displayName || 'Your Name'}</h3>
                <p className="text-sm text-gray-500">@{formData.username || 'username'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Hover avatar to change picture · hover banner to change banner</p>
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

                  {/* ✅ NEW: Location Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-10" />
                      
                      {!isCustomLocation ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-left text-gray-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                          >
                            {formData.location || 'Select location...'}
                          </button>
                          
                          {showLocationDropdown && (
                            <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                              {LOCATIONS.map((loc) => (
                                <button
                                  key={loc}
                                  type="button"
                                  onClick={() => handleLocationSelect(loc)}
                                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition text-sm"
                                >
                                  {loc}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={customLocation}
                            onChange={(e) => setCustomLocation(e.target.value)}
                            placeholder="Enter custom location"
                            className="flex-1 pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomLocation(false);
                              setCustomLocation('');
                              setFormData({ ...formData, location: '' });
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
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
          </div>
        </motion.div>
      </div>
    </div>
  );
}