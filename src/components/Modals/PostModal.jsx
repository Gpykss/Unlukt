// src/components/Modals/PostModal.jsx

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

function DiagonalWatermark({ username }) {
  if (!username) return null;
  const text = `@${username}`;
  const repeats = 6;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10">
      <svg className="w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: repeats }).map((_, i) => (
          <text key={i} x="50%" y={`${10 + i * (90 / repeats)}%`}
            textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-35, 50%, ${10 + i * (90 / repeats)}%)`}
            fill="white" fontSize="14" fontWeight="bold" fontFamily="monospace" letterSpacing="2">
            {text}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function PostModal({ isOpen, onClose, post, onPostUpdate }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const { showNSFW, setShowNSFW } = useContentSettings();
  const commentsRef = useRef(null);

  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
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

  useEffect(() => {
    if (!post) return;
    setLikesCount(post.likes || 0);
    setCommentsCount(post.comments || 0);
    if (currentUser && post.likedBy) setIsLiked(post.likedBy.includes(currentUser.uid));
    else setIsLiked(false);
  }, [post, currentUser]);

  useEffect(() => {
    if (post?.userId) loadPostCreator();
  }, [post?.userId]);

  useEffect(() => {
    if (isOpen && post?.id) {
      setComments([]);
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

  const loadPostCreator = async () => {
    try {
      const creator = await getUserProfile(post.userId);
      setPostCreator(creator);
    } catch (e) { console.error(e); }
  };

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

  const handleLike = async () => {
    if (nsfwHidden) { alert('NSFW is hidden.'); return; }
    if (isLocked) { alert('Unlock to interact.'); return; }
    if (!currentUser) { alert('Please login to like posts'); return; }
    try {
      if (isLiked) {
        await unlikePost(post.id, currentUser.uid);
        setIsLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));
      } else {
        await likePost(post.id, currentUser.uid, post.userId, profile);
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
    } catch (e) { console.error(e); }
  };

  const handleCommentSubmit = async (e) => {
    e?.preventDefault();
    if (nsfwHidden || isLocked || !currentUser || !comment.trim()) return;
    try {
      setPostingComment(true);
      const newComment = await addComment(post.id, currentUser.uid, comment, profile);
      setComments(prev => [...prev, newComment]);
      setCommentsCount(prev => prev + 1);
      setComment('');
      setTimeout(() => {
        if (commentsRef.current) {
          commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
        }
      }, 100);
    } catch (e) { alert('Failed to add comment'); }
    finally { setPostingComment(false); }
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
    } catch { alert('Failed to archive post'); }
  };

  const handleUnarchive = async () => {
    if (!window.confirm('Unarchive this post?')) return;
    try {
      await updatePost(post.id, { archived: false, archivedAt: null });
      setShowMenu(false);
      onClose();
      if (onPostUpdate) onPostUpdate({ ...post, archived: false });
    } catch { alert('Failed to unarchive post'); }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      let date;
      if (timestamp.toDate) date = timestamp.toDate();
      else if (timestamp instanceof Date) date = timestamp;
      else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
      else return 'Recently';
      const diff = Date.now() - date;
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hrs < 24) return `${hrs}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch { return 'Recently'; }
  };

  const goToUnlock = () => navigate('/wallet', { state: { action: 'unlock', postId: post?.id, creatorId: post?.userId, price: Number(post?.price || 0) } });
  const goToSubscribe = () => navigate('/wallet', { state: { action: 'subscribe', creatorId: post?.userId, price: Number(post?.subscriptionPrice || 9.99) } });

  if (!isOpen || !post) return null;

  const tipCreator = postCreator ? {
    uid: postCreator.uid || postCreator.id || post.userId,
    name: postCreator.displayName || postCreator.name || 'Creator',
    avatar: postCreator.profilePicture || postCreator.avatar || null,
  } : null;

  // Bottom nav height on mobile — your app uses pb-20 (80px) on mobile
  const BOTTOM_NAV = 64;

  return (
    <>
      <AnimatePresence>
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 md:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full md:rounded-2xl overflow-hidden md:max-w-4xl flex flex-col md:flex-row"
            style={{
              // FIX: subtract bottom nav so nothing hides behind it on mobile
              height: `calc(100dvh - ${BOTTOM_NAV}px)`,
              maxHeight: `calc(100dvh - ${BOTTOM_NAV}px)`,
            }}
          >

            {/* ── MEDIA PANEL ──
                FIX: capped at 35vh on mobile so details panel always has 65vh
                On desktop: flex-1 fills left column */}
            <div
              className="bg-black flex-shrink-0 flex items-center justify-center relative overflow-hidden md:flex-1 md:h-full"
              style={{ height: '35vh' }}
            >
              <div className="w-full h-full flex items-center justify-center relative">
                {isLocked ? (
                  <div className="text-white text-center p-6 max-w-xs">
                    <Lock className="w-12 h-12 mx-auto mb-3 opacity-60" />
                    <p className="font-bold text-lg">Locked Post</p>
                    <p className="text-sm text-white/70 mt-1 mb-4">Unlock to view this content</p>
                    <button onClick={goToUnlock} className="w-full px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold text-sm mb-2">
                      Unlock • ${Number(post?.price || 0).toFixed(2)}
                    </button>
                    <button onClick={goToSubscribe} className="w-full px-4 py-2 bg-white/20 text-white rounded-lg font-semibold text-sm border border-white/30">
                      Subscribe to unlock all
                    </button>
                  </div>
                ) : nsfwHidden ? (
                  <div className="text-white text-center p-6 max-w-xs">
                    <EyeOff className="w-12 h-12 mx-auto mb-3 opacity-60" />
                    <p className="font-bold text-lg">NSFW Hidden</p>
                    <p className="text-sm text-white/70 mt-1 mb-4">Enable NSFW to view this content</p>
                    <button onClick={() => setShowNSFW(true)} className="flex items-center justify-center space-x-2 px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold text-sm mx-auto">
                      <Eye className="w-4 h-4" /><span>Enable NSFW</span>
                    </button>
                  </div>
                ) : imageUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/\.(mp4|mov|avi|webm|mkv)$/i.test(imageUrl) || post?.images?.[0]?.type === 'video' ? (
                      <video src={imageUrl} controls playsInline preload="metadata"
                        className="max-w-full max-h-full object-contain"
                        onClick={e => e.stopPropagation()} />
                    ) : (
                      <img src={imageUrl} alt="Post" className="max-w-full max-h-full object-contain" />
                    )}
                    {showWatermark && <DiagonalWatermark username={viewerUsername} />}
                  </div>
                ) : (
                  <span className="text-8xl">📸</span>
                )}
              </div>

              {/* Close */}
              <button onClick={onClose}
                className="absolute top-3 left-3 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition z-20">
                <X className="w-5 h-5" />
              </button>

              {/* NSFW badges */}
              <div className="absolute top-3 right-3 flex items-center space-x-2 z-20">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${isNSFW ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                  {isNSFW ? 'NSFW' : 'SFW'}
                </span>
                <button onClick={() => setShowNSFW(!showNSFW)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${showNSFW ? 'bg-white text-gray-900 border-white' : 'bg-black/40 text-white border-white/30'}`}>
                  {showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}
                </button>
              </div>
            </div>

            {/* ── DETAILS PANEL ──
                FIX: takes exact remaining height = total - media (35vh)
                flex-col with min-h-0 so inner scroll works */}
            <div
              className="flex flex-col bg-white md:w-96 lg:w-[420px] md:flex-shrink-0 md:h-full min-h-0"
              style={{ flex: '1 1 0', minHeight: 0 }}
            >
              {/* Creator header — never shrinks */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div onClick={() => postCreator?.username && navigate(`/creator/${postCreator.username}`)}
                  className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center overflow-hidden ring-2 ring-rose-100 flex-shrink-0">
                    {postCreator?.profilePicture || postCreator?.avatar
                      ? <img src={postCreator.profilePicture || postCreator.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg font-bold text-rose-400">{postCreator?.displayName?.charAt(0)?.toUpperCase() || '👤'}</span>}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1">
                      <p className="font-bold text-gray-900 text-sm">{postCreator?.displayName || 'Loading...'}</p>
                      {postCreator?.kycStatus === 'approved' && <span className="text-blue-500 text-xs">✓</span>}
                    </div>
                    <p className="text-xs text-gray-500">@{postCreator?.username || 'creator'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  {!isOwnPost && tipCreator && currentUser && (
                    <button onClick={() => setShowTipModal(true)} className="p-2 hover:bg-yellow-50 rounded-lg transition">
                      <Gift className="w-5 h-5 text-yellow-500" />
                    </button>
                  )}
                  {isOwnPost && (
                    <div className="relative">
                      <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <MoreVertical className="w-5 h-5 text-gray-600" />
                      </button>
                      {showMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                            {post.archived ? (
                              <>
                                <button onClick={handleUnarchive} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 text-sm">
                                  <RotateCcw className="w-4 h-4" /><span>Unarchive</span>
                                </button>
                                <div className="border-t border-gray-200 my-1" />
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
                                <div className="border-t border-gray-200 my-1" />
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
                </div>
              </div>

              {isLocked ? (
                <div className="p-5 flex-shrink-0">
                  <p className="font-bold text-gray-900 mb-1">This post is locked</p>
                  <p className="text-gray-500 text-sm mb-4">Unlock to view caption, comments, and interact.</p>
                  <button onClick={goToUnlock} className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition mb-2 text-sm">
                    Unlock • ${Number(post?.price || 0).toFixed(2)}
                  </button>
                  <button onClick={goToSubscribe} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold transition text-sm">
                    Subscribe to unlock all
                  </button>
                </div>
              ) : (
                <>
                  {/* Caption — never shrinks */}
                  <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
                    <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed line-clamp-3">
                      {post.content
                        ? post.content.split(/(\s+)/).map((word, i) =>
                            /^(https?:\/\/|www\.)\S+/.test(word)
                              ? <a key={i} href={word.startsWith('http') ? word : `https://${word}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-rose-500 underline break-all">{word}</a>
                              : word
                          )
                        : <span className="text-gray-400 italic">No caption</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(post.createdAt)}</p>
                  </div>

                  {/* Comments — ONLY scrollable section, takes all remaining space */}
                  <div
                    ref={commentsRef}
                    className="px-4 py-2 space-y-2.5 overflow-y-auto"
                    style={{ flex: '1 1 0', minHeight: 0 }}
                  >
                    {loadingComments ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="flex items-center justify-center py-6">
                        <p className="text-gray-400 text-sm">No comments yet. Be the first!</p>
                      </div>
                    ) : (
                      comments.map((c, idx) => (
                        <div key={c.id || idx} className="flex space-x-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden text-rose-400">
                            {c.userAvatar
                              ? <img src={c.userAvatar} alt="" className="w-full h-full object-cover" />
                              : c.userName?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                            <div className="flex items-center space-x-2 mb-0.5 flex-wrap gap-x-1">
                              <span className="font-semibold text-gray-900 text-xs">{c.userName}</span>
                              <span className="text-gray-400 text-[10px]">{formatDate(c.createdAt)}</span>
                            </div>
                            <p className="text-gray-700 text-sm leading-relaxed">{c.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Bottom bar — NEVER shrinks, always visible above nav */}
                  <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-4">
                        <button onClick={handleLike} disabled={nsfwHidden}
                          className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}>
                          <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
                        </button>
                        <MessageCircle className="w-6 h-6 text-gray-500" />
                      </div>
                      {!isOwnPost && tipCreator && currentUser && (
                        <button onClick={() => setShowTipModal(true)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-full transition">
                          <Gift className="w-4 h-4 text-yellow-600" />
                          <span className="text-xs font-bold text-yellow-700">Gift</span>
                        </button>
                      )}
                    </div>

                    <p className="font-bold text-gray-900 text-sm">{likesCount} likes</p>
                    <p className="text-xs text-gray-400 mb-2">{commentsCount} comments</p>

                    {currentUser && (
                      <form onSubmit={handleCommentSubmit} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Add a comment..."
                          disabled={postingComment || nsfwHidden}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-rose-400 transition"
                          style={{ fontSize: '16px' }}
                        />
                        <button type="submit"
                          disabled={!comment.trim() || postingComment || nsfwHidden}
                          className={`p-2.5 rounded-full transition flex-shrink-0 ${comment.trim() && !postingComment && !nsfwHidden ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                          {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
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