// src/components/Modals/PostModal.jsx
// Styled exactly like CommunityPostCard — centered overlay card, inline comments

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, MessageCircle, Send, MoreVertical, Trash2,
  Pin, Archive, RotateCcw, EyeOff, Eye, Lock, Gift, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useContentSettings } from '../../hooks/useContentSettings';
import {
  likePost, unlikePost, addComment, getPostComments,
  deletePost, updatePost, canViewPost
} from '../../services/postService';
import { getUserProfile } from '../../services/firestoreService';
import { getPostImage } from '../../utils/imageHelpers';
import TipModal from './TipModal';
import WatermarkedImage from '../Media/WatermarkedImage';
import WatermarkedVideo from '../Media/WatermarkedVideo';

function timeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  try {
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp instanceof Date) date = timestamp;
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else return 'Recently';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch { return 'Recently'; }
}

export default function PostModal({ isOpen, onClose, post, onPostUpdate }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const { showNSFW, setShowNSFW } = useContentSettings();
  const commentsEndRef = useRef(null);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [comment, setComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [postCreator, setPostCreator] = useState(null);
  const [canView, setCanView] = useState(true);
  const [showTipModal, setShowTipModal] = useState(false);

  const imageUrl = getPostImage(post);
  const rating = (post?.contentRating || 'sfw').toLowerCase();
  const isNSFW = rating === 'nsfw';
  const nsfwHidden = isNSFW && !showNSFW;
  const isPaid = (post?.type || 'free') !== 'free' && Number(post?.price || 0) > 0;
  const isOwnPost = currentUser?.uid === post?.userId;
  const isLocked = isPaid && !isOwnPost && !canView;

  const viewerUsername = currentUser
    ? (profile?.username || currentUser.email?.split('@')[0] || currentUser.uid.slice(0, 8))
    : null;
  const showWatermark = !isLocked && !nsfwHidden && !!imageUrl && !!viewerUsername && !isOwnPost;

  const isVideo = /\.(mp4|mov|avi|webm|mkv)$/i.test(imageUrl || '') || post?.images?.[0]?.type === 'video';

  useEffect(() => {
    if (!post) return;
    setLikesCount(post.likes || 0);
    setCommentsCount(post.comments || 0);
    if (currentUser && post.likedBy) setIsLiked(post.likedBy.includes(currentUser.uid));
    else setIsLiked(false);
  }, [post, currentUser]);

  useEffect(() => {
    if (post?.userId) {
      setPostCreator(null);
      getUserProfile(post.userId).then(setPostCreator).catch(console.error);
    }
  }, [post?.userId]);

  useEffect(() => {
    if (isOpen && post?.id) {
      setComments([]);
      setComment('');
      loadComments();
    }
  }, [isOpen, post?.id]);

  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      if (!post) return;
      if (!isPaid) { if (mounted) setCanView(true); return; }
      const ok = await canViewPost(post, currentUser?.uid || null);
      if (mounted) setCanView(!!ok);
    };
    if (isOpen) checkAccess();
    return () => { mounted = false; };
  }, [isOpen, post?.id, post?.type, post?.price, post?.userId, currentUser?.uid]);

  const loadComments = async () => {
    if (!post?.id) return;
    try {
      setLoadingComments(true);
      const fetched = await getPostComments(post.id);
      setComments(fetched || []);
    } catch (e) {
      console.error('Error loading comments:', e);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  // ✅ FIXED: no event param needed, works when called from button onClick
  const handleLike = async () => {
    if (nsfwHidden || isLocked || !currentUser) return;
    try {
      if (isLiked) {
        await unlikePost(post.id, currentUser.uid);
        setIsLiked(false);
        setLikesCount(p => Math.max(0, p - 1));
      } else {
        await likePost(post.id, currentUser.uid, post.userId, profile);
        setIsLiked(true);
        setLikesCount(p => p + 1);
      }
    } catch (e) { console.error('Like error:', e); }
  };

  // ✅ FIXED: proper async/await with better error handling
  const handleCommentSubmit = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (nsfwHidden || isLocked || !currentUser || !comment.trim() || postingComment) return;
    const text = comment.trim();
    try {
      setPostingComment(true);
      setComment(''); // clear immediately for better UX
      const newComment = await addComment(post.id, currentUser.uid, text, profile);
      setComments(prev => [...prev, newComment]);
      setCommentsCount(p => p + 1);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      console.error('Comment error:', e);
      setComment(text); // restore if failed
      alert('Failed to post comment: ' + (e.message || 'Unknown error'));
    } finally {
      setPostingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deletePost(post.id);
      onClose();
      if (onPostUpdate) onPostUpdate(null);
    } catch { alert('Failed to delete post'); }
  };

  const handleTogglePin = async () => {
    try {
      await updatePost(post.id, { pinned: !post.pinned });
      setShowMenu(false);
      if (onPostUpdate) onPostUpdate({ ...post, pinned: !post.pinned });
      window.location.reload();
    } catch { alert('Failed to toggle pin'); }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archive this post?')) return;
    try {
      await updatePost(post.id, { archived: true, archivedAt: new Date() });
      setShowMenu(false);
      onClose();
      if (onPostUpdate) onPostUpdate({ ...post, archived: true });
    } catch { alert('Failed to archive'); }
  };

  const handleUnarchive = async () => {
    if (!window.confirm('Unarchive this post?')) return;
    try {
      await updatePost(post.id, { archived: false, archivedAt: null });
      setShowMenu(false);
      onClose();
      if (onPostUpdate) onPostUpdate({ ...post, archived: false });
    } catch { alert('Failed to unarchive'); }
  };

  if (!isOpen || !post) return null;

  const tipCreator = postCreator ? {
    uid: postCreator.uid || postCreator.id || post.userId,
    name: postCreator.displayName || postCreator.name || 'Creator',
    avatar: postCreator.profilePicture || postCreator.avatar || null,
  } : null;

  return (
    <>
      <AnimatePresence>
        {/* Backdrop — paddingBottom keeps card above mobile nav */}
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          style={{ paddingBottom: 'max(80px, env(safe-area-inset-bottom) + 64px)' }}
          onClick={onClose}
        >
          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full overflow-hidden flex flex-col"
            style={{ maxWidth: 520, maxHeight: 'calc(100dvh - 160px)' }}
          >

            {/* ── Author header ── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
              <div
                className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition"
                onClick={() => { onClose(); postCreator?.username && navigate(`/creator/${postCreator.username}`); }}
              >
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center flex-shrink-0">
                  {postCreator?.profilePicture || postCreator?.avatar
                    ? <img src={postCreator.profilePicture || postCreator.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-base">👤</span>}
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <p className="font-semibold text-gray-900 text-sm">{postCreator?.displayName || '...'}</p>
                    {postCreator?.kycStatus === 'approved' && <span className="text-blue-500 text-xs">✓</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${
                      isNSFW ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>{isNSFW ? 'NSFW' : 'SFW'}</span>
                  </div>
                  <p className="text-xs text-gray-400">@{postCreator?.username || 'creator'} · {timeAgo(post.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                {/* NSFW toggle */}
                <button
                  onClick={() => setShowNSFW(!showNSFW)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition ${
                    showNSFW ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}
                >
                  {showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}
                </button>

                {/* Gift */}
                {!isOwnPost && tipCreator && currentUser && (
                  <button onClick={() => setShowTipModal(true)} className="p-1.5 hover:bg-yellow-50 rounded-full transition">
                    <Gift className="w-4 h-4 text-yellow-500" />
                  </button>
                )}

                {/* Owner menu */}
                {isOwnPost && (
                  <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-gray-100 rounded-full transition">
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                    {showMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                        <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-20">
                          {post.archived ? (
                            <>
                              <button onClick={handleUnarchive} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 text-sm">
                                <RotateCcw className="w-4 h-4" /><span>Unarchive</span>
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                              <button onClick={handleDelete} className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600 text-sm">
                                <Trash2 className="w-4 h-4" /><span>Delete</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={handleTogglePin} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 text-sm">
                                <Pin className="w-4 h-4" /><span>{post.pinned ? 'Unpin' : 'Pin'}</span>
                              </button>
                              <button onClick={handleArchive} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 text-sm">
                                <Archive className="w-4 h-4" /><span>Archive</span>
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                              <button onClick={handleDelete} className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600 text-sm">
                                <Trash2 className="w-4 h-4" /><span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Close */}
                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="overflow-y-auto flex-1 min-h-0">

              {/* Caption */}
              {post.content && !isLocked && (
                <p className="px-4 pb-3 text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {post.content.split(/(\s+)/).map((word, i) =>
                    /^(https?:\/\/|www\.)\S+/.test(word)
                      ? <a key={i} href={word.startsWith('http') ? word : `https://${word}`} target="_blank" rel="noopener noreferrer" className="text-rose-500 underline break-all">{word}</a>
                      : word
                  )}
                </p>
              )}

              {/* Media */}
              {imageUrl && (
                <div className="px-4 pb-3">
                  {nsfwHidden ? (
                    <div className="rounded-xl bg-gray-900 h-40 flex flex-col items-center justify-center text-white space-y-2">
                      <EyeOff className="w-8 h-8 opacity-50" />
                      <p className="text-sm font-medium">NSFW Hidden</p>
                      <button onClick={() => setShowNSFW(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-900 rounded-lg text-xs font-semibold">
                        <Eye className="w-3.5 h-3.5" /> Enable NSFW
                      </button>
                    </div>
                  ) : isLocked ? (
                    <div className="rounded-xl bg-gray-900 h-40 flex flex-col items-center justify-center text-white space-y-2">
                      <Lock className="w-8 h-8 opacity-50" />
                      <p className="text-sm font-medium">Locked Post</p>
                      <button
                        onClick={() => navigate('/wallet', { state: { action: 'unlock', postId: post.id, creatorId: post.userId, price: Number(post.price || 0) } })}
                        className="px-3 py-1.5 bg-white text-gray-900 rounded-lg text-xs font-semibold"
                      >
                        Unlock • ${Number(post.price || 0).toFixed(2)}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-black relative">
                      {/* ✅ FIXED: video with proper attributes */}
                      {isVideo ? (
                        <WatermarkedVideo
                          src={imageUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-w-full w-auto h-auto mx-auto block object-contain"
                          style={{ maxHeight: 400, display: 'block' }}
                          onClick={e => e.stopPropagation()}
                          showWatermark={showWatermark}
                          username={viewerUsername}
                        />
                      ) : (
                        <WatermarkedImage
                          src={imageUrl}
                          alt="Post"
                          className="max-w-full w-auto h-auto object-contain mx-auto block"
                          style={{ maxHeight: 400 }}
                          showWatermark={showWatermark}
                          username={viewerUsername}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Reaction bar */}
              <div className="px-4 py-2.5 flex items-center justify-between border-t border-gray-50">
                <div className="flex items-center space-x-4">
                  {/* ✅ FIXED: onClick calls handleLike directly, no event param */}
                  <button
                    onClick={handleLike}
                    disabled={nsfwHidden || isLocked}
                    className={`flex items-center space-x-1.5 transition ${isLiked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-500'}`}
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-rose-500' : ''}`} />
                    <span className="text-xs font-medium">{likesCount}</span>
                  </button>
                  <div className="flex items-center space-x-1.5 text-gray-400">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-xs font-medium">{commentsCount}</span>
                  </div>
                </div>
                {!isOwnPost && tipCreator && currentUser && (
                  <button
                    onClick={() => setShowTipModal(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-full transition"
                  >
                    <Gift className="w-3.5 h-3.5 text-yellow-600" />
                    <span className="text-xs font-bold text-yellow-700">Gift</span>
                  </button>
                )}
              </div>

              {/* Comments section */}
              <div className="border-t border-gray-100">

                {/* ✅ FIXED: comment input — font-size 16px prevents iOS zoom */}
                {currentUser && !isLocked && (
                  <div className="flex items-center space-x-2 px-4 py-3 border-b border-gray-50">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs">
                      {currentUser?.photoURL
                        ? <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                        : <span>👤</span>}
                    </div>
                    <input
                      type="text"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleCommentSubmit(e);
                        }
                      }}
                      placeholder="Write a comment..."
                      disabled={postingComment || nsfwHidden}
                      className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 transition"
                      // ✅ FIXED: 16px prevents iOS keyboard zoom
                      style={{ fontSize: '16px' }}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      onClick={handleCommentSubmit}
                      disabled={postingComment || !comment.trim() || nsfwHidden}
                      className="p-1.5 text-rose-500 hover:text-rose-600 disabled:opacity-40 transition flex-shrink-0"
                    >
                      {postingComment
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {/* Comments list */}
                <div className="px-4 py-3 space-y-3">
                  {loadingComments ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">No comments yet. Be first!</p>
                  ) : (
                    comments.map((c, idx) => (
                      <div key={c.id || idx} className="flex items-start space-x-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs">
                          {c.userAvatar
                            ? <img src={c.userAvatar} alt="" className="w-full h-full object-cover" />
                            : <span>{c.userName?.charAt(0)?.toUpperCase() || 'U'}</span>}
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-semibold text-gray-800 text-xs">{c.userName || 'User'}</span>
                            <span className="text-gray-400 text-[10px]">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-gray-700 text-xs leading-relaxed">{c.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={commentsEndRef} />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {tipCreator && (
        <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} creator={tipCreator} />
      )}
    </>
  );
}