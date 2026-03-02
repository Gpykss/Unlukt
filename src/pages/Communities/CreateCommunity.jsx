// src/pages/Communities/CreateCommunity.jsx - Create New Community

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Lock,
  Globe,
  DollarSign,
  FileText,
  Tag,
  CheckCircle,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { createCommunity } from '../../services/communityService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';

const CATEGORIES = [
  'Fitness',
  'Gaming',
  'Art',
  'Music',
  'Fashion',
  'Cooking',
  'Tech',
  'Lifestyle',
  'Business',
  'Education',
  'Photography',
  'Writing'
];

export default function CreateCommunity() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general',
    price: 9.99,
    isPrivate: true,
    rules: ['Be respectful', 'No spam', 'Stay on topic']
  });
  
  const [coverImage, setCoverImage] = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleCoverImageUpload = async (e) => {
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
      setUploading(true);
      setError('');
      
      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
      
      // Upload to Cloudinary
      const result = await uploadMedia(file, 'community-covers', (progress) => {
        console.log(`Upload progress: ${progress}%`);
      });
      
      setCoverImage(result.url);
    } catch (err) {
      console.error('Error uploading cover image:', err);
      setError('Failed to upload cover image');
    } finally {
      setUploading(false);
    }
  };

  const addRule = () => {
    setFormData({
      ...formData,
      rules: [...formData.rules, '']
    });
  };

  const updateRule = (index, value) => {
    const newRules = [...formData.rules];
    newRules[index] = value;
    setFormData({ ...formData, rules: newRules });
  };

  const removeRule = (index) => {
    const newRules = formData.rules.filter((_, i) => i !== index);
    setFormData({ ...formData, rules: newRules });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Community name is required');
      return;
    }

    if (formData.name.length < 3) {
      setError('Community name must be at least 3 characters');
      return;
    }

    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    if (formData.price < 1 || formData.price > 999) {
      setError('Price must be between $1 and $999');
      return;
    }

    try {
      setCreating(true);
      
      const communityData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        isPrivate: formData.isPrivate,
        coverImage: coverImage,
        rules: formData.rules.filter(rule => rule.trim() !== '')
      };

      const newCommunity = await createCommunity(currentUser.uid, communityData);
      
      setSuccess(true);
      
      setTimeout(() => {
        navigate(`/community/${newCommunity.id}`);
      }, 2000);
    } catch (err) {
      console.error('Error creating community:', err);
      setError('Failed to create community. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/communities')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Community</h1>
              <p className="text-sm text-gray-600">Build your exclusive community</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Success Message */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-6 bg-green-50 border border-green-200 rounded-2xl flex items-center space-x-3"
          >
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Community created successfully!</p>
              <p className="text-sm text-green-700">Redirecting to your community...</p>
            </div>
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cover Image */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="relative h-64 bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 group">
              {coverImagePreview ? (
                <img 
                  src={coverImagePreview} 
                  alt="Cover" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl">
                  👥
                </div>
              )}
              
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : (
                  <div className="text-white text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-medium">Upload Cover Image</p>
                    <p className="text-sm opacity-75">Max 10MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              {/* Community Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Community Name *
                </label>
                <div className="relative">
                  <FileText className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Fitness Elite Club"
                    maxLength="50"
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{formData.name.length}/50 characters</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What is your community about?"
                  rows="4"
                  maxLength="300"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition resize-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">{formData.description.length}/300 characters</p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition appearance-none bg-white"
                  >
                    <option value="general">General</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat.toLowerCase()}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing & Privacy */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Privacy</h2>
            
            <div className="space-y-4">
              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Price (USD) *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    min="1"
                    max="999"
                    step="0.01"
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Members will be charged this amount monthly</p>
              </div>

              {/* Privacy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Privacy
                </label>
                <div className="space-y-2">
                  <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-rose-300 transition">
                    <input
                      type="radio"
                      checked={formData.isPrivate === true}
                      onChange={() => setFormData({ ...formData, isPrivate: true })}
                      className="w-4 h-4 text-rose-500 focus:ring-rose-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center space-x-2">
                        <Lock className="w-5 h-5 text-gray-600" />
                        <span className="font-medium text-gray-900">Private</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Only members can see posts and content
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-rose-300 transition">
                    <input
                      type="radio"
                      checked={formData.isPrivate === false}
                      onChange={() => setFormData({ ...formData, isPrivate: false })}
                      className="w-4 h-4 text-rose-500 focus:ring-rose-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center space-x-2">
                        <Globe className="w-5 h-5 text-gray-600" />
                        <span className="font-medium text-gray-900">Public</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Anyone can see posts, but only members can participate
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Community Rules */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Community Rules</h2>
              <button
                type="button"
                onClick={addRule}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition"
              >
                Add Rule
              </button>
            </div>
            
            <div className="space-y-3">
              {formData.rules.map((rule, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className="text-gray-500 font-medium">{index + 1}.</span>
                  <input
                    type="text"
                    value={rule}
                    onChange={(e) => updateRule(index, e.target.value)}
                    placeholder="Enter a rule..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                  />
                  {formData.rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRule(index)}
                      className="p-2 hover:bg-red-50 rounded-lg transition"
                    >
                      <X className="w-5 h-5 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/communities')}
              className="px-6 py-3 text-gray-700 hover:text-gray-900 font-semibold transition"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || uploading}
              className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Community</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}