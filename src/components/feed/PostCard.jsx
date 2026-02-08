// src/components/feed/PostCard.jsx - FIXED: Comment input won't trigger modal

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Heart, 
  MessageCircle, 
  MoreVertical,
  Trash2,
  Send,
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
  updatePost
} from '../../services/postService';
import { getUserProfile } from '../../services/firestoreService';
import { getPostImage } from '../../utils/imageHelpers';

export default function PostCard({ post, onDelete, showPinnedIndicator = false, onPostClick }) {
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [postCreator, setPostCreator] = useState(null);
  const [loadingCreator, setLoadingCreator] = useState(true);

  const imageUrl = getPostImage(post);

  useEffect(() => {
    setCommentsCount(post.comments || 0);
  }, [post.comments]);

  useEffect(() => {
    if (currentUser && post.likedBy) {
      setIsLiked(post.likedBy.includes(currentUser.uid));
    }
  }, [currentUser, post.likedBy]);

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

  const handleLike = async (e) => {
    e.stopPropagation();
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
        await likePost(post.id, currentUser.uid, post.userId, profile);
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      alert('Failed to like post');
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

  const handleToggleComments = (e) => {
    e.stopPropagation();
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  // ✅ FIX: Prevent modal opening when typing/clicking in comment section
  const handleAddComment = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Stop modal from opening
    
    if (!currentUser) {
      alert('Please login to comment');
      return;
    }
    if (!newComment.trim()) return;

    try {
      setPostingComment(true);
      const comment = await addComment(post.id, currentUser.uid, newComment, profile);
      setComments([comment, ...comments]);
      setCommentsCount(prev => (prev || 0) + 1);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment: ' + error.message);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await deletePost(post.id);
      if (onDelete) onDelete(post.id);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  const handleTogglePin = async (e) => {
    e.stopPropagation();
    try {
      const newPinnedState = !post.pinned;
      await updatePost(post.id, { pinned: newPinnedState });
      alert(newPinnedState ? 'Post pinned to top of profile' : 'Post unpinned');
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Failed to toggle pin');
    }
  };

  const handleArchive = async (e) => {
    e.stopPropagation();
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

  const handleUnarchive = async (e) => {
    e.stopPropagation();
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

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    
    try {
      let date;
      
      if (timestamp._methodName === 'serverTimestamp') {
        return 'Just now';
      }
      
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return 'Recently';
      }
      
      if (isNaN(date.getTime())) {
        return 'Recently';
      }
      
      const now = new Date();
      const diff = now - date;
      
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (seconds < 60) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Recently';
    }
  };

  const handleCardClick = () => {
    if (onPostClick) {
      onPostClick(post);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleCardClick}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg transition"
    >
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
                  
          {currentUser?.uid === post.userId && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
              
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                    {post.archived ? (
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

        {post.content && (
          <p className="text-gray-800 mb-4 whitespace-pre-wrap">{post.content}</p>
        )}

        {showPinnedIndicator && post.pinned && (
          <div className="mb-4 inline-flex items-center space-x-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-sm font-medium">
            <Pin className="w-4 h-4" />
            <span>Pinned Post</span>
          </div>
        )}

        {showPinnedIndicator && post.archived && (
          <div className="mb-4 inline-flex items-center space-x-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 text-sm font-medium">
            <Archive className="w-4 h-4" />
            <span>Archived</span>
          </div>
        )}

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

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4 sm:space-x-6">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-2 transition ${
                isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="font-medium">{likesCount}</span>
            </button>

            <button
              onClick={handleToggleComments}
              className="flex items-center space-x-2 text-gray-600 hover:text-blue-500 transition"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="font-medium">{commentsCount}</span>
            </button>
          </div>
        </div>

        {/* ✅ COMMENT SECTION - STOPS PROPAGATION */}
        {showComments && (
          <div 
            className="mt-4 pt-4 border-t border-gray-200"
            onClick={(e) => e.stopPropagation()} // Stop entire section from bubbling
          >
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
                      onChange={(e) => {
                        e.stopPropagation();
                        setNewComment(e.target.value);
                      }}
                      onFocus={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Add a comment..."
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500"
                      disabled={postingComment}
                    />
                    <button
                      type="submit"
                      onClick={(e) => e.stopPropagation()}
                      disabled={!newComment.trim() || postingComment}
                      className="p-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </form>
            )}

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
    </motion.div>
  );
}