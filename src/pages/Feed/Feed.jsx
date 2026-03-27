// src/pages/Feed/Feed.jsx - WITH POST MODAL + NSFW TOGGLE (GLOBAL FILTER)

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Users, Sparkles, ChevronRight, EyeOff, Eye, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import PostCard from '../../components/feed/PostCard';
import PostModal from '../../components/Modals/PostModal';

import { getAllPosts } from '../../services/postService';
import { getFollowingPosts } from '../../services/followService';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

import { useContentSettings } from '../../hooks/useContentSettings';

export default function Feed() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isCreator, profile } = useUserProfile();

  const [activeTab, setActiveTab] = useState('foryou');
  const [posts, setPosts] = useState([]);
  const [topCreators, setTopCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { showNSFW, setShowNSFW } = useContentSettings();

  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);

  const tabs = [
    { id: 'foryou', label: 'For You', icon: Sparkles },
    { id: 'following', label: 'Following', icon: Users },
  ];

  useEffect(() => {
    loadPosts();
    loadTopCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) loadPosts();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser]);

  const loadTopCreators = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creators = [];
      usersSnapshot.forEach((d) => {
        const userData = d.data();
        if (userData.kycStatus === 'approved') {
          creators.push({ id: d.id, ...userData });
        }
      });

      const subsSnapshot = await getDocs(query(
        collection(db, 'subscriptions'),
        where('status', '==', 'active')
      ));
      const subCounts = {};
      subsSnapshot.forEach((d) => {
        const creatorId = d.data().creatorId;
        if (creatorId) subCounts[creatorId] = (subCounts[creatorId] || 0) + 1;
      });

      const postsSnapshot = await getDocs(collection(db, 'posts'));
      const postCounts = {};
      postsSnapshot.forEach((d) => {
        const { userId, archived } = d.data();
        if (userId && !archived) postCounts[userId] = (postCounts[userId] || 0) + 1;
      });

      creators.forEach((c) => {
        c.subscriberCount = subCounts[c.id] || 0;
        c.postCount = postCounts[c.id] || 0;
      });

      creators.sort((a, b) =>
        b.subscriberCount !== a.subscriberCount
          ? b.subscriberCount - a.subscriberCount
          : (b.followers || 0) - (a.followers || 0)
      );

      setTopCreators(creators);
    } catch (err) {
      console.error('Error loading top creators:', err);
    }
  };

  // FIX: Score-based algorithm — mix of recency + engagement
  const scorePost = (post) => {
    const now = Date.now();
    let createdAt = now;
    if (post.createdAt) {
      if (typeof post.createdAt.toDate === 'function') createdAt = post.createdAt.toDate().getTime();
      else if (post.createdAt instanceof Date) createdAt = post.createdAt.getTime();
      else if (post.createdAt.seconds) createdAt = post.createdAt.seconds * 1000;
      else if (typeof post.createdAt === 'number') createdAt = post.createdAt;
    }
    const ageHours = (now - createdAt) / 3600000;
    const likes = post.likes || 0;
    const comments = post.comments || 0;
    const engagementScore = likes * 1.0 + comments * 1.5;
    // Recency decay: posts lose score as they age, engagement boosts ranking
    const recencyScore = Math.max(0, 48 - ageHours) * 2;
    return engagementScore + recencyScore;
  };

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError('');

      let fetchedPosts;

      if (activeTab === 'following') {
        if (!currentUser) {
          setError('Please login to see posts from creators you follow');
          setPosts([]);
          setLoading(false);
          return;
        }
        fetchedPosts = await getFollowingPosts(currentUser.uid, 20);
      } else {
        // FIX: Fetch more posts and sort by score (recency + engagement mix)
        const allPosts = await getAllPosts(100);
        fetchedPosts = allPosts
          .filter(p => !p.archived)
          .sort((a, b) => scorePost(b) - scorePost(a))
          .slice(0, 20);
      }

      setPosts(fetchedPosts.filter((post) => !post.archived));
    } catch (err) {
      console.error('Error loading posts:', err);
      setError('Failed to load posts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePostDeleted = (postId) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
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

  const closePostModal = () => {
    setShowPostModal(false);
    setSelectedPost(null);
  };

  const filteredPosts = useMemo(() => {
    if (showNSFW) return posts;
    return posts.filter((p) => (p?.contentRating || 'sfw').toLowerCase() !== 'nsfw');
  }, [posts, showNSFW]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:px-6">

        {/* FIX: Top Creators - bigger cards, bigger avatars, profile picture more visible */}
        <div className="lg:hidden mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center space-x-2">
              <Sparkles className="w-4 sm:w-5 h-4 sm:h-5 text-red-500" />
              <span>Top Creators</span>
            </h2>
            <button
              onClick={() => navigate('/discover')}
              className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center"
            >
              Discover
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* FIX: Horizontal scroll row instead of cramped grid — each card bigger */}
          <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
            {topCreators.slice(0, 12).map((creator) => (
              <motion.div
                key={creator.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
                className="flex-shrink-0 w-28 bg-white rounded-2xl border border-gray-200 hover:border-red-300 hover:shadow-md transition cursor-pointer overflow-hidden"
              >
                {/* Cover banner */}
                <div className="w-full h-16 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 relative">
                  {creator.coverImage && (
                    <img src={creator.coverImage} alt="" className="w-full h-full object-cover" />
                  )}
                  {/* Avatar overlapping banner */}
                  <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-2 border-white shadow-md bg-gradient-to-br from-red-100 to-pink-100 overflow-hidden flex items-center justify-center">
                    {creator.profilePicture ? (
                      <img src={creator.profilePicture} alt={creator.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl">{creator.avatar || '👤'}</span>
                    )}
                  </div>
                </div>

                <div className="pt-7 pb-3 px-2 text-center">
                  <h3 className="font-bold text-gray-900 text-xs truncate">
                    {creator.displayName || 'Anonymous'}
                  </h3>
                  <p className="text-[10px] text-gray-400 truncate">@{creator.username || 'user'}</p>
                  <div className="flex justify-center items-center gap-1 mt-1.5">
                    <Crown className="w-2.5 h-2.5 text-rose-500" />
                    <span className="text-[10px] font-semibold text-gray-600">{creator.subscriberCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Tabs + NSFW Toggle */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-1.5 sm:p-2 mb-4 sm:mb-6 sticky top-0 z-10 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center space-x-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-semibold transition ${
                      activeTab === tab.id ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* NSFW Toggle */}
            <button
              type="button"
              onClick={() => setShowNSFW((v) => !v)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition border ${
                showNSFW
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
              title={showNSFW ? 'NSFW is visible' : 'NSFW is hidden'}
            >
              {showNSFW ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              <span className="text-sm">{showNSFW ? 'Show NSFW: ON' : 'Show NSFW: OFF'}</span>
            </button>
          </div>
        </div>

        {!showNSFW && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg"
          >
            <p className="text-sm text-gray-700 flex items-center space-x-2">
              <EyeOff className="w-4 h-4" />
              <span>NSFW content is hidden. Turn it on if you want to see everything.</span>
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-4" />
            <p className="text-gray-600">Loading posts...</p>
          </div>
        ) : (
          <>
            {filteredPosts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-200 p-12 text-center"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {activeTab === 'following' ? (
                    <Users className="w-8 h-8 text-gray-400" />
                  ) : (
                    <Sparkles className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {activeTab === 'following' ? 'No Posts from Followed Creators' : 'No Trending Posts Yet'}
                </h3>
                <p className="text-gray-600 mb-6">
                  {activeTab === 'following'
                    ? 'Follow creators to see their content here'
                    : showNSFW
                      ? 'Check back soon for posts from trending creators'
                      : 'It looks like the available posts may be NSFW. Turn on "Show NSFW" or check back later.'}
                </p>
                <button
                  onClick={() => navigate('/discover')}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition"
                >
                  Discover Creators
                </button>
              </motion.div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {filteredPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={handlePostDeleted}
                    onPostClick={handlePostClick}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {!loading && filteredPosts.length > 0 && posts.length >= 20 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center pb-4">
            <button
              onClick={loadPosts}
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium border border-gray-200 transition"
            >
              Load More Posts
            </button>
          </motion.div>
        )}
      </div>

      {/* POST MODAL */}
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
            setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
            setSelectedPost(updatedPost);
          }
        }}
      />
    </div>
  );
}