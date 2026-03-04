// src/components/feed/PostCard.jsx - FULL: NSFW badge + blur/lock when NSFW off + PAID LOCK + unlock CTA + modal guard

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  MoreVertical,
  Trash2,
  Pin,
  Archive,
  RotateCcw,
  EyeOff,
  Eye,
  Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useContentSettings } from '../../hooks/useContentSettings';

import { getUserProfile } from '../../services/firestoreService';
import {
  likePost,
  unlikePost,
  deletePost,
  updatePost,
  canViewPost
} from '../../services/postService';

import { getPostImage } from '../../utils/imageHelpers';

export default function PostCard({
  post,
  onDelete,
  onPostClick,
  showPinnedIndicator = false,
  // ✅ behavior when NSFW is hidden:
  // "hide" = remove from feed handled by parent filter
  // "blur" = still render but blur + block click
  nsfwRenderMode = 'blur',
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const { showNSFW, setShowNSFW } = useContentSettings();

  const [creator, setCreator] = useState(null);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);

  const [showMenu, setShowMenu] = useState(false);

  // ✅ paid lock
  const [canView, setCanView] = useState(true);

  const imageUrl = useMemo(() => getPostImage(post), [post]);
  const isOwnPost = currentUser?.uid && post?.userId && currentUser.uid === post.userId;

  // rating
  const contentRating = (post?.contentRating || 'sfw').toLowerCase();
  const isNSFW = contentRating === 'nsfw';
  const isBlockedByNSFW = isNSFW && !showNSFW;

  // paid
  const isPaid = (post?.type || 'free') !== 'free' && Number(post?.price || 0) > 0;
  const isLocked = isPaid && !isOwnPost && !canView;

  useEffect(() => {
    let mounted = true;

    const loadCreator = async () => {
      try {
        if (!post?.userId) return;
        const data = await getUserProfile(post.userId);
        if (!mounted) return;
        setCreator(data);
      } catch (e) {
        console.error('Error loading post creator:', e);
      }
    };

    loadCreator();
    return () => {
      mounted = false;
    };
  }, [post?.userId]);

  useEffect(() => {
    if (!post) return;

    setLikesCount(post.likes || 0);
    setCommentsCount(post.comments || 0);

    if (currentUser && Array.isArray(post.likedBy)) {
      setIsLiked(post.likedBy.includes(currentUser.uid));
    } else {
      setIsLiked(false);
    }
  }, [post, currentUser]);

  // ✅ check access for paid posts
  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      try {
        if (!post) return;

        if (!isPaid) {
          if (mounted) setCanView(true);
          return;
        }

        const ok = await canViewPost(post, currentUser?.uid || null);
        if (mounted) setCanView(!!ok);
      } catch (e) {
        console.error('Error checking post access:', e);
        if (mounted) setCanView(false);
      }
    };

    checkAccess();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.type, post?.price, post?.userId, currentUser?.uid]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      let date;
      if (timestamp.toDate) date = timestamp.toDate();
      else if (timestamp instanceof Date) date = timestamp;
      else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
      else return 'Recently';

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
    } catch {
      return 'Recently';
    }
  };

  const goToCreator = (e) => {
    e?.stopPropagation();
    const uname = creator?.username || post?.username;
    if (uname) navigate(`/creator/${String(uname).replace('@', '')}`);
    else if (post?.userId) navigate(`/creator/${post.userId}`);
  };

  const goToUnlock = (e) => {
    e?.stopPropagation();
    navigate('/wallet', {
      state: {
        action: 'unlock',
        postId: post?.id,
        creatorId: post?.userId,
        price: Number(post?.price || 0),
      }
    });
  };

  const goToSubscribe = (e) => {
    e?.stopPropagation();
    navigate('/wallet', {
      state: {
        action: 'subscribe',
        creatorId: post?.userId,
        price: Number(post?.subscriptionPrice || 9.99),
      }
    });
  };

  const handleCardClick = () => {
    if (isBlockedByNSFW) {
      alert('NSFW is hidden. Turn on "Show NSFW" to view this content.');
      return;
    }

    if (isLocked) {
      goToUnlock();
      return;
    }

    if (onPostClick) onPostClick(post);
  };

  const handleLike = async (e) => {
    e?.stopPropagation();

    if (isBlockedByNSFW) {
      alert('NSFW is hidden. Turn on "Show NSFW" to interact with this post.');
      return;
    }

    if (isLocked) {
      alert('This post is locked. Unlock to interact.');
      return;
    }

    if (!currentUser) {
      alert('Please login to like posts');
      return;
    }

    try {
      if (isLiked) {
        await unlikePost(post.id, currentUser.uid);
        setIsLiked(false);
        setLikesCount((prev) => Math.max(0, prev - 1));
      } else {
        await likePost(post.id, currentUser.uid, post.userId, profile);
        setIsLiked(true);
        setLikesCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDelete = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await deletePost(post.id);
      alert('Post deleted successfully');
      setShowMenu(false);
      if (onDelete) onDelete(post.id);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  const handleTogglePin = async (e) => {
    e?.stopPropagation();
    try {
      const newPinnedState = !post.pinned;
      await updatePost(post.id, { pinned: newPinnedState });
      alert(newPinnedState ? 'Post pinned' : 'Post unpinned');
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Failed to toggle pin');
    }
  };

  const handleArchive = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Archive this post?')) return;

    try {
      await updatePost(post.id, {
        archived: true,
        archivedAt: new Date()
      });
      alert('Post archived');
      setShowMenu(false);
      if (onDelete) onDelete(post.id);
    } catch (error) {
      console.error('Error archiving post:', error);
      alert('Failed to archive post');
    }
  };

  const handleUnarchive = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Unarchive this post?')) return;

    try {
      await updatePost(post.id, {
        archived: false,
        archivedAt: null
      });
      alert('Post unarchived');
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      console.error('Error unarchiving post:', error);
      alert('Failed to unarchive post');
    }
  };

  // If parent already filters NSFW out and you want PostCard to disappear too:
  if (isBlockedByNSFW && nsfwRenderMode === 'hide') return null;

  const blurMedia = (isBlockedByNSFW && nsfwRenderMode === 'blur') || isLocked;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleCardClick();
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div
          onClick={goToCreator}
          className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition"
        >
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl overflow-hidden">
            {creator?.profilePicture || creator?.avatar ? (
              <img
                src={creator.profilePicture || creator.avatar}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{creator?.displayName?.charAt(0)?.toUpperCase() || '👤'}</span>
            )}
          </div>

          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <p className="font-bold text-gray-900">
                {creator?.displayName || 'Creator'}
              </p>

              {creator?.kycStatus === 'approved' && (
                <span className="text-blue-500">✓</span>
              )}

              {/* Rating badge */}
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                  isNSFW
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
                title={isNSFW ? 'NSFW content' : 'SFW content'}
              >
                {isNSFW ? 'NSFW' : 'SFW'}
              </span>

              {/* Paid badge */}
              {isPaid && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                    isLocked
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}
                  title={isLocked ? 'Locked paid post' : 'Paid post'}
                >
                  {isLocked ? `Locked • $${Number(post?.price || 0).toFixed(2)}` : `Paid • $${Number(post?.price || 0).toFixed(2)}`}
                </span>
              )}

              {showPinnedIndicator && post?.pinned && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 font-semibold">
                  Pinned
                </span>
              )}
            </div>

            <p className="text-sm text-gray-500">
              @{creator?.username || post?.username || 'user'} • {formatDate(post?.createdAt)}
            </p>
          </div>
        </div>

        {/* Menu */}
        {isOwnPost && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((v) => !v);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              aria-label="Post options"
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
                  {post?.archived ? (
                    <>
                      <button
                        onClick={handleUnarchive}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Unarchive</span>
                      </button>
                      <div className="border-t border-gray-200 my-1" />
                      <button
                        onClick={handleDelete}
                        className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleTogglePin}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                      >
                        <Pin className="w-4 h-4" />
                        <span>{post?.pinned ? 'Unpin' : 'Pin'}</span>
                      </button>
                      <button
                        onClick={handleArchive}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                      >
                        <Archive className="w-4 h-4" />
                        <span>Archive</span>
                      </button>
                      <div className="border-t border-gray-200 my-1" />
                      <button
                        onClick={handleDelete}
                        className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>


      

    
      {/* Media */}
      <div className="relative bg-black">
        {imageUrl ? (
          (() => {
            const mediaItem = post?.images?.[0];
            const url = imageUrl;
            const isVideo =
              mediaItem?.type === 'video' ||
              /\.(mp4|mov|avi|webm|mkv)$/i.test(url) ||
              mediaItem?.mimeType?.startsWith('video/');

            return isVideo ? (
              <video
                src={url}
                controls
                playsInline
                preload="metadata"
                className={`w-full max-h-[520px] ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                style={{ backgroundColor: 'black' }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={url}
                alt="Post"
                className={`w-full max-h-[520px] object-cover ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                loading="lazy"
              />
            );
          })()
        ) : (
          <div className="w-full h-[380px] flex items-center justify-center text-7xl text-white">
            📸
          </div>
        )}

        {/* NSFW overlay */}
        {isBlockedByNSFW && nsfwRenderMode === 'blur' && !isLocked && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white/95 rounded-2xl border border-gray-200 shadow-xl p-5 max-w-sm w-full text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <EyeOff className="w-5 h-5 text-gray-700" />
                <p className="font-bold text-gray-900">NSFW Hidden</p>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Turn on “Show NSFW” to view this content.
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNSFW(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition"
              >
                <Eye className="w-4 h-4" />
                Enable NSFW
              </button>
            </div>
          </div>
        )}

        {/* Paid lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white/95 rounded-2xl border border-gray-200 shadow-xl p-5 max-w-sm w-full text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-gray-800" />
                <p className="font-bold text-gray-900">Locked</p>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Unlock to view this post.
              </p>

              <button
                onClick={goToUnlock}
                className="w-full px-4 py-2.5 rounded-xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition"
              >
                Unlock • ${Number(post?.price || 0).toFixed(2)}
              </button>

              <button
                onClick={goToSubscribe}
                className="w-full mt-2 px-4 py-2.5 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition"
              >
                Subscribe to unlock all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="px-4 pt-4">
        {isLocked ? (
          <p className="text-gray-500">Unlock to view caption</p>
        ) : post?.content ? (
          <p className={`text-gray-800 whitespace-pre-wrap ${isBlockedByNSFW ? 'opacity-60' : ''}`}>
            {post.content}
          </p>
        ) : (
          <p className="text-gray-500">No caption</p>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLike}
              className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}
              aria-label="Like"
              disabled={isBlockedByNSFW || isLocked}
              title={isLocked ? 'Unlock to interact' : isBlockedByNSFW ? 'Enable NSFW to interact' : 'Like'}
            >
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isBlockedByNSFW) {
                  alert('NSFW is hidden. Turn on "Show NSFW" to view this content.');
                  return;
                }
                if (isLocked) {
                  goToUnlock(e);
                  return;
                }
                if (onPostClick) onPostClick(post);
              }}
              className="text-gray-600 hover:text-rose-500 transition"
              aria-label="Comment"
              title={isLocked ? 'Unlock to view' : isBlockedByNSFW ? 'Enable NSFW to view' : 'Open comments'}
            >
              <MessageCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <p className="font-bold text-gray-900">{likesCount} likes</p>
          <p className="text-sm text-gray-500">{commentsCount} comments</p>
        </div>
      </div>
    </motion.div>
  );
}
