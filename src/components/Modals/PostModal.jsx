// src/components/Modals/PostModal.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, MessageCircle, Send, MoreVertical, Trash2,
  Pin, Archive, RotateCcw, EyeOff, Eye, Lock, Gift
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

export default function PostModal({ isOpen, onClose, post, onPostUpdate }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const { showNSFW, setShowNSFW } = useContentSettings();

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

  // ✅ Tip modal
  const [showTipModal, setShowTipModal] = useState(false);

  const imageUrl = getPostImage(post);
  const rating = (post?.contentRating || 'sfw').toLowerCase();
  const isNSFW = rating === 'nsfw';
  const nsfwHidden = isNSFW && !showNSFW;
  const isPaid = (post?.type || 'free') !== 'free' && Number(post?.price || 0) > 0;
  const isOwnPost = currentUser?.uid === post?.userId;
  const isLocked = isPaid && !isOwnPost && !canView;

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
    if (isOpen && post) loadComments();
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
    try {
      setLoadingComments(true);
      const fetched = await getPostComments(post.id);
      setComments(fetched);
    } catch (e) { console.error(e); }
    finally { setLoadingComments(false); }
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
      setComments([newComment, ...comments]);
      setCommentsCount(prev => prev + 1);
      setComment('');
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
      const newPinnedState = !post.pinned;
      await updatePost(post.id, { pinned: newPinnedState });
      setShowMenu(false);
      if (onPostUpdate) onPostUpdate({ ...post, pinned: newPinnedState });
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
      await updateDoc(doc(db, 'posts', post.id), { archived: false, archivedAt: null });
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

  const goToUnlock = () => navigate('/wallet', { state: { action: 'unlock', postId: post?.id, creatorId: post?.userId, price: Number(post?.price || 0) } });
  const goToSubscribe = () => navigate('/wallet', { state: { action: 'subscribe', creatorId: post?.userId, price: Number(post?.subscriptionPrice || 9.99) } });

  if (!isOpen || !post) return null;

  // Build creator object for TipModal
  const tipCreator = postCreator ? {
    uid: postCreator.uid || postCreator.id || post.userId,
    name: postCreator.displayName || postCreator.name || 'Creator',
    avatar: postCreator.profilePicture || postCreator.avatar || null,
  } : null;

  return (
    <>
      <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl overflow-hidden max-w-6xl w-full max-h-[90vh] flex flex-col md:flex-row"
        >
          {/* Left - Media */}
          <div className="flex-1 bg-black flex items-center justify-center relative min-h-[300px] md:min-h-0">
            <div className="w-full h-full flex items-center justify-center p-4">
              {isLocked ? (
                <div className="max-w-md w-full bg-white/10 border border-white/20 rounded-2xl p-6 text-white">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg">Locked post</p>
                      <p className="text-sm text-white/80 mt-1">Unlock this post to view it.</p>
                      <button onClick={goToUnlock} className="mt-4 w-full px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold text-sm">
                        Unlock • ${Number(post?.price || 0).toFixed(2)}
                      </button>
                      <button onClick={goToSubscribe} className="mt-2 w-full px-4 py-2 bg-white/20 text-white rounded-lg font-semibold text-sm border border-white/30">
                        Subscribe to unlock all
                      </button>
                    </div>
                  </div>
                </div>
              ) : nsfwHidden ? (
                <div className="max-w-md w-full bg-white/10 border border-white/20 rounded-2xl p-6 text-white">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <EyeOff className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg">NSFW content hidden</p>
                      <p className="text-sm text-white/80 mt-1">Turn on Show NSFW to view adult content.</p>
                      <button onClick={() => setShowNSFW(true)} className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold text-sm">
                        <Eye className="w-4 h-4" /><span>Enable NSFW</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : imageUrl ? (
                (() => {
                  const mediaItem = post?.images?.[0];
                  const isVideo = mediaItem?.type === 'video' || /\.(mp4|mov|avi|webm|mkv)$/i.test(imageUrl);
                  return isVideo
                    ? <video src={imageUrl} controls playsInline preload="metadata" className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
                    : <img src={imageUrl} alt="Post" className="max-w-full max-h-full object-contain" />;
                })()
              ) : (
                <span className="text-9xl">📸</span>
              )}
            </div>

            <button onClick={onClose} className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition z-10">
              <X className="w-6 h-6" />
            </button>

            <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isNSFW ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}>{isNSFW ? 'NSFW' : 'SFW'}</span>
              <button onClick={() => setShowNSFW(!showNSFW)}
                className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
                  showNSFW ? 'bg-white text-gray-900 border-white' : 'bg-black/40 text-white border-white/30 hover:bg-black/60'
                }`}>
                {showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}
              </button>
            </div>
          </div>

          {/* Right - Details */}
          <div className="w-full md:w-96 lg:w-[450px] flex flex-col bg-white max-h-[50vh] md:max-h-full">
            {/* Creator Info */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div onClick={() => postCreator?.username && navigate(`/creator/${postCreator.username}`)}
                className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-2xl overflow-hidden">
                  {postCreator?.profilePicture || postCreator?.avatar
                    ? <img src={postCreator.profilePicture || postCreator.avatar} alt="" className="w-full h-full object-cover" />
                    : postCreator?.displayName?.charAt(0)?.toUpperCase() || '👤'}
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <h3 className="font-bold text-gray-900">{postCreator?.displayName || 'Loading...'}</h3>
                    {postCreator?.kycStatus === 'approved' && <span className="text-blue-500">✓</span>}
                  </div>
                  <p className="text-sm text-gray-500">@{postCreator?.username || 'creator'}</p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                {/* ✅ Tip button in modal — only show for other people's posts */}
                {!isOwnPost && tipCreator && currentUser && (
                  <button
                    onClick={() => setShowTipModal(true)}
                    className="p-2 hover:bg-yellow-50 rounded-lg transition"
                    title="Send a gift"
                  >
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
                                <Pin className="w-4 h-4" /><span>{post.pinned ? 'Unpin' : 'Pin'}</span>
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
            </div>

            {isLocked ? (
              <div className="p-6">
                <p className="text-gray-900 font-bold text-lg mb-2">This post is locked</p>
                <p className="text-gray-600 text-sm mb-4">Unlock to view caption, comments, and interact.</p>
                <button onClick={goToUnlock} className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition">
                  Unlock • ${Number(post?.price || 0).toFixed(2)}
                </button>
                <button onClick={goToSubscribe} className="w-full mt-2 bg-gray-100 hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold transition">
                  Subscribe to unlock all
                </button>
              </div>
            ) : (
              <>
                {/* Caption */}
                <div className="p-4 border-b border-gray-200">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {post.content
                      ? post.content.split(/(\s+)/).map((word, i) =>
                          /^(https?:\/\/|www\.)\S+/.test(word)
                            ? <a key={i} href={word.startsWith('http') ? word : `https://${word}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-rose-500 underline break-all hover:text-rose-600">{word}</a>
                            : word
                        )
                      : 'No caption'}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">{formatDate(post.createdAt)}</p>
                </div>

                {/* Comments */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingComments ? (
                    <div className="text-center py-4"><div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                  ) : comments.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No comments yet</p>
                  ) : (
                    comments.map((c, idx) => (
                      <div key={c.id || idx} className="flex space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                          {c.userAvatar ? <img src={c.userAvatar} alt="" className="w-full h-full object-cover" /> : c.userName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1">
                          <div className="bg-gray-50 rounded-2xl px-4 py-3">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-semibold text-gray-900 text-sm">{c.userName}</span>
                              <span className="text-gray-500 text-xs">{formatDate(c.createdAt)}</span>
                            </div>
                            <p className="text-gray-700 text-sm">{c.text}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Actions */}
                <div className="border-t border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button onClick={handleLike} disabled={nsfwHidden}
                        className={`transition ${isLiked ? 'text-rose-500' : 'text-gray-600 hover:text-rose-500'}`}>
                        <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
                      </button>
                      <button className="text-gray-600 hover:text-rose-500 transition">
                        <MessageCircle className="w-6 h-6" />
                      </button>
                    </div>
                    {/* ✅ Tip button in actions bar */}
                    {!isOwnPost && tipCreator && currentUser && (
                      <button onClick={() => setShowTipModal(true)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-full transition">
                        <Gift className="w-4 h-4 text-yellow-600" />
                        <span className="text-xs font-bold text-yellow-700">Gift</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="font-bold text-gray-900">{likesCount} likes</p>
                    <p className="text-sm text-gray-500">{commentsCount} comments</p>
                  </div>

                  {currentUser && (
                    <form onSubmit={handleCommentSubmit} className="flex items-center space-x-2 sm:space-x-3">
                      <input
                        type="text"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Add a comment..."
                        disabled={postingComment || nsfwHidden}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                      />
                      <button type="submit" disabled={!comment.trim() || postingComment || nsfwHidden}
                        className={`p-2.5 rounded-full transition flex-shrink-0 ${
                          comment.trim() && !postingComment && !nsfwHidden
                            ? 'bg-rose-500 hover:bg-rose-600 text-white'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}>
                        <Send className="w-4 h-4 sm:w-5 sm:h-5" />
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

      {/* Tip Modal — outside AnimatePresence to avoid duplicate key */}
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