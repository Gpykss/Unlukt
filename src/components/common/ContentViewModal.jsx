// src/components/common/ContentViewModal.jsx - COMPLETE WITH ALL FEATURES

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark,
  Send,
  DollarSign,
  MoreVertical,
  Trash2,
  Edit,
  EyeOff,
  TrendingUp,
  Save,
  Loader2
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
import { RotateCcw, Archive } from 'lucide-react';

export default function ContentViewModal({ isOpen, onClose, post, onPostUpdate }) {
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [postCreator, setPostCreator] = useState(null);
  const [isArchived, setIsArchived] = useState(false);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Boost modal
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boostDuration, setBoostDuration] = useState('7');
  const [boostBudget, setBoostBudget] = useState('10');

  // Initialize likes and check if user liked
  useEffect(() => {
    if (post) {
      setLikesCount(post.likes || 0);
      setCommentsCount(post.comments || 0);
      setEditedContent(post.content || '');
      setIsArchived(post.archived || false);
      
      if (currentUser && post.likedBy) {
        setIsLiked(post.likedBy.includes(currentUser.uid));
      }
    }
  }, [post, currentUser]);

  // Load post creator
  useEffect(() => {
    if (post && post.userId) {
      loadPostCreator();
    }
  }, [post]);

  // Load comments when modal opens
  useEffect(() => {
    if (isOpen && post) {
      loadComments();
    }
  }, [isOpen, post]);

  const loadPostCreator = async () => {
    try {
      const creator = await getUserProfile(post.userId);
      setPostCreator(creator);
    } catch (error) {
      console.error('Error loading creator:', error);
    }
  };

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
        await likePost(post.id, currentUser.uid);
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleCommentSubmit = async (e) => {
    e?.preventDefault();
    
    if (!currentUser) {
      alert('Please login to comment');
      return;
    }
    
    if (!comment.trim()) return;

    try {
      setPostingComment(true);
      const newComment = await addComment(post.id, currentUser.uid, comment, profile);
      setComments([newComment, ...comments]);
      setCommentsCount(prev => prev + 1);
      setComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment');
    } finally {
      setPostingComment(false);
    }
  };

  // ✅ EDIT POST
  const handleEditPost = () => {
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleSaveEdit = async () => {
    if (!editedContent.trim()) {
      alert('Post content cannot be empty');
      return;
    }

    try {
      setSaving(true);
      await updatePost(post.id, { content: editedContent.trim() });
      
      // Update local post data
      post.content = editedContent.trim();
      
      if (onPostUpdate) {
        onPostUpdate(post);
      }
      
      setIsEditing(false);
      alert('Post updated successfully!');
    } catch (error) {
      console.error('Error updating post:', error);
      alert('Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(post.content || '');
    setIsEditing(false);
  };

  // ✅ ARCHIVE POST (Hide from profile and feed, move to archive)
  const handleArchive = async () => {
    if (!window.confirm('Archive this post? It will be hidden from your profile and feed, but you can view it in your Archive.')) {
      return;
    }

    try {
      await updatePost(post.id, { 
        archived: true,
        archivedAt: new Date()
      });
      
      setIsArchived(true);
      
      if (onPostUpdate) {
        onPostUpdate({ ...post, archived: true, archivedAt: new Date() });
      }
      
      setShowMenu(false);
      alert('Post archived successfully. View it in your Archive.');
      onClose();
    } catch (error) {
      console.error('Error archiving post:', error);
      alert('Failed to archive post');
    }
  };

  // ✅ UNARCHIVE POST
  const handleUnarchive = async () => {
    if (!window.confirm('Unarchive this post? It will be visible on your profile and feed again.')) {
      return;
    }

    try {
      await updatePost(post.id, { 
        archived: false,
        archivedAt: null
      });
      
      setIsArchived(false);
      
      if (onPostUpdate) {
        onPostUpdate({ ...post, archived: false, archivedAt: null });
      }
      
      setShowMenu(false);
      alert('Post unarchived successfully');
      onClose();
    } catch (error) {
      console.error('Error unarchiving post:', error);
      alert('Failed to unarchive post');
    }
  };

  // ✅ BOOST POST
  const handleBoostPost = () => {
    setShowBoostModal(true);
    setShowMenu(false);
  };

  const handleConfirmBoost = async () => {
    try {
      // Calculate boost end date
      const boostEndDate = new Date();
      boostEndDate.setDate(boostEndDate.getDate() + parseInt(boostDuration));

      await updatePost(post.id, {
        boosted: true,
        boostEndDate: boostEndDate,
        boostBudget: parseFloat(boostBudget)
      });

      setShowBoostModal(false);
      alert(`Post boosted for ${boostDuration} days with $${boostBudget} budget!`);
      
      if (onPostUpdate) {
        onPostUpdate({ 
          ...post, 
          boosted: true, 
          boostEndDate, 
          boostBudget: parseFloat(boostBudget) 
        });
      }
    } catch (error) {
      console.error('Error boosting post:', error);
      alert('Failed to boost post');
    }
  };

  // ✅ DELETE POST
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) {
      return;
    }

    try {
      await deletePost(post.id);
      alert('Post deleted successfully');
      onClose();
      
      // Refresh the page to update the grid
      if (onPostUpdate) {
        onPostUpdate(null); // Signal deletion
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  // ✅ SHARE POST
  const handleShare = async () => {
    try {
      await sharePost(post.id);
      
      const shareUrl = `${window.location.origin}/post/${post.id}`;
      const shareText = `Check out this post by ${postCreator?.displayName || 'a creator'}!`;
      
      if (navigator.share) {
        await navigator.share({
          title: shareText,
          text: post.content || shareText,
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
  };

  if (!isOpen || !post) return null;

  const isOwnPost = currentUser?.uid === post.userId;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" 
        onClick={onClose}
      >
        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl overflow-hidden max-w-6xl w-full h-[90vh] flex flex-col md:flex-row"
        >
          {/* Left Side - Image/Video */}
          <div className="flex-1 bg-black flex items-center justify-center relative">
            <div className="w-full h-full flex items-center justify-center p-4">
              {post.images && post.images.length > 0 ? (
                <img 
                  src={post.images[0]} 
                  alt="Post" 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-9xl">📸</span>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition z-10"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Right Side - Details & Comments */}
          <div className="w-full md:w-96 flex flex-col bg-white">
            {/* Creator Info */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div 
                onClick={() => {
                  if (postCreator?.username) {
                    window.location.href = `/creator/${postCreator.username}`;
                  }
                }}
                className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-2xl overflow-hidden">
                  {postCreator?.photoURL || postCreator?.avatar ? (
                    <img src={postCreator.photoURL || postCreator.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    postCreator?.displayName?.charAt(0).toUpperCase() || '👤'
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <h3 className="font-bold text-gray-900 hover:text-rose-500 transition">
                      {postCreator?.displayName || 'Loading...'}
                    </h3>
                    {postCreator?.verified && (
                      <span className="text-blue-500">✓</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    @{postCreator?.username || 'creator'}
                  </p>
                </div>
              </div>
              
              {/* Three Dot Menu */}
              {isOwnPost && (
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
                        {isArchived ? (
                          // ✅ ARCHIVED POST OPTIONS
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
                              className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete Permanently</span>
                            </button>
                          </>
                        ) : (
                          // ✅ ACTIVE POST OPTIONS
                          <>
                            <button
                              onClick={handleEditPost}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                            >
                              <Edit className="w-4 h-4" />
                              <span>Edit Post</span>
                            </button>
                            <button
                              onClick={handleArchive}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                            >
                              <Archive className="w-4 h-4" />
                              <span>Archive Post</span>
                            </button>
                            <button
                              onClick={handleBoostPost}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                            >
                              <TrendingUp className="w-4 h-4" />
                              <span>Boost Post</span>
                            </button>
                            <div className="border-t border-gray-200 my-1"></div>
                            <button
                              onClick={handleDelete}
                              className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
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

            {/* Caption - Edit Mode or View Mode */}
            <div className="p-4 border-b border-gray-200">
              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
                    rows={4}
                    placeholder="Write your caption..."
                  />
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-700 whitespace-pre-wrap">{post.content || 'No caption'}</p>
                  <p className="text-sm text-gray-500 mt-2">{formatDate(post.createdAt)}</p>
                  {post.boosted && (
                    <div className="mt-2 inline-flex items-center space-x-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                      <TrendingUp className="w-3 h-3" />
                      <span>Boosted</span>
                    </div>
                  )}
                  {isArchived && (
                    <div className="mt-2 inline-flex items-center space-x-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                      <Archive className="w-3 h-3" />
                      <span>Archived</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Comments Section */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingComments ? (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0">
                      {comment.userName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-50 rounded-2xl px-4 py-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{comment.userName}</span>
                          <span className="text-gray-500 text-xs">{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="text-gray-700 text-sm">{comment.text}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions Bar */}
            <div className="border-t border-gray-200 p-4 space-y-3">
              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleLike}
                    className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}
                  >
                    <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
                  </button>
                  <button className="text-gray-600 hover:text-rose-500 transition">
                    <MessageCircle className="w-6 h-6" />
                  </button>
                  <button onClick={handleShare} className="text-gray-600 hover:text-rose-500 transition">
                    <Share2 className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex items-center space-x-4">
                  <button 
                    className="bg-rose-500 hover:bg-rose-600 text-white p-2 rounded-full transition"
                    title="Send Tip"
                  >
                    <DollarSign className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setIsSaved(!isSaved)}
                    className={`transition ${isSaved ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}
                  >
                    <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-rose-500' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Likes Count */}
              <div>
                <p className="font-bold text-gray-900">{likesCount} likes</p>
                <p className="text-sm text-gray-500">{commentsCount} comments</p>
              </div>

              {/* Comment Input */}
              {currentUser && (
                <form onSubmit={handleCommentSubmit} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    disabled={postingComment}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  />
                  <button
                    type="submit"
                    disabled={!comment.trim() || postingComment}
                    className={`p-2 rounded-full transition ${
                      comment.trim() && !postingComment
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </motion.div>

        {/* Boost Modal */}
        {showBoostModal && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]"
            onClick={() => setShowBoostModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Boost Your Post</h3>
                <button
                  onClick={() => setShowBoostModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration (days)
                  </label>
                  <select
                    value={boostDuration}
                    onChange={(e) => setBoostDuration(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    <option value="3">3 days - $5</option>
                    <option value="7">7 days - $10</option>
                    <option value="14">14 days - $18</option>
                    <option value="30">30 days - $30</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Budget ($)
                  </label>
                  <input
                    type="number"
                    value={boostBudget}
                    onChange={(e) => setBoostBudget(e.target.value)}
                    min="5"
                    step="5"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Boost Benefits:</strong>
                  </p>
                  <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                    <li>Increased visibility in feeds</li>
                    <li>Priority placement</li>
                    <li>Reach more potential followers</li>
                  </ul>
                </div>
                
                <button
                  onClick={handleConfirmBoost}
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white py-3 rounded-lg font-bold transition"
                >
                  Boost Post for ${boostBudget}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
}