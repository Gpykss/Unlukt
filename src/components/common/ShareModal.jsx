// Example: How to add share functionality to your PostCard component

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { sharePost } from '../../services/postService';

// In your PostCard component, add this handler:

const handleShare = async (post) => {
  try {
    // First, increment share count in database
    await sharePost(post.id);
    
    // Build share URL
    const shareUrl = `${window.location.origin}/post/${post.id}`;
    const shareText = `Check out this post by ${post.creator?.name || 'a creator'}!`;
    
    // Check if Web Share API is available (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: post.caption || 'Check out this post!',
          url: shareUrl
        });
        console.log('✅ Shared successfully');
      } catch (error) {
        // User cancelled share
        if (error.name !== 'AbortError') {
          console.error('Share failed:', error);
          // Fallback to clipboard
          copyToClipboard(shareUrl);
        }
      }
    } else {
      // Desktop: Copy to clipboard
      copyToClipboard(shareUrl);
    }
  } catch (error) {
    console.error('Error sharing post:', error);
    alert('Failed to share post');
  }
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    alert('Link copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('Link copied to clipboard!');
  });
};

// Then in your JSX, add a Share button:

<button
  onClick={() => handleShare(post)}
  className="flex items-center space-x-2 text-gray-600 hover:text-rose-500 transition"
>
  <Share2 className="w-5 h-5" />
  <span>{post.shares || 0}</span>
</button>

// ============================================
// COMPLETE EXAMPLE - Share Modal Component
// ============================================

export function ShareModal({ post, isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;
  
  const shareUrl = `${window.location.origin}/post/${post.id}`;
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleShareTo = async (platform) => {
    await sharePost(post.id); // Increment share count
    
    const text = encodeURIComponent(`Check out this post by ${post.creator?.name}!`);
    const url = encodeURIComponent(shareUrl);
    
    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      reddit: `https://reddit.com/submit?url=${url}&title=${text}`
    };
    
    window.open(urls[platform], '_blank', 'width=600,height=400');
    onClose();
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Share Post</h3>
        
        {/* Social Media Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => handleShareTo('twitter')}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
          >
            <span>Twitter</span>
          </button>
          <button
            onClick={() => handleShareTo('facebook')}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <span>Facebook</span>
          </button>
          <button
            onClick={() => handleShareTo('whatsapp')}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition"
          >
            <span>WhatsApp</span>
          </button>
          <button
            onClick={() => handleShareTo('telegram')}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-400 hover:bg-blue-500 text-white rounded-lg transition"
          >
            <span>Telegram</span>
          </button>
        </div>
        
        {/* Copy Link */}
        <div className="pt-4 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or copy link
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
