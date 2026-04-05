// src/pages/CreatorProfile/CreatorProfile.jsx - FIXED

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Settings, ArrowLeft, Lock, Star,
  MapPin, Calendar, Link as LinkIcon, MoreVertical, Archive,
  Loader2, Camera, Flag, Ban, X, Eye, EyeOff, Video, Phone, Gift,
  ShieldOff, RotateCcw
} from 'lucide-react';

import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getUserProfile, getUserByUsername, updateUserProfile } from '../../services/firestoreService';
import { getUserPosts } from '../../services/postService';
import { hasActiveSubscription, getOrCreateConversation } from '../../services/messageService';
import { blockUser, unblockUser, isUserBlocked, reportUser } from '../../services/userService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';
import FollowButton from '../../components/common/FollowButton';
import PostCard from '../../components/feed/PostCard';
import PostModal from '../../components/Modals/PostModal';
import TipModal from '../../components/Modals/TipModal';
import SubscribeModal from '../../components/Payment/SubscribeModal';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useContentSettings } from '../../hooks/useContentSettings';

export default function CreatorProfile() {
  const navigate = useNavigate();
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { showNSFW, setShowNSFW } = useContentSettings();

  const [activeTab, setActiveTab] = useState('posts');
  const [archivedPosts, setArchivedPosts] = useState([]);
  const [creator, setCreator] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [checkingBlock, setCheckingBlock] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  const isOwnProfile = currentUser && creator && currentUser.uid === creator.uid;

  useEffect(() => { loadCreatorData(); }, [username]);

  useEffect(() => {
    if (creator && currentUser && !isOwnProfile) {
      checkSubscriptionStatus();
      checkBlockStatus();
    }
  }, [creator?.uid, currentUser?.uid]);

  const checkSubscriptionStatus = async () => {
    try {
      setCheckingSubscription(true);
      const has = await hasActiveSubscription(currentUser.uid, creator.uid);
      setIsSubscribed(has);
    } catch (e) { console.error(e); }
    finally { setCheckingSubscription(false); }
  };

  const checkBlockStatus = async () => {
    try {
      setCheckingBlock(true);
      const blocked = await isUserBlocked(currentUser.uid, creator.uid);
      setIsBlocked(blocked);
    } catch (e) { console.error(e); }
    finally { setCheckingBlock(false); }
  };

  const loadCreatorData = async () => {
    try {
      setLoading(true);
      let foundCreator;
      if (username) foundCreator = await getUserByUsername(username);
      else if (currentUser) foundCreator = await getUserProfile(currentUser.uid);

      if (!foundCreator) { setCreator(null); return; }

      const uid = foundCreator.uid || foundCreator.id;

      // ✅ Count active subscribers directly from subscriptions collection (accurate for all existing subs)
      let subscriberCount = 0;
      try {
        const subsSnap = await getDocs(query(
          collection(db, 'subscriptions'),
          where('creatorId', '==', uid),
          where('status', '==', 'active')
        ));
        const now = new Date();
        subscriberCount = subsSnap.docs.filter(d => {
          const expiry = d.data().expiresAt?.toDate?.();
          return !expiry || expiry > now;
        }).length;
      } catch (e) {
        // fallback to stored count if query fails
        subscriberCount = foundCreator.subscribersCount || foundCreator.subscribers || 0;
      }

      const creatorObj = {
        uid,
        username: foundCreator.username || 'user',
        name: foundCreator.displayName || foundCreator.name || 'User',
        avatar: foundCreator.avatar || foundCreator.photoURL || null,
        banner: foundCreator.banner || null,
        profilePicture: foundCreator.profilePicture || null,
        bio: foundCreator.bio || 'No bio yet',
        location: (() => {
          const loc = foundCreator.location;
          if (!loc) return null;
          if (typeof loc === 'object') return loc.countryName || loc.city || loc.label || null;
          return loc;
        })(),
        joined: foundCreator.createdAt
          ? foundCreator.createdAt.toDate
            ? foundCreator.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : foundCreator.createdAt.seconds
              ? new Date(foundCreator.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : 'Recently'
          : 'Recently',
        website: foundCreator.website || foundCreator.socialLinks?.website || '',
        socialLinks: foundCreator.socialLinks || {},
        verified: foundCreator.kycStatus === 'approved' || false,
        followers: foundCreator.followersCount || foundCreator.followers || 0,
        subscribers: subscriberCount,
        postsCount: 0,
        subscriptionPrice: foundCreator.subscriptionPriceMonthly ?? foundCreator.subscriptionPrice ?? 9.99,
        subscriptionPriceMonthly: foundCreator.subscriptionPriceMonthly ?? foundCreator.subscriptionPrice ?? 9.99,
        subscriptionPriceWeekly:  foundCreator.subscriptionPriceWeekly  ?? null,
        subscriptionPriceDaily:   foundCreator.subscriptionPriceDaily   ?? null,
        isCreator: foundCreator.isCreator || false,
      };

      setCreator(creatorObj);

      // Load call availability
      try {
        const availDoc = await getDoc(doc(db, 'creator_availability', uid));
        if (availDoc.exists()) {
          const avail = availDoc.data();
          setCreator(prev => ({
            ...prev,
            videoCallPrice: avail.callsEnabled ? avail.videoCallPrice : null,
            voiceCallPrice: avail.callsEnabled ? avail.voiceCallPrice : null,
          }));
        }
      } catch (err) { console.error('Availability error:', err); }

      // ✅ Posts sorted newest first, pinned on top
      const userPosts = await getUserPosts(uid);
      const activePosts = userPosts.filter(p => !p.archived);
      const archived = userPosts.filter(p => p.archived);

      const sortPosts = (arr) => [...arr].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const getTime = p => {
          if (!p.createdAt) return 0;
          if (p.createdAt.toDate) return p.createdAt.toDate().getTime();
          if (p.createdAt.seconds) return p.createdAt.seconds * 1000;
          return 0;
        };
        return getTime(b) - getTime(a);
      });

      const sortedActive  = sortPosts(activePosts);
      const sortedArchived = sortPosts(archived);

      setPosts(sortedActive);
      setArchivedPosts(sortedArchived);
      setCreator(prev => ({ ...prev, postsCount: sortedActive.length }));
    } catch (error) {
      console.error('Error loading creator:', error);
      setCreator(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Refresh counts — query subscriptions collection for accurate live count
  const refreshCreatorCounts = useCallback(async () => {
    try {
      let foundCreator;
      if (username) foundCreator = await getUserByUsername(username);
      else if (currentUser) foundCreator = await getUserProfile(currentUser.uid);
      if (!foundCreator) return;

      const uid = foundCreator.uid || foundCreator.id;

      // Count active subscriptions directly from collection for accuracy
      const subsSnap = await getDocs(query(
        collection(db, 'subscriptions'),
        where('creatorId', '==', uid),
        where('status', '==', 'active')
      ));
      const now = new Date();
      const activeCount = subsSnap.docs.filter(d => {
        const expiry = d.data().expiresAt?.toDate?.();
        return !expiry || expiry > now;
      }).length;

      setCreator(prev => ({
        ...prev,
        followers: foundCreator.followersCount || foundCreator.followers || 0,
        subscribers: activeCount,
      }));
    } catch (e) { console.error(e); }
  }, [username, currentUser]);

  const handleFollowChange = async () => { await refreshCreatorCounts(); };

  const handleMessage = async () => {
    if (!currentUser) { alert('Please login to send messages'); return; }
    try {
      setSendingMessage(true);
      await getOrCreateConversation(currentUser.uid, creator.uid);
      navigate(`/messages?with=${creator.uid}`);
    } catch (error) {
      if (error.message?.includes('subscription')) {
        const shouldSubscribe = window.confirm(
          `You need an active subscription to message ${creator.name}.\n\nSubscribe to unlock messaging!`
        );
        if (shouldSubscribe) handleSubscribe();
      } else {
        alert(error.message || 'Failed to start conversation');
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSubscribe = () => {
    if (!currentUser) { navigate('/login'); return; }
    setShowSubscribeModal(true);
  };

  const handleAvatarUpload = async (e) => {
    if (!isOwnProfile || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) { alert('Image must be less than 5MB'); return; }
    if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
    try {
      setUploadingAvatar(true);
      const result = await uploadMedia(file, 'avatars');
      if (!result?.cdnUrl) throw new Error('Upload failed');
      await updateUserProfile(currentUser.uid, { avatar: result.cdnUrl });
      setCreator(prev => ({ ...prev, avatar: result.cdnUrl }));
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e) => {
    if (!isOwnProfile || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 10 * 1024 * 1024) { alert('Image must be less than 10MB'); return; }
    if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
    try {
      setUploadingBanner(true);
      const result = await uploadMedia(file, 'banners');
      if (!result?.cdnUrl) throw new Error('Upload failed');
      await updateUserProfile(currentUser.uid, { banner: result.cdnUrl });
      setCreator(prev => ({ ...prev, banner: result.cdnUrl }));
    } catch (error) {
      console.error('Banner upload error:', error);
      alert('Failed to upload banner.');
    } finally {
      setUploadingBanner(false);
      e.target.value = '';
    }
  };

  // ✅ FIXED: block stays on page, shows unblock option
  const handleBlock = async () => {
    if (!window.confirm(`Block @${creator.username}?`)) return;
    try {
      await blockUser(currentUser.uid, creator.uid);
      setIsBlocked(true);
      setShowMoreMenu(false);
      alert(`@${creator.username} has been blocked. You can unblock them from the menu.`);
    } catch { alert('Failed to block user'); }
  };

  // ✅ FIXED: unblock works and updates UI
  const handleUnblock = async () => {
    if (!window.confirm(`Unblock @${creator.username}?`)) return;
    try {
      await unblockUser(currentUser.uid, creator.uid);
      setIsBlocked(false);
      setShowMoreMenu(false);
      alert(`@${creator.username} has been unblocked.`);
    } catch { alert('Failed to unblock user'); }
  };

  const handleReport = async (reason) => {
    try {
      await reportUser(currentUser.uid, creator.uid, reason);
      setShowReportModal(false);
      alert('Report submitted. Thank you.');
    } catch { alert('Failed to submit report'); }
  };

  const handlePostDeleted = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    setArchivedPosts(prev => prev.filter(p => p.id !== postId));
    setCreator(prev => ({ ...prev, postsCount: Math.max(0, (prev?.postsCount || 1) - 1) }));
  };

  const handlePostArchived = (postId) => {
    const post = posts.find(p => p.id === postId);
    if (post) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      setArchivedPosts(prev => [{ ...post, archived: true }, ...prev]);
      setCreator(prev => ({ ...prev, postsCount: Math.max(0, (prev?.postsCount || 1) - 1) }));
    }
  };

  const handlePostUnarchived = (postId) => {
    const post = archivedPosts.find(p => p.id === postId);
    if (post) {
      setArchivedPosts(prev => prev.filter(p => p.id !== postId));
      const restored = { ...post, archived: false };
      setPosts(prev => {
        const updated = [restored, ...prev];
        return updated.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const getTime = p => p.createdAt?.toDate?.()?.getTime?.() || p.createdAt?.seconds * 1000 || 0;
          return getTime(b) - getTime(a);
        });
      });
      setCreator(prev => ({ ...prev, postsCount: (prev?.postsCount || 0) + 1 }));
    }
  };

  const handlePostClick = (post) => {
    const rating = (post?.contentRating || 'sfw').toLowerCase();
    if (!showNSFW && rating === 'nsfw') {
      alert('NSFW is hidden. Turn on "Show NSFW" to view this content.');
      return;
    }
    setSelectedPost(post);
    setShowPostModal(true);
  };

  const filteredActivePosts = useMemo(() => {
    if (showNSFW) return posts;
    return posts.filter(p => (p?.contentRating || 'sfw').toLowerCase() !== 'nsfw');
  }, [posts, showNSFW]);

  const filteredArchivedPosts = useMemo(() => {
    if (showNSFW) return archivedPosts;
    return archivedPosts.filter(p => (p?.contentRating || 'sfw').toLowerCase() !== 'nsfw');
  }, [archivedPosts, showNSFW]);

  const isArchiveTab = activeTab === 'archive';
  const displayPosts = isArchiveTab ? filteredArchivedPosts : filteredActivePosts;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Not Found</h2>
          <button onClick={() => navigate('/feed')} className="px-6 py-3 bg-rose-500 text-white rounded-lg font-semibold">
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  // ✅ More menu — shows Report, Block/Unblock
  const moreMenuContent = (
    <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-48 z-30">
      {/* ✅ Report is visible */}
      <button
        onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }}
        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
      >
        <Flag className="w-4 h-4" /><span>Report</span>
      </button>
      {/* ✅ FIXED: shows Unblock if blocked, Block if not */}
      {isBlocked ? (
        <button
          onClick={handleUnblock}
          className="w-full px-4 py-2 text-left hover:bg-green-50 flex items-center space-x-2 text-green-600"
        >
          <ShieldOff className="w-4 h-4" /><span>Unblock</span>
        </button>
      ) : (
        <button
          onClick={handleBlock}
          className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
        >
          <Ban className="w-4 h-4" /><span>Block</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">

      {/* ✅ FIXED: Mobile header — no shift, fixed height */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-[52px]">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-900 truncate mx-2">@{creator.username}</h1>
          {!isOwnProfile ? (
            <div className="relative">
              <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
                  {moreMenuContent}
                </>
              )}
            </div>
          ) : (
            <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop back */}
      <div className="hidden lg:block bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition">
            <ArrowLeft className="w-5 h-5" /><span className="font-medium">Back to Feed</span>
          </button>
          {!isOwnProfile && (
            <div className="relative">
              <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
                  {moreMenuContent}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto">

          {/* Banner */}
          <div className="relative h-36 sm:h-48 md:h-56 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 overflow-hidden group">
            {creator.banner
              ? <img src={creator.banner} alt="Banner" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-7xl opacity-30">🎨</div>}
            {isOwnProfile && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition cursor-pointer">
                <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" disabled={uploadingBanner} />
                {uploadingBanner
                  ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                  : <div className="text-white text-center">
                      <Camera className="w-8 h-8 mx-auto mb-1" />
                      <p className="text-sm font-semibold">Change Banner</p>
                    </div>}
              </label>
            )}
          </div>

          {/* Profile info */}
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            {/* Avatar row — use pt to overlap banner instead of negative margin */}
            <div className="flex items-end justify-between" style={{ marginTop: '-2.5rem' }}>
              {/* Avatar */}
              <div className="relative group flex-shrink-0 z-10">
                <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 border-4 border-white flex items-center justify-center text-4xl shadow-lg overflow-hidden">
                  {creator.avatar
                    ? <img src={creator.avatar} alt={creator.name} className="w-full h-full object-cover" />
                    : <span>👤</span>}
                </div>
                {isOwnProfile && (
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-full cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
                    {uploadingAvatar
                      ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                      : <Camera className="w-5 h-5 text-white" />}
                  </label>
                )}
                {creator.verified && (
                  <div className="absolute bottom-0 right-0 bg-blue-500 text-white p-1 rounded-full border-2 border-white">
                    <Star className="w-3 h-3 fill-white" />
                  </div>
                )}
              </div>

              {/* Own profile: Edit Profile button */}
              {isOwnProfile && (
                <div className="flex items-center gap-2 mb-1 z-10">
                  <button
                    onClick={() => navigate('/settings')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full font-semibold text-sm transition border border-gray-200"
                  >
                    Edit Profile
                  </button>
                </div>
              )}
            </div>


            {/* Name */}
            <div className="mb-2">
              <div className="flex items-center space-x-2 mb-0.5">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{creator.name}</h1>
                {creator.verified && (
                  <div className="bg-blue-500 text-white p-0.5 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">@{creator.username}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-5 sm:gap-8 mb-3">
              <div>
                <span className="text-xl font-bold text-gray-900">{creator.postsCount}</span>
                <span className="text-gray-500 ml-1 text-sm">Posts</span>
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900">{creator.followers}</span>
                <span className="text-gray-500 ml-1 text-sm">Followers</span>
              </div>
              {/* ✅ FIXED: subscribers count shows correctly */}
              <div>
                <span className="text-xl font-bold text-gray-900">{creator.subscribers}</span>
                <span className="text-gray-500 ml-1 text-sm">Subscribers</span>
              </div>
            </div>

            {/* Bio */}
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{creator.bio}</p>

            {/* Meta row — location + joined date only */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
              {creator.location && (
                <div className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{creator.location}</span>
                </div>
              )}
              <div className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Joined {creator.joined}</span>
              </div>
            </div>

            {/* Social media + website buttons */}
            {(() => {
              const sl = creator.socialLinks || {};
              const web = sl.website || creator.website;
              const hasAny = sl.instagram || sl.twitter || sl.tiktok || web;
              if (!hasAny) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {sl.instagram && (
                    <a
                      href={`https://instagram.com/${sl.instagram.replace('@','')}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold hover:opacity-90 transition"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                      Instagram
                    </a>
                  )}
                  {sl.twitter && (
                    <a
                      href={`https://x.com/${sl.twitter.replace('@','')}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white text-xs font-semibold hover:opacity-80 transition"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X / Twitter
                    </a>
                  )}
                  {sl.tiktok && (
                    <a
                      href={`https://tiktok.com/@${sl.tiktok.replace('@','')}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold hover:opacity-80 transition"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.19 8.19 0 004.79 1.53V6.78a4.85 4.85 0 01-1.02-.09z"/></svg>
                      TikTok
                    </a>
                  )}
                  {web && (
                    <a
                      href={web.startsWith('http') ? web : `https://${web}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold hover:opacity-80 transition"
                    >
                      <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      Website
                    </a>
                  )}
                </div>
              );
            })()}

            {/* ✅ FIXED: Action buttons below name/bio, not overlapping banner */}
            {!isOwnProfile && (
              <div className="flex items-center flex-wrap gap-2 mt-3">
                {/* NSFW toggle */}
                <button
                  onClick={() => setShowNSFW(v => !v)}
                  className={`px-3 py-1.5 rounded-full font-semibold text-xs transition border flex items-center gap-1 ${
                    showNSFW ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  {showNSFW ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}</span>
                </button>

                {creator.videoCallPrice && (
                  <button onClick={() => navigate(`/book-video-call/${creator.uid}`)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-full border-2 border-rose-200 hover:bg-rose-50 transition text-xs font-semibold text-rose-600">
                    <Video className="w-3.5 h-3.5" />
                    <span>${creator.videoCallPrice}</span>
                  </button>
                )}

                {creator.voiceCallPrice && (
                  <button onClick={() => navigate(`/book-voice-call/${creator.uid}`)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-full border-2 border-purple-200 hover:bg-purple-50 transition text-xs font-semibold text-purple-600">
                    <Phone className="w-3.5 h-3.5" />
                    <span>${creator.voiceCallPrice}</span>
                  </button>
                )}

                <button
                  onClick={() => { if (!currentUser) { navigate('/login'); return; } setShowTipModal(true); }}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-full border-2 border-yellow-300 bg-yellow-50 hover:bg-yellow-100 transition text-xs font-semibold text-yellow-700"
                >
                  <Gift className="w-3.5 h-3.5" /><span>Gift</span>
                </button>

                <button onClick={handleMessage} disabled={sendingMessage}
                  className="p-2 rounded-full border-2 border-gray-200 hover:bg-gray-50 transition disabled:opacity-50 relative">
                  {sendingMessage
                    ? <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                    : <>
                        <MessageCircle className="w-4 h-4 text-gray-600" />
                        {!isSubscribed && <Lock className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-rose-500 bg-white rounded-full" />}
                      </>}
                </button>

                <FollowButton userId={creator.uid} username={creator.username} size="md" onFollowChange={handleFollowChange} />

                <button
                  onClick={handleSubscribe}
                  className={`px-4 py-2 rounded-full font-bold text-sm transition shadow-sm ${
                    isSubscribed
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700'
                  }`}
                >
                {isSubscribed ? '✓ Subscribed' : `Subscribe • $${Number(creator.subscriptionPriceMonthly ?? creator.subscriptionPrice ?? 9.99).toFixed(2)}/mo`}
                </button>
              </div>
            )}

            {/* NSFW toggle for own profile */}
            {isOwnProfile && (
              <div className="mt-3">
                <button
                  onClick={() => setShowNSFW(v => !v)}
                  className={`px-3 py-1.5 rounded-full font-semibold text-xs transition border flex items-center gap-1 ${
                    showNSFW ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  {showNSFW ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}</span>
                </button>
              </div>
            )}

            {!showNSFW && (
              <div className="mt-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5" />NSFW content is hidden on this profile.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ FIXED: Tabs sticky below mobile header (52px) */}
      <div className="bg-white border-b border-gray-200 sticky top-[52px] lg:top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex space-x-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-3 font-semibold border-b-2 transition whitespace-nowrap text-sm ${
                activeTab === 'posts' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Posts ({creator.postsCount})
            </button>
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab('archive')}
                className={`py-3 font-semibold border-b-2 transition whitespace-nowrap text-sm ${
                  activeTab === 'archive' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Archive {archivedPosts.length > 0 && `(${archivedPosts.length})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="max-w-4xl mx-auto px-4 py-5">
        {displayPosts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            {isArchiveTab
              ? <><Archive className="w-14 h-14 text-gray-200 mx-auto mb-3" /><p className="text-gray-500 font-semibold">No archived posts</p></>
              : <><MessageCircle className="w-14 h-14 text-gray-200 mx-auto mb-3" /><p className="text-gray-500">{showNSFW ? 'No posts yet' : 'No visible posts (NSFW may be hidden)'}</p></>}
          </div>
        ) : (
          <div className="space-y-5">
            {displayPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onDelete={handlePostDeleted}
                onArchive={handlePostArchived}
                onUnarchive={handlePostUnarchived}
                showPinnedIndicator={true}
                onPostClick={handlePostClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Post Modal */}
      <PostModal
        isOpen={showPostModal}
        onClose={() => { setShowPostModal(false); setSelectedPost(null); }}
        post={selectedPost}
        onPostUpdate={(updatedPost) => {
          if (!selectedPost) return;
          if (updatedPost === null) {
            handlePostDeleted(selectedPost.id);
            setShowPostModal(false);
            setSelectedPost(null);
          } else {
            if (updatedPost.archived && !selectedPost.archived) handlePostArchived(updatedPost.id);
            else if (!updatedPost.archived && selectedPost.archived) handlePostUnarchived(updatedPost.id);
            else {
              setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
              setArchivedPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
            }
            setSelectedPost(updatedPost);
          }
        }}
      />

      {/* Tip Modal */}
      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} creator={creator} />

      {/* ✅ FIXED: Subscribe Modal with count refresh */}
      <SubscribeModal
        isOpen={showSubscribeModal}
        onClose={() => setShowSubscribeModal(false)}
        creator={creator}
        onSuccess={(duration) => {
          setIsSubscribed(true);
          setShowSubscribeModal(false);
          // Optimistically increment subscriber count immediately
          setCreator(prev => ({ ...prev, subscribers: (prev?.subscribers || 0) + 1 }));
          // Then refresh from Firestore after delay to confirm
          setTimeout(() => refreshCreatorCounts(), 2000);
        }}
      />

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowReportModal(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-900">Report @{creator.username}</h3>
                <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="space-y-2">
                {['Spam or misleading', 'Inappropriate content', 'Harassment or bullying', 'Impersonation', 'Scam or fraud', 'Other'].map(reason => (
                  <button key={reason} onClick={() => handleReport(reason)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg transition border border-gray-100 text-sm">
                    {reason}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4 text-center">Reports are anonymous.</p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}