// src/pages/Feed/Feed.jsx - WITH POST MODAL + NSFW TOGGLE (GLOBAL FILTER)

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Users, Sparkles, Clock, ChevronRight, EyeOff, Eye, Crown, MessageSquare, ArrowRight } from 'lucide-react';
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
import { getCommunities, getCommunityPosts } from '../../services/communityService';

// ── Community Spotlight Card ──────────────────────────────────────────────────
function CommunitySpotlightCard({ community }) {
  const navigate = useNavigate();
  const { name, id, coverImage, memberCount, category, latestPost, description } = community;

  const handleCardClick = () => {
    navigate(`/community/${id}`);
  };

  const snippet = latestPost?.content || description || "Welcome to our exclusive community space! Connect, share, and discuss with creators and fans alike.";
  
  return (
    <div
      onClick={handleCardClick}
      className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white rounded-3xl border border-indigo-500/30 overflow-hidden shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-400/50 hover:scale-[1.01] transition-all duration-300 cursor-pointer p-6 flex flex-col justify-between group"
    >
      {/* Decorative Glowing Orbs */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div>
        {/* Spotlight Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-300">Community Spotlight</span>
          </div>
          {category && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/20 text-purple-300 capitalize font-medium">
              {category}
            </span>
          )}
        </div>

        {/* Content Row */}
        <div className="flex items-start space-x-4 mb-4">
          {/* Cover image or fallback */}
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-800 to-purple-900 border border-indigo-500/20 flex-shrink-0 flex items-center justify-center text-3xl">
            {coverImage ? (
              <img src={coverImage} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            ) : (
              "👥"
            )}
          </div>

          <div>
            <h3 className="text-lg md:text-xl font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors duration-200 line-clamp-1">
              {name}
            </h3>
            <div className="flex items-center space-x-1.5 mt-1 text-gray-400">
              <Users className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold">
                {memberCount || 0} {memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </div>
        </div>

        {/* Hot Discussion Section */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
          <div className="flex items-center space-x-2 mb-2">
            <MessageSquare className="w-4 h-4 text-pink-400" />
            <span className="text-[11px] font-bold text-pink-400 uppercase tracking-wide">Hot Discussion</span>
          </div>
          <p className="text-sm text-gray-200 line-clamp-2 italic leading-relaxed">
            "{snippet}"
          </p>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
        <span className="text-xs text-gray-400">Step inside the lounge</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCardClick();
          }}
          className="flex items-center space-x-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 group-hover:translate-x-1 transition-all duration-200"
        >
          <span>Join Lounge</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Feed() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isCreator, profile } = useUserProfile();

  const [activeTab, setActiveTab] = useState('foryou');
  const [posts, setPosts] = useState([]);
  const [topCreators, setTopCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [communitiesList, setCommunitiesList] = useState([]);

  const { showNSFW, setShowNSFW } = useContentSettings();

  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);

  useEffect(() => {
    const fetchTrendingCommunities = async () => {
      try {
        const list = await getCommunities({ limit: 10 });
        const enriched = await Promise.all(
          list.map(async (c) => {
            try {
              const posts = await getCommunityPosts(c.id);
              return {
                ...c,
                latestPost: posts && posts.length > 0 ? posts[0] : null,
              };
            } catch {
              return { ...c, latestPost: null };
            }
          })
        );
        setCommunitiesList(enriched);
      } catch (e) {
        console.error('Error loading trending communities:', e);
      }
    };
    fetchTrendingCommunities();
  }, []);

  const tabs = [
    { id: 'foryou', label: 'For You', icon: Sparkles },
    { id: 'latest', label: 'Latest', icon: Clock },
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
      // ✅ Speed Optimization: Query only KYC-approved users (creators) instead of scanning the entire collection
      const q = query(
        collection(db, 'users'),
        where('kycStatus', '==', 'approved')
      );
      const usersSnapshot = await getDocs(q);
      const creators = [];
      usersSnapshot.forEach((d) => {
        const userData = d.data();
        creators.push({
          id: d.id,
          ...userData,
          subscriberCount: userData.subscribersCount || userData.subscribers || 0,
          postCount: userData.postsCount || userData.posts || 0
        });
      });

      // ✅ Speed Optimization: Sort and set creators immediately.
      creators.sort((a, b) => {
        const subA = a.subscriberCount || 0;
        const subB = b.subscriberCount || 0;
        if (subB !== subA) return subB - subA;
        return (b.followers || 0) - (a.followers || 0);
      });

      setTopCreators(creators);
    } catch (err) {
      console.error('Error loading top creators:', err);
    }
  };

  // Timestamp extraction helper for server timestamps
  const getPostTimestamp = (post) => {
    if (!post?.createdAt) return 0;
    try {
      if (typeof post.createdAt.toDate === 'function') return post.createdAt.toDate().getTime();
      if (post.createdAt instanceof Date) return post.createdAt.getTime();
      if (post.createdAt.seconds) return post.createdAt.seconds * 1000;
      if (typeof post.createdAt === 'number') {
        return post.createdAt < 1e11 ? post.createdAt * 1000 : post.createdAt;
      }
      if (typeof post.createdAt === 'string') {
        const parsed = new Date(post.createdAt).getTime();
        if (!isNaN(parsed)) return parsed;
      }
    } catch {
      return 0;
    }
    return 0;
  };

  // ✅ PRD 16.4: Main Feed Ranking Formula (For You)
  // engagement = likes + 2*comments + 3*unlocks
  // score = engagement / (ageHours + 2)^1.5 + fresh post boost
  const scorePost = (post) => {
    const now = Date.now();
    const createdAt = getPostTimestamp(post) || now;
    const ageHours = Math.max(0, (now - createdAt) / 3600000);

    // Posts older than 7 days fall back to chronological order (low base score)
    if (ageHours > 168) {
      return createdAt / 1e12;
    }

    const likes = Number(post.likes || 0);
    const comments = Number(post.comments || 0);
    const unlocks = Number(post.unlockCount || post.unlocks || 0);

    const engagement = likes + 2 * comments + 3 * unlocks;
    let score = engagement / Math.pow(ageHours + 2, 1.5);

    // Small boost for brand-new posts (< 24h) so new creators & fresh posts get seen
    if (ageHours < 24) {
      score += (24 - ageHours) * 0.25;
    }

    return score;
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
        fetchedPosts = await getFollowingPosts(currentUser.uid, 50);
      } else if (activeTab === 'latest') {
        // ✅ PRD 16.4: Strictly newest first by server createdAt
        const allPosts = await getAllPosts(100);
        fetchedPosts = allPosts
          .filter(p => !p.archived)
          .sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a))
          .slice(0, 30);
      } else {
        // ✅ PRD 16.4: For You ranked by engagement decay score
        const allPosts = await getAllPosts(100);
        fetchedPosts = allPosts
          .filter(p => !p.archived)
          .sort((a, b) => scorePost(b) - scorePost(a))
          .slice(0, 30);
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
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-6 lg:px-6 w-full overflow-x-hidden">

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
          <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide -mx-3 px-3">
            {topCreators.slice(0, 12).map((creator) => (
              <motion.div
                key={creator.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
                className="flex-shrink-0 w-28 bg-white rounded-2xl border border-gray-200 hover:border-red-300 hover:shadow-md transition cursor-pointer overflow-hidden"
              >
                {/* Cover banner */}
                <div className="w-full h-14 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 relative">
                  {creator.banner && !creator.banner.includes('🎨') && (
                    <img src={creator.banner} alt="" className="w-full h-full object-cover" />
                  )}
                  {/* Avatar — larger, always centered */}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-2 border-white shadow-lg bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center">
                    {creator.is_live && (
                      <>
                        <div className="absolute -inset-1 rounded-full border-2 border-rose-500 animate-ping opacity-75 z-0" />
                        <div className="absolute -inset-1 rounded-full border border-rose-600 animate-pulse z-0" />
                      </>
                    )}
                    <div className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-white z-10">
                      {(creator.profilePicture || (creator.avatar && !creator.avatar.includes('👤'))) ? (
                        <img
                          src={creator.profilePicture || creator.avatar}
                          alt={creator.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-bold text-rose-400">
                          {creator.displayName?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-8 pb-3 px-2 text-center">
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

        {/* Feed Tabs + NSFW Toggle */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-1 sm:p-2 mb-4 sm:mb-6 sticky top-14 lg:top-0 z-20 shadow-xs">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center space-x-1 sm:space-x-2 flex-1 min-w-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Inline NSFW Toggle */}
            <button
              type="button"
              onClick={() => setShowNSFW((v) => !v)}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold transition border shrink-0 whitespace-nowrap ${
                showNSFW
                  ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
              title={showNSFW ? 'NSFW content is visible' : 'NSFW content is hidden'}
            >
              {showNSFW ? <Eye className="w-3.5 h-3.5 text-rose-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              <span>{showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}</span>
            </button>
          </div>
        </div>

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
                {(() => {
                  const items = [];
                  filteredPosts.forEach((post, index) => {
                    items.push(
                      <PostCard
                        key={post.id}
                        post={post}
                        onDelete={handlePostDeleted}
                        onPostClick={handlePostClick}
                      />
                    );
                    
                    const isInjectPoint = (index + 1) % 4 === 0;
                    if (isInjectPoint && communitiesList.length > 0) {
                      const communityIndex = Math.floor(index / 4) % communitiesList.length;
                      const community = communitiesList[communityIndex];
                      items.push(
                        <CommunitySpotlightCard 
                          key={`spotlight-${community.id}-${index}`}
                          community={community} 
                        />
                      );
                    }
                  });
                  return items;
                })()}
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