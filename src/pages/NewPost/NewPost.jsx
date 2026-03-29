// src/pages/NewPost/NewPost.jsx - WITH CLOUDINARY + REQUIRED SFW/NSFW

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Image as ImageIcon,
  Video,
  Lock,
  Globe,
  DollarSign,
  X,
  Crown,
  Loader2,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useAuth } from '../../hooks/useAuth';
import { createPost } from '../../services/postService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';

export default function NewPost() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile, isCreator } = useUserProfile();

  const [caption, setCaption] = useState('');
  const [price, setPrice] = useState('');
  const [visibility, setVisibility] = useState('subscribers');

  const [mediaType, setMediaType] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const [tags, setTags] = useState('');

  // ✅ NEW: REQUIRED content rating
  const [contentRating, setContentRating] = useState(''); // '' | 'sfw' | 'nsfw'
  const [showRatingHelp, setShowRatingHelp] = useState(true);

  const fileInputRef = useRef(null);

  // Redirect non-creators
  useEffect(() => {
    if (profile && !isCreator) {
      navigate('/become-creator', { 
        state: { message: 'You need to be a creator to post content' } 
      });
    }
  }, [profile, isCreator, navigate]);

  const handleMediaTypeSelect = (type) => {
    setMediaType(type);

    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'image'
        ? 'image/jpeg,image/png,image/gif,image/webp'
        : 'video/mp4,video/quicktime,video/x-msvideo';
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      alert('File is too large. Maximum size is 50MB.');
      return;
    }

    const fileType = file.type.split('/')[0];
    if ((mediaType === 'image' && fileType !== 'image') ||
        (mediaType === 'video' && fileType !== 'video')) {
      alert('Invalid file type selected.');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveMedia = () => {
    setSelectedFile(null);
    setPreview(null);
    setMediaType(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canPost =
    (caption.trim() || selectedFile) &&
    !uploading &&
    contentRating !== '' &&
    (visibility !== 'paid' || (price && parseFloat(price) > 0));

  const handleSubmit = async () => {
    if (!isCreator) {
      alert('Only creators can post content');
      return;
    }

    // ✅ REQUIRE rating
    if (!contentRating) {
      alert('Please select SFW or NSFW before posting.');
      return;
    }

    if (!caption.trim() && !selectedFile) {
      alert('Please add a caption or media');
      return;
    }

    if (visibility === 'paid' && (!price || parseFloat(price) <= 0)) {
      alert('Please set a valid price for paid content');
      return;
    }

    try {
      setUploading(true);
      console.log('Creating post...');

      let mediaUrls = [];

      // Upload media to Bunny if file is selected
      if (selectedFile) {
        console.log('📤 Uploading media to Bunny...');
        console.log('🔍 Selected file type:', selectedFile.type);
        console.log('🔍 Selected file name:', selectedFile.name);
        
        // Show progress manually (since uploadToBunny doesn't support progress callback)
       setUploadProgress(30);

        const uploadResult = await uploadMedia(selectedFile, { 
          folder: 'posts', 
          contentType: 'media' 
        });

        setUploadProgress(100);

        console.log('✅ Full upload result:', uploadResult);

        const cdnUrl = uploadResult.cdnUrl; // ✅ FIXED: was uploadResult.url

        const isVideo = selectedFile.type.startsWith('video') || 
                        uploadResult.mimeType?.startsWith('video/') ||
                        /\.(mp4|mov|avi|webm|mkv)$/i.test(cdnUrl);

        console.log('✅ CDN URL:', cdnUrl);
        console.log('✅ Detected type:', isVideo ? 'video' : 'image');

        if (!cdnUrl) throw new Error('Upload succeeded but no CDN URL returned');

        mediaUrls.push({
          url: cdnUrl,
          type: isVideo ? 'video' : 'image',
          publicId: uploadResult.objectPath || '',
          width: 0,
          height: 0,
          duration: null
        });

        console.log('✅ Media uploaded to:', cdnUrl);
      }

      // Prepare post data
      const postData = {
        content: caption,
        images: mediaUrls,
        type: visibility === 'public' ? 'free' : visibility,
        price: visibility === 'paid' ? parseFloat(price) : 0,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        contentRating: contentRating
      };

      console.log('📝 Creating post with data:', postData);

      const newPost = await createPost(currentUser.uid, postData);

      console.log('✅ Post created:', newPost);
      setShowSuccess(true);
      setTimeout(() => navigate('/feed'), 2200);
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Show loading while checking creator status
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error if not a creator
  if (!isCreator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-200 p-8 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Crown className="w-10 h-10 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Creator Account Required</h2>
          <p className="text-gray-600 mb-6">
            You need to be a verified creator to post content. Apply now to start sharing your content with fans!
          </p>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/feed')}
              className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition"
            >
              Go Back
            </button>
            <button
              onClick={() => navigate('/become-creator')}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg font-semibold transition"
            >
              Become Creator
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    {/* ── Success overlay ───────────────────────────────────────────────── */}
    {showSuccess && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="bg-white rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full text-center"
        >
          {/* Animated checkmark */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 bg-gradient-to-br from-rose-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg"
          >
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                strokeLinecap="round" strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Post Published! 🎉</h2>
            <p className="text-gray-500 text-sm mb-5">Your post is live and visible to your audience.</p>

            {/* Visibility badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              visibility === 'public'      ? 'bg-blue-100 text-blue-700'
              : visibility === 'paid'      ? 'bg-amber-100 text-amber-700'
              :                              'bg-rose-100 text-rose-700'
            }`}>
              {visibility === 'public' ? '🌍 Public' : visibility === 'paid' ? `💰 Paid · $${price}` : '🔒 Subscribers Only'}
            </span>

            <p className="text-xs text-gray-400 mt-5">Taking you to your feed...</p>

            {/* Progress bar */}
            <motion.div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 2.0, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    )}

    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/feed')}
              disabled={uploading}
              className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold hidden sm:inline">Back</span>
            </button>

            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Create Post</h1>

            <button
              onClick={handleSubmit}
              disabled={!canPost}
              className={`px-4 sm:px-6 py-2 rounded-lg font-semibold text-sm transition ${
                canPost
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              title={!contentRating ? 'Select SFW or NSFW to continue' : ''}
            >
              {uploading ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Creator Badge */}
        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-xl p-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-500 rounded-full flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Creator Mode</p>
              <p className="text-sm text-gray-600">Share your exclusive content</p>
            </div>
          </div>
        </div>

        {/* ✅ Content Rating (Required) */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content Rating <span className="text-rose-600">*</span>
              </label>
              <p className="text-xs text-gray-500">
                Required. Helps users filter what they want to see.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowRatingHelp(!showRatingHelp)}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              {showRatingHelp ? 'Hide help' : 'Show help'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={() => setContentRating('sfw')}
              disabled={uploading}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition disabled:opacity-50 ${
                contentRating === 'sfw'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="font-semibold text-sm">SFW</span>
            </button>

            <button
              type="button"
              onClick={() => setContentRating('nsfw')}
              disabled={uploading}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition disabled:opacity-50 ${
                contentRating === 'nsfw'
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
              <span className="font-semibold text-sm">NSFW</span>
            </button>
          </div>

          {showRatingHelp && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800 mb-2">Quick guide:</p>
              <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
                <li><b>SFW</b>: normal lifestyle, fitness, selfies, fashion, memes, non-explicit content.</li>
                <li><b>NSFW</b>: explicit nudity, porn-style content, sex acts, or strongly sexual material.</li>
                <li>Please tag correctly — users can toggle NSFW visibility in their feed.</li>
              </ul>

              {!contentRating && (
                <div className="mt-3 text-xs text-rose-600 font-semibold">
                  Select SFW or NSFW to continue.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6"
          >
            <div className="flex items-center space-x-3 mb-2">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="text-sm font-semibold text-blue-900">
                Uploading... {uploadProgress}%
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </motion.div>
        )}

        {/* Media Upload Section */}
        <div className="bg-white rounded-xl sm:rounded-2xl border-2 border-dashed border-gray-300 p-6 sm:p-8 mb-4 sm:mb-6">
          {!preview ? (
            <div className="text-center">
              <div className="flex justify-center space-x-4 mb-6">
                <button
                  onClick={() => handleMediaTypeSelect('image')}
                  disabled={uploading}
                  className="flex flex-col items-center space-y-2 p-4 sm:p-6 bg-rose-50 hover:bg-rose-100 rounded-xl transition disabled:opacity-50"
                >
                  <ImageIcon className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500" />
                  <span className="font-semibold text-sm sm:text-base text-gray-700">Image</span>
                </button>
                <button
                  onClick={() => handleMediaTypeSelect('video')}
                  disabled={uploading}
                  className="flex flex-col items-center space-y-2 p-4 sm:p-6 bg-purple-50 hover:bg-purple-100 rounded-xl transition disabled:opacity-50"
                >
                  <Video className="w-8 h-8 sm:w-10 sm:h-10 text-purple-500" />
                  <span className="font-semibold text-sm sm:text-base text-gray-700">Video</span>
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-2">Click to select media type</p>
              <p className="text-xs text-gray-400">JPG, PNG, GIF, MP4 or MOV. Max 50MB</p>
            </div>
          ) : (
            <div className="relative">
              {mediaType === 'image' ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full rounded-xl object-cover"
                />
              ) : (
                <video
                src={preview}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-xl max-h-96 object-contain bg-black"
              />
              )}

              <button
                onClick={handleRemoveMedia}
                disabled={uploading}
                className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full transition disabled:opacity-50"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              <div className="absolute bottom-3 left-3 bg-black/50 text-white px-3 py-1 rounded-full text-xs">
                {mediaType === 'image' ? '📸 Image' : '🎬 Video'} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Caption</label>
          <div className="relative">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption for your post..."
              rows="4"
              disabled={uploading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 resize-none text-sm sm:text-base disabled:bg-gray-50"
              maxLength={500}
            />
            <div className="absolute bottom-3 right-3 flex items-center space-x-2">
              <span className="text-xs text-gray-400">{caption.length}/500</span>
            </div>
          </div>
        </div>

        {/* Post Settings */}
        <div className="space-y-4">
          {/* Visibility */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Visibility</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setVisibility('public')}
                disabled={uploading}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl border-2 transition disabled:opacity-50 ${
                  visibility === 'public'
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Globe className="w-5 h-5" />
                <span className="font-semibold text-sm">Public</span>
              </button>

              <button
                onClick={() => setVisibility('subscribers')}
                disabled={uploading}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl border-2 transition disabled:opacity-50 ${
                  visibility === 'subscribers'
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Lock className="w-5 h-5" />
                <span className="font-semibold text-sm">Subscribers</span>
              </button>

              <button
                onClick={() => setVisibility('paid')}
                disabled={uploading}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl border-2 transition disabled:opacity-50 ${
                  visibility === 'paid'
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <DollarSign className="w-5 h-5" />
                <span className="font-semibold text-sm">Paid</span>
              </button>
            </div>
          </div>

          {/* Price (if paid) */}
          {visibility === 'paid' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6"
            >
              <label className="block text-sm font-semibold text-gray-700 mb-3">Price</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  disabled={uploading}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-sm sm:text-base disabled:bg-gray-50"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">Set a price for users to unlock this content</p>
            </motion.div>
          )}

          {/* Tags */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Tags (Optional)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="fitness, lifestyle, motivation"
              disabled={uploading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-sm sm:text-base disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-500 mt-2">Separate tags with commas</p>
          </div>
        </div>

        {/* Submit Button (Mobile) */}
        <button
          onClick={handleSubmit}
          disabled={!canPost}
          className={`w-full mt-6 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition shadow-lg ${
            canPost
              ? 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {uploading ? (
            <span className="flex items-center justify-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Creating Post... {uploadProgress}%</span>
            </span>
          ) : (
            contentRating ? 'Create Post' : 'Select SFW/NSFW to Post'
          )}
        </button>
      </div>
    </div>
    </>
  );
}

