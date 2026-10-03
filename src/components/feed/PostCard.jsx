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
import { likePost, unlikePost, deletePost, updatePost, canViewPost, subscribeToPost } from '../../services/postService';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { db } from '../../config/firebase';
import { getPostImage } from '../../utils/imageHelpers';
import TipModal from '../Modals/TipModal';
import WatermarkedImage from '../Media/WatermarkedImage';
import WatermarkedVideo from '../Media/WatermarkedVideo';
import PostUnlockSheet from './PostUnlockSheet';

// DiagonalWatermark is now imported from ../Media/WatermarkedImage and WatermarkedVideo

// ── PostCard ─────────────────────────────────────────────────────────────────
export default function PostCard({
  post,
  onDelete,
  onArchive,
  onUnarchive,
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
  // Start as false — we only allow viewing after the Firestore check confirms access.
  // This prevents paid/subscriber content from briefly showing before the async check runs.
  const [canView, setCanView] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const imageUrl = useMemo(() => getPostImage(post), [post]);
  const isOwnPost = currentUser?.uid && post?.userId && currentUser.uid === post.userId;

  const contentRating = (post?.contentRating || 'sfw').toLowerCase();
  const isNSFW = contentRating === 'nsfw';
  const isBlockedByNSFW = isNSFW && !showNSFW;
  const postType = post?.type || 'free';
  // Any non-free post needs an access check (subscribers-only OR paid PPV)
  const isPaid = postType !== 'free';
  const isSubscribersOnly = postType === 'subscribers';
  // isLocked is only meaningful once the access check has completed
  const isLocked = isPaid && !isOwnPost && accessChecked && !canView;

  // Watermark: show viewer's username on all unlocked posts they don't own
  const viewerUsername = currentUser ? (profile?.username || currentUser.email?.split('@')[0] || currentUser.uid.slice(0, 8)) : null;
  const showWatermark = !isLocked && !isBlockedByNSFW && !!imageUrl && !!viewerUsername && !isOwnPost;

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
    if (!post?.id) return;
    setLikesCount(post.likes || 0);
    setCommentsCount(post.comments || 0);
    if (currentUser && Array.isArray(post.likedBy)) {
      setIsLiked(post.likedBy.includes(currentUser.uid));
    } else {
      setIsLiked(false);
    }

    // Subscribe to post document for live updates
    const unsub = subscribeToPost(post.id, (freshPost) => {
      if (freshPost) {
        if (typeof freshPost.likes === 'number') setLikesCount(freshPost.likes);
        if (typeof freshPost.comments === 'number') setCommentsCount(freshPost.comments);
        if (currentUser && Array.isArray(freshPost.likedBy)) {
          setIsLiked(freshPost.likedBy.includes(currentUser.uid));
        }
      }
    });

    return () => unsub();
  }, [post?.id, currentUser]);

  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      if (!post) return;

      // Owner: always grant access immediately, no Firestore round-trip
      if (isOwnPost) {
        if (mounted) { setCanView(true); setAccessChecked(true); }
        return;
      }

      // Free posts: always viewable, no async check needed
      if (postType === 'free') {
        if (mounted) { setCanView(true); setAccessChecked(true); }
        return;
      }

      // Non-free posts: check Firestore. canView stays false until confirmed.
      try {
        const ok = await canViewPost(post, currentUser?.uid || null);
        if (mounted) { setCanView(!!ok); setAccessChecked(true); }
      } catch (e) {
        console.error('❌ access check failed:', e);
        if (mounted) { setCanView(false); setAccessChecked(true); }
      }
    };
    // Reset on post/user change so we don't show stale access
    setCanView(false);
    setAccessChecked(false);
    checkAccess();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.type, post?.price, post?.userId, currentUser?.uid, isOwnPost]);

  // ✅ PRD 16.3: Live 60s ticker to update relative times in real time without refetching
  const [, setTimeTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const parseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    try {
      if (typeof timestamp.toDate === 'function') return timestamp.toDate();
      if (timestamp instanceof Date) return timestamp;
      if (timestamp.seconds != null) return new Date(timestamp.seconds * 1000);
      if (timestamp._seconds != null) return new Date(timestamp._seconds * 1000);
      if (typeof timestamp === 'number') {
        return new Date(timestamp < 1e11 ? timestamp * 1000 : timestamp);
      }
      if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  // ✅ PRD 16.3: Shows accurate relative time AND the actual time
  const formatPostTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return 'Just now';

    const now = new Date();
    const diff = now - date;

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Same calendar day
    const isToday = now.toDateString() === date.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.toDateString() === date.toDateString();

    const minutes = Math.floor(Math.abs(diff) / 60000);
    const hours = Math.floor(Math.abs(diff) / 3600000);

    if (isToday) {
      if (minutes < 1) {
        return `Just now • ${timeStr}`;
      }
      if (minutes < 60) {
        return `${minutes}m ago • ${timeStr}`;
      }
      return `${hours}h ago • ${timeStr}`;
    }

    if (isYesterday) {
      return `Yesterday • ${timeStr}`;
    }

    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr} • ${timeStr}`;
  };

  const getFullDateTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return '';
    return date.toLocaleString(undefined, {
      dateStyle: 'full',
      timeStyle: 'medium',
    });
  };

  const goToCreator = (e) => {
    e?.stopPropagation();
    const uname = creator?.username || post?.username;
    if (uname) navigate(`/creator/${String(uname).replace('@', '')}`);
    else if (post?.userId) navigate(`/creator/${post.userId}`);
  };

  const handleCardClick = () => {
    if (!currentUser) { navigate('/login'); return; }
    if (isBlockedByNSFW) {
      alert('NSFW is hidden. Turn on "Show NSFW" to view this content.');
      return;
    }
    if (isLocked) {
      setShowUnlockModal(true);
      return;
    }
    if (onPostClick) onPostClick(post);
  };

  const handleLike = async (e) => {
    e?.stopPropagation();
    if (!currentUser) { navigate('/login'); return; }
    if (isBlockedByNSFW) { alert('NSFW is hidden.'); return; }
    if (isLocked) { setShowUnlockModal(true); return; }
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
    if (!currentUser) { navigate('/login'); return; }
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
      // Call onArchive if provided (moves post to archive tab), else fall back to onDelete
      if (onArchive) onArchive(post.id);
      else if (onDelete) onDelete(post.id);
    } catch { alert('Failed to archive post'); }
  };

  const handleUnarchive = async (e) => {
    e?.stopPropagation();
    if (!window.confirm('Unarchive this post?')) return;
    try {
      await updatePost(post.id, { archived: false, archivedAt: null });
      setShowMenu(false);
      // Call onUnarchive if provided (moves post back to posts tab), else reload
      if (onUnarchive) onUnarchive(post.id);
      else window.location.reload();
    } catch { alert('Failed to unarchive post'); }
  };

  if (isBlockedByNSFW && nsfwRenderMode === 'hide') return null;

  // Blur if: NSFW is hidden, OR post is confirmed locked, OR access check is still pending for a non-free post
  const accessPending = isPaid && !isOwnPost && !accessChecked;
  const blurMedia = (isBlockedByNSFW && nsfwRenderMode === 'blur') || isLocked || accessPending;

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
            {/* FIX: Bigger avatar, clearly visible */}
            <div className="relative w-12 h-12 flex-shrink-0">
              {creator?.is_live && (
                <>
                  <div className="absolute -inset-1 rounded-full border-2 border-rose-500 animate-ping opacity-75 z-0" />
                  <div className="absolute -inset-1 rounded-full border-2 border-rose-600 animate-pulse z-0" />
                </>
              )}
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl overflow-hidden ring-2 ring-rose-100 z-10">
                {creator?.profilePicture || creator?.avatar ? (
                  <img src={creator.profilePicture || creator.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg">{creator?.displayName?.charAt(0)?.toUpperCase() || '👤'}</span>
                )}
              </div>
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
                      : isSubscribersOnly
                        ? 'bg-purple-50 border-purple-200 text-purple-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    {isLocked
                      ? isSubscribersOnly
                        ? '🔒 Subscribers Only'
                        : `🔒 Paid • $${Number(post?.price || 0).toFixed(2)}`
                      : isSubscribersOnly
                        ? '👑 Subscribers'
                        : `💰 Paid • $${Number(post?.price || 0).toFixed(2)}`}
                  </span>
                )}

                {showPinnedIndicator && post?.pinned && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 font-semibold">
                    Pinned
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500">
                @{creator?.username || post?.username || 'user'} •{' '}
                <span title={getFullDateTime(post?.createdAt)} className="cursor-help hover:text-gray-700 transition">
                  {formatPostTime(post?.createdAt)}
                </span>
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

        {/* Media Container - Optimized responsive display with ambient blur backdrop */}
        <div className="relative w-full overflow-hidden bg-gray-950 flex items-center justify-center max-h-[460px] sm:max-h-[580px] min-h-[240px]">
          {/* Ambient blurred backdrop to soften non-standard aspect ratios */}
          {imageUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-25 scale-125 pointer-events-none"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          )}

          {imageUrl ? (
            (() => {
              const mediaItem = post?.images?.[0];
              const isVideo =
                mediaItem?.type === 'video' ||
                /\.(mp4|mov|avi|webm|mkv)$/i.test(imageUrl) ||
                mediaItem?.mimeType?.startsWith('video/');

              return isVideo ? (
                <WatermarkedVideo
                  src={imageUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className={`relative z-1 w-full h-auto max-h-[460px] sm:max-h-[580px] object-contain mx-auto block ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                  showWatermark={showWatermark}
                  username={viewerUsername}
                />
              ) : (
                <WatermarkedImage
                  src={imageUrl}
                  alt="Post"
                  className={`relative z-1 w-full h-auto max-h-[460px] sm:max-h-[580px] object-cover sm:object-contain mx-auto block ${blurMedia ? 'blur-xl scale-[1.02]' : ''}`}
                  loading="lazy"
                  showWatermark={showWatermark}
                  username={viewerUsername}
                />
              );
            })()
          ) : (
            <div className="w-full h-[280px] flex items-center justify-center text-6xl text-white">📸</div>
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

          {/* PRD Section 15.3: Frosted-Glass Blur & Lock Pill Overlay */}
          {isLocked && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!currentUser) { navigate('/login'); return; }
                setShowUnlockModal(true);
              }}
              className="absolute inset-0 flex flex-col items-center justify-center p-6 cursor-pointer bg-black/35 backdrop-blur-md transition-all hover:bg-black/45 group"
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                className="px-6 py-3 rounded-full bg-white/95 text-gray-900 border border-white/60 shadow-xl flex items-center gap-2.5 transition"
              >
                <Lock className="w-4 h-4 text-rose-500" />
                <span className="font-bold text-sm tracking-wide">
                  {isSubscribersOnly
                    ? '👑 Subscribers Only'
                    : `🔒 Unlock • $${Number(post?.price || 0).toFixed(2)}`}
                </span>
              </motion.div>
              <p className="text-white/90 text-xs mt-2.5 font-medium drop-shadow-md">
                Tap to unlock inline without leaving the feed
              </p>
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
              <motion.button
                whileTap={{ scale: 0.85 }}
                animate={isLiked ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={{ duration: 0.25 }}
                onClick={handleLike}
                className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
              </motion.button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!currentUser) { navigate('/login'); return; }
                  if (isBlockedByNSFW) { alert('Enable NSFW to view.'); return; }
                  if (isLocked) { setShowUnlockModal(true); return; }
                  if (onPostClick) onPostClick(post);
                }}
                className="text-gray-600 hover:text-rose-500 transition"
              >
                <MessageCircle className="w-6 h-6" />
              </button>
            </div>

            {!isOwnPost && !isLocked && tipCreator && (
              <button
                onClick={handleTipClick}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-full transition"
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

      <PostUnlockSheet
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        post={post}
        creator={creator}
        onUnlocked={() => setCanView(true)}
      />

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