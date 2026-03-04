// src/pages/CreatorProfile/CreatorProfile.jsx - UPDATED: NSFW GLOBAL FILTER + POST MODAL

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Settings,
  ArrowLeft,
  Lock,
  Star,
  MapPin,
  Calendar,
  Link as LinkIcon,
  MoreVertical,
  Archive,
  Loader2,
  Camera,
  Flag,
  Ban,
  X,
  Eye,
  EyeOff,
  Video, Phone 
} from 'lucide-react';

import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getUserProfile, getUserByUsername, updateUserProfile } from '../../services/firestoreService';
import { getUserPosts } from '../../services/postService';
import { hasActiveSubscription, getOrCreateConversation } from '../../services/messageService';
import { blockUser, reportUser } from '../../services/userService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';
import FollowButton from '../../components/common/FollowButton';
import PostCard from '../../components/feed/PostCard';
import PostModal from '../../components/Modals/PostModal';
import { doc, getDoc } from 'firebase/firestore';
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

  // New states
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // ✅ Post modal
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);

  const isOwnProfile = currentUser && creator && currentUser.uid === creator.uid;

  useEffect(() => {
    loadCreatorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (creator && currentUser && !isOwnProfile) {
      checkSubscriptionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creator, currentUser]);

  const checkSubscriptionStatus = async () => {
    try {
      setCheckingSubscription(true);
      const hasSubscription = await hasActiveSubscription(currentUser.uid, creator.uid);
      setIsSubscribed(hasSubscription);
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const loadCreatorData = async () => {
    try {
      setLoading(true);
      let foundCreator;

      if (username) {
        foundCreator = await getUserByUsername(username);
      } else if (currentUser) {
        foundCreator = await getUserProfile(currentUser.uid);
      }

      if (foundCreator) {
        const uid = foundCreator.uid || foundCreator.id;

        setCreator({
          uid,
          username: foundCreator.username || 'user',
          name: foundCreator.displayName || foundCreator.name || 'User',
          avatar: foundCreator.avatar || foundCreator.photoURL || null,
          banner: foundCreator.banner || null,
          bio: foundCreator.bio || 'No bio yet',
          location: foundCreator.location || null,
          joined: foundCreator.createdAt
            ? foundCreator.createdAt.toDate
              ? foundCreator.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : foundCreator.createdAt.seconds
                ? new Date(foundCreator.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : 'Recently'
            : 'Recently',
          website: foundCreator.website || '',
          verified: foundCreator.kycStatus === 'approved' || false,
          followers: foundCreator.followersCount || foundCreator.followers || 0,
          subscribers: foundCreator.subscribersCount || 0,
          postsCount: 0,
          subscriptionPrice: foundCreator.subscriptionPrice || 9.99
        });


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
        } catch (err) {
          console.error('Error loading availability:', err);
        }

        const userPosts = await getUserPosts(uid);
        const activePosts = userPosts.filter((p) => !p.archived);
        const archived = userPosts.filter((p) => p.archived);

        // sort pinned -> newest
        activePosts.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;

          const getTime = (post) => {
            if (!post.createdAt) return 0;
            if (post.createdAt.toDate) return post.createdAt.toDate().getTime();
            if (post.createdAt.seconds) return post.createdAt.seconds * 1000;
            if (post.createdAt instanceof Date) return post.createdAt.getTime();
            if (typeof post.createdAt === 'number') return post.createdAt;
            return 0;
          };

          return getTime(b) - getTime(a);
        });

        setPosts(activePosts);
        setArchivedPosts(archived);
        setCreator((prev) => ({ ...prev, postsCount: activePosts.length }));
      } else {
        setCreator(null);
      }
    } catch (error) {
      console.error('Error loading creator:', error);
      setCreator(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowChange = async () => {
    try {
      let foundCreator;
      if (username) foundCreator = await getUserByUsername(username);
      else if (currentUser) foundCreator = await getUserProfile(currentUser.uid);

      if (foundCreator) {
        setCreator((prev) => ({
          ...prev,
          followers: foundCreator.followersCount || foundCreator.followers || 0,
          subscribers: foundCreator.subscribersCount || 0
        }));
      }
    } catch (error) {
      console.error('Error updating follower count:', error);
    }
  };

  const handleMessage = async () => {
    if (!currentUser) {
      alert('Please login to send messages');
      return;
    }

    try {
      setSendingMessage(true);
      await getOrCreateConversation(currentUser.uid, creator.uid);
      navigate(`/messages?with=${creator.uid}`);
    } catch (error) {
      console.error('Error in handleMessage:', error);
      if (error.message?.includes('subscription')) {
        const shouldSubscribe = window.confirm(
          `You need an active subscription to message ${creator.name}.\n\nSubscribe for $${creator.subscriptionPrice}/month to unlock messaging!`
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
    navigate('/wallet', {
      state: {
        action: 'subscribe',
        creatorId: creator.uid,
        creatorName: creator.name,
        price: creator.subscriptionPrice
      }
    });
  };

  const handleAvatarUpload = async (e) => {
    if (!isOwnProfile || !e.target.files?.[0]) return;

    const file = e.target.files[0];

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    try {
      setUploadingAvatar(true);
      const result = await uploadMedia(file, 'avatars', (progress) => {
        console.log(`Upload progress: ${progress}%`);
      });
      await updateUserProfile(currentUser.uid, { avatar: result.url });
      setCreator((prev) => ({ ...prev, avatar: result.url }));
      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (e) => {
    if (!isOwnProfile || !e.target.files?.[0]) return;

    const file = e.target.files[0];

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    try {
      setUploadingBanner(true);
      const result = await uploadMedia(file, 'banners', (progress) => {
        console.log(`Upload progress: ${progress}%`);
      });
      await updateUserProfile(currentUser.uid, { banner: result.url });
      setCreator((prev) => ({ ...prev, banner: result.url }));
      alert('Banner updated successfully!');
    } catch (error) {
      console.error('Error uploading banner:', error);
      alert('Failed to upload banner. Please try again.');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleBlock = async () => {
    const confirmed = window.confirm(`Block @${creator.username}? You won't see their posts or receive messages from them.`);
    if (!confirmed) return;

    try {
      await blockUser(currentUser.uid, creator.uid);
      alert(`@${creator.username} has been blocked`);
      navigate('/feed');
    } catch (error) {
      console.error('Error blocking user:', error);
      alert('Failed to block user');
    }
  };

  const handleReport = async (reason) => {
    try {
      await reportUser(currentUser.uid, creator.uid, reason);
      setShowReportModal(false);
      alert('Report submitted. Our team will review it.');
    } catch (error) {
      console.error('Error reporting user:', error);
      alert('Failed to submit report');
    }
  };

  const handlePostDeleted = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setArchivedPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const closePostModal = () => {
    setShowPostModal(false);
    setSelectedPost(null);
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

  const isArchiveTab = activeTab === 'archive';

  // ✅ Apply global NSFW filter to posts + archived
  const filteredActivePosts = useMemo(() => {
    if (showNSFW) return posts;
    return posts.filter((p) => ((p?.contentRating || 'sfw').toLowerCase() !== 'nsfw'));
  }, [posts, showNSFW]);

  const filteredArchivedPosts = useMemo(() => {
    if (showNSFW) return archivedPosts;
    return archivedPosts.filter((p) => ((p?.contentRating || 'sfw').toLowerCase() !== 'nsfw'));
  }, [archivedPosts, showNSFW]);

  const displayPosts = isArchiveTab ? filteredArchivedPosts : filteredActivePosts;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Not Found</h2>
          <p className="text-gray-600 mb-6">This creator doesn't exist or has been removed.</p>
          <button
            onClick={() => navigate('/feed')}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          <h1 className="text-lg font-bold text-gray-900">@{creator.username}</h1>

          {!isOwnProfile ? (
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-48 z-30">
                  <button
                    onClick={() => {
                      setShowReportModal(true);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                  >
                    <Flag className="w-4 h-4" />
                    <span>Report</span>
                  </button>
                  <button
                    onClick={handleBlock}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-red-600"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Block</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate('/feed')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Feed</span>
          </button>
        </div>
      </div>

      {/* Profile Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          {/* Banner */}
          <div className="relative h-48 sm:h-56 md:h-64 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 overflow-hidden group">
            {creator.banner ? (
              <img src={creator.banner} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl sm:text-7xl md:text-9xl">🎨</div>
            )}

            {isOwnProfile && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  className="hidden"
                  disabled={uploadingBanner}
                />
                {uploadingBanner ? (
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                ) : (
                  <div className="text-white text-center">
                    <Camera className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm font-medium">Change Banner</p>
                  </div>
                )}
              </label>
            )}
          </div>

          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between -mt-12 sm:-mt-16 mb-4 sm:mb-6">
              {/* Avatar */}
              <div className="flex items-end space-x-4 sm:space-x-6">
                <div className="relative group">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 border-4 border-white flex items-center justify-center text-4xl sm:text-5xl md:text-6xl shadow-lg overflow-hidden">
                    {creator.avatar ? <img src={creator.avatar} alt={creator.name} className="w-full h-full object-cover" /> : <span>👤</span>}
                  </div>

                  {isOwnProfile && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-full cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                        disabled={uploadingAvatar}
                      />
                      {uploadingAvatar ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
                    </label>
                  )}

                  {creator.verified && (
                    <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-blue-500 text-white p-1 sm:p-1.5 rounded-full border-2 border-white">
                      <Star className="w-3 h-3 sm:w-4 sm:h-4 fill-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 sm:space-x-3 mt-4 sm:mt-0">
                {/* ✅ Global NSFW toggle */}
                <button
                  type="button"
                  onClick={() => setShowNSFW((v) => !v)}
                  className={`px-4 py-2 sm:py-2.5 rounded-full font-semibold text-sm transition border flex items-center gap-2 ${
                    showNSFW
                      ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                  title={showNSFW ? 'NSFW is visible' : 'NSFW is hidden'}
                >
                  {showNSFW ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span className="hidden sm:inline">{showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}</span>
                </button>

                {!isOwnProfile ? (
                  <>
                    {/* Video Call Button */}
                    {creator.videoCallPrice && (
                      <button
                        onClick={() => navigate(`/book-video-call/${creator.uid}`)}
                        className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full border-2 border-rose-200 hover:bg-rose-50 transition"
                        title={`Book video call • $${creator.videoCallPrice}/15min`}
                      >
                        <Video className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                        <span className="hidden sm:inline text-sm font-semibold text-rose-600">${creator.videoCallPrice}</span>
                      </button>
                    )}

                    {/* Voice Call Button */}
                    {creator.voiceCallPrice && (
                      <button
                        onClick={() => navigate(`/book-voice-call/${creator.uid}`)}
                        className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full border-2 border-purple-200 hover:bg-purple-50 transition"
                        title={`Book voice call • $${creator.voiceCallPrice}/15min`}
                      >
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                        <span className="hidden sm:inline text-sm font-semibold text-purple-600">${creator.voiceCallPrice}</span>
                      </button>
                    )}
                    <button
                      onClick={handleMessage}
                      disabled={sendingMessage}
                      className="p-2 sm:p-3 rounded-full border-2 border-gray-200 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed relative"
                      title={isSubscribed ? 'Send message' : 'Subscribe to message'}
                    >
                      {sendingMessage ? (
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 animate-spin" />
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                          {!isSubscribed && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 text-rose-500 bg-white rounded-full" />}
                        </>
                      )}
                    </button>

                    <FollowButton userId={creator.uid} username={creator.username} size="md" onFollowChange={handleFollowChange} />

                    <button
                      onClick={handleSubscribe}
                      className={`px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 rounded-full font-bold text-sm sm:text-base transition shadow-lg ${
                        isSubscribed
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700'
                      }`}
                    >
                      <span className="hidden sm:inline">
                        {isSubscribed ? 'Subscribed' : `Subscribe • $${creator.subscriptionPrice}/mo`}
                      </span>
                      <span className="sm:hidden">{isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => navigate('/settings')} className="p-2 sm:p-3 rounded-full border-2 border-gray-200 hover:bg-gray-50 transition">
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                    <button
                      onClick={() => navigate('/settings')}
                      className="px-6 sm:px-8 py-2 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full font-bold text-sm sm:text-base transition"
                    >
                      Edit Profile
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mb-3 sm:mb-4">
              <div className="flex items-center space-x-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{creator.name}</h1>
                {creator.verified && (
                  <div className="bg-blue-500 text-white p-1 rounded-full">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-gray-600 text-base sm:text-lg">@{creator.username}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center flex-wrap gap-4 sm:gap-6 md:gap-8 mb-4 sm:mb-6">
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.postsCount}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Posts</span>
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.followers}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Followers</span>
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.subscribers}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Subscribers</span>
              </div>
            </div>

            <div className="mb-3 sm:mb-4">
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">{creator.bio}</p>
            </div>

            {/* Additional Info */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
              {creator.location && (
                <div className="flex items-center space-x-1 sm:space-x-2">
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{creator.location?.countryName || creator.location}</span>
              </div>
              )}
              <div className="flex items-center space-x-1 sm:space-x-2">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Joined {creator.joined}</span>
              </div>
              {creator.website && (
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <LinkIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  <a
                    href={`https://${creator.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-500 hover:text-rose-600 font-medium"
                  >
                    {creator.website}
                  </a>
                </div>
              )}
            </div>

            {!showNSFW && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-700 flex items-center space-x-2">
                  <EyeOff className="w-4 h-4" />
                  <span>NSFW content is hidden on this profile.</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'posts'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Posts
            </button>
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab('archive')}
                className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'archive'
                    ? 'border-rose-500 text-rose-500'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Archive {archivedPosts.length > 0 && `(${archivedPosts.length})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Feed */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {displayPosts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            {isArchiveTab ? (
              <>
                <Archive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg font-semibold mb-2">No archived posts</p>
                <p className="text-gray-400 text-sm">Posts you archive will appear here</p>
              </>
            ) : (
              <>
                <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {showNSFW ? 'No posts yet' : 'No visible posts (NSFW might be hidden)'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {displayPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDelete={handlePostDeleted}
                showPinnedIndicator={true}
                onPostClick={handlePostClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* ✅ POST MODAL */}
      <PostModal
        isOpen={showPostModal}
        onClose={closePostModal}
        post={selectedPost}
        onPostUpdate={(updatedPost) => {
          if (!selectedPost) return;

          if (updatedPost === null) {
            handlePostDeleted(selectedPost.id);
            closePostModal();
          } else {
            // update in both lists
            setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
            setArchivedPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
            setSelectedPost(updatedPost);
          }
        }}
      />

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Report @{creator.username}</h3>
                <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="space-y-2">
                {[
                  'Spam or misleading',
                  'Inappropriate content',
                  'Harassment or bullying',
                  'Impersonation',
                  'Scam or fraud',
                  'Other'
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => handleReport(reason)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg transition border border-gray-200"
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-500 mt-4">
                Reports are anonymous. Our team will review this report and take appropriate action.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
