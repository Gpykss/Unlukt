import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, X, Loader2, Lock, Globe } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { createPost } from '../../services/postService';

export default function CreatePost({ onPostCreated }) {
  const { currentUser } = useAuth();
  const { displayName, avatar } = useUserProfile();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [postType, setPostType] = useState('free');
  const [price, setPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!content.trim() && images.length === 0) {
      setError('Please add some content or images');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const postData = {
        content: content.trim(),
        images: images,
        type: postType,
        price: postType === 'premium' ? parseFloat(price) || 0 : 0
      };

      const newPost = await createPost(currentUser.uid, postData);
      
      // Reset form
      setContent('');
      setImages([]);
      setPostType('free');
      setPrice('');

      if (onPostCreated) {
        onPostCreated(newPost);
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 p-4 mb-6"
    >
      {/* Header */}
      <div className="flex items-start space-x-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows="3"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Image Preview */}
      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 grid grid-cols-2 gap-2"
          >
            {images.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-40 object-cover rounded-lg"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post Type Selector */}
      <div className="mb-4 flex items-center space-x-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            value="free"
            checked={postType === 'free'}
            onChange={(e) => setPostType(e.target.value)}
            className="w-4 h-4 text-rose-500"
            disabled={isSubmitting}
          />
          <Globe className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-700">Free Post</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            value="subscribers"
            checked={postType === 'subscribers'}
            onChange={(e) => setPostType(e.target.value)}
            className="w-4 h-4 text-rose-500"
            disabled={isSubmitting}
          />
          <Lock className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-700">Subscribers Only</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            value="premium"
            checked={postType === 'premium'}
            onChange={(e) => setPostType(e.target.value)}
            className="w-4 h-4 text-rose-500"
            disabled={isSubmitting}
          />
          <Lock className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-gray-700">Premium</span>
        </label>

        {postType === 'premium' && (
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price ($)"
            className="w-24 px-3 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-rose-500"
            disabled={isSubmitting}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center space-x-2">
          <label className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={isSubmitting}
            />
            <Image className="w-5 h-5 text-gray-600" />
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || (!content.trim() && images.length === 0)}
          className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Posting...</span>
            </>
          ) : (
            <span>Post</span>
          )}
        </button>
      </div>
    </motion.div>
  );
}