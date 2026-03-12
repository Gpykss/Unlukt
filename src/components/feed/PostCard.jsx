// src/components/feed/PostCard.jsx

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, MoreVertical, Trash2, Pin, Archive,
  RotateCcw, EyeOff, Eye, Lock, Gift, Wallet, Loader2, CheckCircle, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useContentSettings } from '../../hooks/useContentSettings';

import { getUserProfile } from '../../services/firestoreService';
import { likePost, unlikePost, deletePost, updatePost, canViewPost } from '../../services/postService';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { db } from '../../config/firebase';
import { getPostImage } from '../../utils/imageHelpers';
import TipModal from '../Modals/TipModal';

// ── Inline Unlock Modal ──────────────────────────────────────────────────────
function UnlockModal({ isOpen, onClose, post, creator, onUnlocked }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const price = Number(post?.price || 0);

  useEffect(() => {
    if (isOpen && currentUser) {
      setError('');
      setSuccess(false);
      getWalletBalance(currentUser.uid).then(setBalance);
    }
  }, [isOpen, currentUser]);

  const handleUnlock = async () => {
    if (!currentUser) { navigate('/login'); return; }
    setError('');
    setLoading(true);
    try {
      // Deduct from wallet
      await deductFromWallet(
        currentUser.uid,
        price,
        `Unlock post by ${creator?.displayName || 'creator'}`,
        { contentType: 'unlock', postId: post?.id, creatorId: post?.userId }
      );

      // Record unlock so canViewPost returns true next time
      await setDoc(doc(db, 'unlocked_content', `${currentUser.uid}_${post.id}`), {
        userId: currentUser.uid,
        postId: post.id,
        creatorId: post.userId,
        price,
        unlockedAt: serverTimestamp(),
      });

      setSuccess(true);
      setBalance(prev => prev - price);
      setTimeout(() => {
        onUnlocked();  // sets canView(true) in PostCard
        onClose();
      }, 1200);
    } catch (e) {
      setError(e.message || 'Failed to unlock');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !post) return null;

  const hasEnough = balance !== null && balance >= price;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm overflow-hidden"
        >
          {success ? (
            <div className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-8 h-8 text-green-500" />
              </motion.div>
              <p className="font-bold text-gray-900 text-lg">Post Unlocked!</p>
              <p className="text-sm text-gray-500 mt-1">Enjoy the content</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Unlock Post</p>
                    <p className="text-xs text-gray-500">by {creator?.displayName || 'Creator'}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Balance row */}
                <div className={`px-4 py-3 rounded-xl flex items-center justify-between text-sm border ${
                  !hasEnough && balance !== null ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600">
                      Balance: <span className="font-bold text-gray-900">
                        ${balance !== null ? balance.toFixed(2) : '...'}
                      </span>
                    </span>
                  </div>
                  {!hasEnough && balance !== null && (
                    <button
                      onClick={() => { onClose(); navigate('/wallet'); }}
                      className="text-xs font-bold text-rose-600 underline"
                    >
                      Add Funds
                    </button>
                  )}
                </div>

                {/* Price */}
                <div className="text-center py-2">
                  <p className="text-3xl font-bold text-gray-900">${price.toFixed(2)}</p>
                  <p className="text-sm text-gray-500 mt-1">one-time unlock</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Primary CTA */}
                {hasEnough ? (
                  <button
                    onClick={handleUnlock}
                    disabled={loading}
                    className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 text-white rounded-xl font-bold transition flex items-center justify-center space-x-2"
                  >
                    {loading
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <><Lock className="w-5 h-5" /><span>Unlock for ${price.toFixed(2)}</span></>
                    }
                  </button>
                ) : (
                  <button
                    onClick={() => { onClose(); navigate('/wallet'); }}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition flex items-center justify-center space-x-2"
                  >
                    <Wallet className="w-5 h-5" />
                    <span>Add Funds to Unlock</span>
                  </button>
                )}

                {/* Subscribe fallback */}
                <button
                  onClick={() => {
                    onClose();
                    navigate('/wallet', {
                      state: {
                        action: 'subscribe',
                        creatorId: post?.userId,
                        creatorName: creator?.displayName || 'this creator',
                        monthlyPrice: Number(creator?.subscriptionPrice || 9.99),
                      }
                    });
                  }}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-semibold transition text-sm"
                >
                  Subscribe • ${Number(creator?.subscriptionPrice || 9.99).toFixed(2)}/mo
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── PostCard ─────────────────────────────────────────────────────────────────
export default function PostCard({
  post,
  onDelete,
  onPostClick,
  showPinnedIndicator = false,
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
  const [canView, setCanView] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const imageUrl = useMemo(() => getPostImage(post), [post]);
  const isOwnPost = currentUser?.uid && post?.userId && currentUser.uid === post.userId;

  const contentRating = (post?.contentRating || 'sfw').toLowerCase();
  const isNSFW = contentRating === 'nsfw';
  const isBlockedByNSFW = isNSFW && !showNSFW;
  const isPaid = (post?.type || 'free') !== 'free' && Number(post?.price || 0) > 0;
  const isLocked = isPaid && !isOwnPost && !canView;

  const tipCreator = creator ? {
    uid: creator.uid || creator.id || post?.userId,
    name: creator.displayName || creator.name || 'Creator',
    avatar: creator.profilePicture || creator.avatar || null,
  } : null;

  useEffect(() => {
    let mounted = true;
    const loadCreator = async () => {
      try {
        if (!post?.userId) return;
        const data = await getUserProfile(post.userId);
        if (!mounted) return;
        setCreator(data);
      } catch (e) { console.error('Error loading post creator:', e); }
    };
    loadCreator();
    return () => { mounted = false; };
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

  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      try {
        if (!post) return;
        if (!isPaid) { if (mounted) setCanView(true); return; }
        const ok = await canViewPost(post, currentUser?.uid || null);
        if (mounted) setCanView(!!ok);
      } catch (e) {
        if (mounted) setCanView(false);
      }
    };
    checkAccess();
    return () => { mounted = false; };
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
    } catch { return 'Recently'; }
  };

  const goToCreator = (e) => {
    e?.stopPropagation();
    const uname = creator?.username || post?.username;
    if (uname) navigate(`/creator/${String(uname).replace('@', '')}`);
    else if (post?.userId) navigate(`/creator/${post.userId}`);
  };

  const handleCardClick = () => {
    if (isBlockedByNSFW) {
      alert('NSFW is hidden. Turn on "Show NSFW" to view this content.');
      return;
    }
    // ✅ Never navigate away — open inline modal
    if (isLocked) {
      setShowUnlockModal(true);
      return;
    }
    if (onPostClick) onPostClick(post);
  };

  const handleLike = async (e) => {
    e?.stopPropagation();
    if (isBlockedByNSFW) { alert('NSFW is hidden.'); return; }
    if (isLocked) { setShowUnlockModal(true); return; }
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
    } catch (error) { console.error('Error toggling like:', error); }
  };

  const handleTipClick = (e) => {
    e?.stopPropagation();
    if (!currentUser) { alert('Please login to send tips'); return; }
    if (isBlockedByNSFW) { alert('Enable NSFW to interact.'); return; }
    setShowTipModal(true);
  };

  const handleDelete = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this post?')) return;
    try {
      await deletePost(post.id);
      setShowMenu(false);
      if (onDelete) onDelete(post.id);
    } catch { alert('Failed to delete post'); }
  };

  const handleTogglePin = async (e) => {
    e?.stopPropagation();
    try {
      await updatePost(post.id, { pinned: !post.pinned });
      setShowMenu(false);
      window.location.reload();
    } catch { alert('Failed to toggle pin'); }
  };

  const handleArchive = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Archive this post?')) return;
    try {
      await updatePost(post.id, { archived: true, archivedAt: new Date() });
      setShowMenu(false);
      if (onDelete) onDelete(post.id);
    } catch { alert('Failed to archive post'); }
  };

  const handleUnarchive = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Unarchive this post?')) return;
    try {
      await updatePost(post.id, { archived: false, archivedAt: null });
      setShowMenu(false);
      window.location.reload();
    } catch { alert('Failed to unarchive post'); }
  };

  if (isBlockedByNSFW && nsfwRenderMode === 'hide') return null;

  const blurMedia = (isBlockedByNSFW && nsfwRenderMode === 'blur') || isLocked;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCardClick(); }}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div
            onClick={goToCreator}
            className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition"
          >
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl overflow-hidden">
              {creator?.profilePicture || creator?.avatar ? (
                <img src={creator.profilePicture || creator.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{creator?.displayName?.charAt(0)?.toUpperCase() || '👤'}</span>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <p className="font-bold text-gray-900">{creator?.displayName || 'Creator'}</p>

                {creator?.kycStatus === 'approved' && (
                  <span className="text-blue-500">✓</span>
                )}

                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                  isNSFW
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}>
                  {isNSFW ? 'NSFW' : 'SFW'}
                </span>

                {isPaid && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                    isLocked
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    {isLocked
                      ? `Locked • $${Number(post?.price || 0).toFixed(2)}`
                      : `Paid • $${Number(post?.price || 0).toFixed(2)}`}
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

          {isOwnPost && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                    {post?.archived ? (
                      <>
                        <button onClick={handleUnarchive} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700">
                          <RotateCcw className="w-4 h-4" /><span>Unarchive</span>
                        </button>
                        <div className="border-t border-gray-200 my-1" />
                        <button onClick={handleDelete} className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600">
                          <Trash2 className="w-4 h-4" /><span>Delete</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={handleTogglePin} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700">
                          <Pin className="w-4 h-4" /><span>{post?.pinned ? 'Unpin' : 'Pin'}</span>
                        </button>
                        <button onClick={handleArchive} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700">
                          <Archive className="w-4 h-4" /><span>Archive</span>
                        </button>
                        <div className="border-t border-gray-200 my-1" />
                        <button onClick={handleDelete} className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600">
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

        {/* Media */}
        <div className="relative bg-black">
          {imageUrl ? (
            (() => {
              const mediaItem = post?.images?.[0];
              const isVideo =
                mediaItem?.type === 'video' ||
                /\.(mp4|mov|avi|webm|mkv)$/i.test(imageUrl) ||
                mediaItem?.mimeType?.startsWith('video/');

              return isVideo ? (
                <video
                  src={imageUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className={`w-full max-h-[520px] ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                  style={{ backgroundColor: 'black' }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img
                  src={imageUrl}
                  alt="Post"
                  className={`w-full max-h-[520px] object-cover ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                  loading="lazy"
                />
              );
            })()
          ) : (
            <div className="w-full h-[380px] flex items-center justify-center text-7xl text-white">📸</div>
          )}

          {/* NSFW overlay */}
          {isBlockedByNSFW && nsfwRenderMode === 'blur' && !isLocked && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="bg-white/95 rounded-2xl border border-gray-200 shadow-xl p-5 max-w-sm w-full text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <EyeOff className="w-5 h-5 text-gray-700" />
                  <p className="font-bold text-gray-900">NSFW Hidden</p>
                </div>
                <p className="text-sm text-gray-600 mb-4">Turn on "Show NSFW" to view this content.</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowNSFW(true); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition"
                >
                  <Eye className="w-4 h-4" /> Enable NSFW
                </button>
              </div>
            </div>
          )}

          {/* ✅ Locked overlay — opens inline modal, never navigates */}
          {isLocked && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="bg-white/95 rounded-2xl border border-gray-200 shadow-xl p-5 max-w-sm w-full text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Lock className="w-5 h-5 text-gray-800" />
                  <p className="font-bold text-gray-900">Locked Post</p>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Unlock this post or subscribe for full access.
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowUnlockModal(true); }}
                  className="w-full px-4 py-2.5 rounded-xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition"
                >
                  Unlock • ${Number(post?.price || 0).toFixed(2)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/wallet', {
                      state: {
                        action: 'subscribe',
                        creatorId: post?.userId,
                        creatorName: creator?.displayName || 'this creator',
                        monthlyPrice: Number(creator?.subscriptionPrice || 9.99),
                      }
                    });
                  }}
                  className="w-full mt-2 px-4 py-2.5 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition"
                >
                  Subscribe • ${Number(creator?.subscriptionPrice || 9.99).toFixed(2)}/mo
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
              {post.content.split(/(\s+)/).map((word, i) =>
                /^(https?:\/\/|www\.)\S+/.test(word) ? (
                  <a
                    key={i}
                    href={word.startsWith('http') ? word : `https://${word}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-rose-500 underline break-all hover:text-rose-600"
                  >{word}</a>
                ) : word
              )}
            </p>
          ) : (
            <p className="text-gray-500">No caption</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 pt-3 border-t border-gray-100 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLike}
                className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}
                disabled={isBlockedByNSFW || isLocked}
                title={isLocked ? 'Unlock to interact' : isBlockedByNSFW ? 'Enable NSFW to interact' : 'Like'}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isBlockedByNSFW) { alert('Enable NSFW to view.'); return; }
                  if (isLocked) { setShowUnlockModal(true); return; }
                  if (onPostClick) onPostClick(post);
                }}
                className="text-gray-600 hover:text-rose-500 transition"
              >
                <MessageCircle className="w-6 h-6" />
              </button>
            </div>

            {/* ✅ Gift button — only for other people's unlocked posts */}
            {!isOwnPost && !isLocked && currentUser && tipCreator && (
              <button
                onClick={handleTipClick}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-full transition"
                title="Send a gift"
              >
                <Gift className="w-4 h-4 text-yellow-600" />
                <span className="text-xs font-bold text-yellow-700">Gift</span>
              </button>
            )}
          </div>

          <div className="mt-3">
            <p className="font-bold text-gray-900">{likesCount} likes</p>
            <p className="text-sm text-gray-500">{commentsCount} comments</p>
          </div>
        </div>
      </motion.div>

      {/* ✅ Inline unlock modal — stays on page, deducts from wallet directly */}
      <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        post={post}
        creator={creator}
        onUnlocked={() => setCanView(true)}
      />

      {/* Tip modal */}
      {tipCreator && (
        <TipModal
          isOpen={showTipModal}
          onClose={() => setShowTipModal(false)}
          creator={tipCreator}
        />
      )}
    </>
  );
}