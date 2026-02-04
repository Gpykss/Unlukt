// src/components/feed/PostCard.jsx
// COMPLETE PostCard with NOTIFICATIONS + FIXED date handling + Pin & Archive

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  MoreVertical,
  Trash2,
  Send,
  X,
  Check,
  Link as LinkIcon,
  Pin,
  Archive,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { 
  likePost, 
  unlikePost, 
  addComment, 
  getPostComments,
  deletePost,
  sharePost,
  updatePost
} from '../../services/postService';
import { getUserProfile } from '../../services/firestoreService';
import { getPostImage } from '../../utils/imageHelpers';

export default function PostCard({ post, onDelete, showPinnedIndicator = false }) {
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments || 0);
  const [sharesCount, setSharesCount] = useState(post.shares || 0);
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [postCreator, setPostCreator] = useState(null);
  const [loadingCreator, setLoadingCreator] = useState(true);

  // Get the image URL (handles both string URLs and Cloudinary objects)
  const imageUrl = getPostImage(post);

  // Initialize comment count from post
  useEffect(() => {
    setCommentsCount(post.comments || 0);
  }, [post.comments]);

  // Check if user has liked this post
  useEffect(() => {
    if (currentUser && post.likedBy) {
      setIsLiked(post.likedBy.includes(currentUser.uid));
    }
  }, [currentUser, post.likedBy]);

  // Load post creator info
  useEffect(() => {
    loadCreatorInfo();
  }, [post.userId]);

  const loadCreatorInfo = async () => {
    try {
      const creator = await getUserProfile(post.userId);
      setPostCreator(creator);
    } catch (error) {
      console.error('Error loading creator:', error);
    } finally {
      setLoadingCreator(false);
    }
  };

  // ✅ UPDATED: Toggle like with notification support
  const handleLike = async () => {
    if (!currentUser) {
      alert('Please login to like posts');
      return;
    }

    try {
      if (isLiked) {
        await unlikePost(post.id, currentUser.uid);
        setIsLiked(false);
        setLikesCount(prev => prev - 1);
      } else {
        // ✅ Pass post owner ID and current user profile for notifications
        await likePost(
          post.id, 
          currentUser.uid, 
          post.userId,  // Post owner ID for notification
          profile       // Current user profile data for notification
        );
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      alert('Failed to like post');
    }
  };

  // Load comments
  const loadComments = async () => {
    try {
      setLoadingComments(true);
      const fetchedComments = await getPostComments(post.id);
      setComments(fetchedComments);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  // Toggle comments view
  const handleToggleComments = () => {
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  // ✅ Add comment - Already has profile parameter for notifications
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert('Please login to comment');
      return;
    }
    if (!newComment.trim()) return;

    try {
      setPostingComment(true);
      const comment = await addComment(post.id, currentUser.uid, newComment, profile);
      
      // Add comment to local state with optimistic update
      setComments([comment, ...comments]);
      setCommentsCount(prev => (prev || 0) + 1);
      setNewComment('');
      
      console.log('✅ Comment added successfully');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment: ' + error.message);
    } finally {
      setPostingComment(false);
    }
  };

  // Delete post
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await deletePost(post.id);
      if (onDelete) onDelete(post.id);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  // ✅ Toggle pin
  const handleTogglePin = async () => {
    try {
      const newPinnedState = !post.pinned;
      await updatePost(post.id, { pinned: newPinnedState });
      
      alert(newPinnedState ? 'Post pinned to top of profile' : 'Post unpinned');
      setShowMenu(false);
      
      // Reload to re-sort posts
      window.location.reload();
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Failed to toggle pin');
    }
  };

  // ✅ Archive post
  const handleArchive = async () => {
    if (!window.confirm('Archive this post? It will be hidden from your profile and feed.')) return;

    try {
      await updatePost(post.id, { 
        archived: true,
        archivedAt: new Date()
      });
      
      alert('Post archived successfully');
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      console.error('Error archiving post:', error);
      alert('Failed to archive post');
    }
  };

  // ✅ Unarchive post
  const handleUnarchive = async () => {
    if (!window.confirm('Unarchive this post? It will be visible on your profile again.')) return;

    try {
      await updatePost(post.id, { 
        archived: false,
        archivedAt: null
      });
      
      alert('Post unarchived successfully');
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      console.error('Error unarchiving post:', error);
      alert('Failed to unarchive post');
    }
  };

  // Share functionality
  const handleShare = async (platform) => {
    try {
      await sharePost(post.id);
      
      const shareUrl = `${window.location.origin}/post/${post.id}`;
      const shareText = `Check out this post by ${postCreator?.displayName || 'a creator'}!`;
      
      if (platform === 'copy') {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard!');
        setShowShareModal(false);
      } else {
        const text = encodeURIComponent(shareText);
        const url = encodeURIComponent(shareUrl);
        
        const urls = {
          twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
          whatsapp: `https://wa.me/?text=${text}%20${url}`,
        };
        
        window.open(urls[platform], '_blank', 'width=600,height=400');
        setShowShareModal(false);
      }
    } catch (error) {
      console.error('Error sharing post:', error);
      alert('Failed to share post');
    }
  };

  // IMPROVED formatDate function to handle all date formats
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    
    try {
      let date;
      
      // Handle serverTimestamp placeholder (before it's resolved)
      if (timestamp._methodName === 'serverTimestamp') {
        return 'Just now';
      }
      
      // Handle Firestore Timestamp
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      }
      // Handle JavaScript Date object
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Handle timestamp with seconds property (Firestore Timestamp object)
      else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      // Handle Unix timestamp (number)
      else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      }
      // Handle ISO string
      else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      }
      // Unknown format
      else {
        console.warn('Unknown timestamp format:', timestamp);
        return 'Recently';
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', timestamp);
        return 'Recently';
      }
      
      const now = new Date();
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
      return 'Recently';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
    >
      {/* Post Header */}
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (postCreator?.username) {
                window.location.href = `/creator/${postCreator.username}`;
              }
            }}
            className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition"
          >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-semibold">
            {loadingCreator ? (
              '...'
            ) : postCreator?.avatar ? (
              <img src={postCreator.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              postCreator?.displayName?.charAt(0).toUpperCase() || 'U'
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 hover:text-rose-500 transition">
              {postCreator?.displayName || 'Loading...'}
            </p>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500">{formatDate(post.createdAt)}</p>
              {showPinnedIndicator && post.pinned && (
                <div className="flex items-center space-x-1 text-rose-500 text-xs font-medium">
                  <Pin className="w-3 h-3 fill-rose-500" />
                  <span>Pinned</span>
                </div>
              )}
            </div>
          </div>
        </div>
                  
          {/* Menu */}
          {currentUser?.uid === post.userId && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
              
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                    {post.archived ? (
                      // Archived post options
                      <>
                        <button
                          onClick={handleUnarchive}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Unarchive Post</span>
                        </button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={handleDelete}
                          className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Permanently</span>
                        </button>
                      </>
                    ) : (
                      // Active post options
                      <>
                        <button
                          onClick={handleTogglePin}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                        >
                          <Pin className="w-4 h-4" />
                          <span>{post.pinned ? 'Unpin from Profile' : 'Pin to Profile'}</span>
                        </button>
                        <button
                          onClick={handleArchive}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                        >
                          <Archive className="w-4 h-4" />
                          <span>Archive Post</span>
                        </button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={handleDelete}
                          className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Post</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Post Content */}
        {post.content && (
          <p className="text-gray-800 mb-4 whitespace-pre-wrap">{post.content}</p>
        )}

        {/* Pinned Badge */}
        {showPinnedIndicator && post.pinned && (
          <div className="mb-4 inline-flex items-center space-x-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-sm font-medium">
            <Pin className="w-4 h-4" />
            <span>Pinned Post</span>
          </div>
        )}

        {/* Archived Badge */}
        {showPinnedIndicator && post.archived && (
          <div className="mb-4 inline-flex items-center space-x-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 text-sm font-medium">
            <Archive className="w-4 h-4" />
            <span>Archived</span>
          </div>
        )}

        {/* Post Images */}
        {imageUrl && (
          <div className="mb-4 rounded-lg overflow-hidden">
            <img 
              src={imageUrl} 
              alt="Post" 
              className="w-full h-auto object-cover"
              onError={(e) => {
                console.error('Failed to load image:', imageUrl);
                e.target.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4 sm:space-x-6">
            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center space-x-2 transition ${
                isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="font-medium">{likesCount}</span>
            </button>

            {/* Comment */}
            <button
              onClick={handleToggleComments}
              className="flex items-center space-x-2 text-gray-600 hover:text-blue-500 transition"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="font-medium">{commentsCount}</span>
            </button>

            {/* Share */}
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center space-x-2 text-gray-600 hover:text-green-500 transition"
            >
              <Share2 className="w-5 h-5" />
              <span className="font-medium">{sharesCount}</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {/* Add Comment Form */}
            {currentUser && (
              <form onSubmit={handleAddComment} className="mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-sm font-semibold">
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      profile?.displayName?.charAt(0).toUpperCase() || 'U'
                    )}
                  </div>
                  <div className="flex-1 flex items-center space-x-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500"
                      disabled={postingComment}
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim() || postingComment}
                      className="p-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Comments List */}
            {loadingComments ? (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No comments yet</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {comment.userName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-lg p-3">
                      <p className="font-semibold text-sm text-gray-900">{comment.userName}</p>
                      <p className="text-gray-700 text-sm mt-1">{comment.text}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(comment.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowShareModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Share Post</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => handleShare('twitter')}
                className="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition"
              >
                Twitter
              </button>
              <button
                onClick={() => handleShare('facebook')}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
              >
                Facebook
              </button>
              <button
                onClick={() => handleShare('whatsapp')}
                className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition"
              >
                WhatsApp
              </button>
              <button
                onClick={() => handleShare('copy')}
                className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition flex items-center justify-center space-x-2"
              >
                <LinkIcon className="w-4 h-4" />
                <span>Copy Link</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}