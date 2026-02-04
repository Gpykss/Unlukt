// src/pages/Discover/Discover.jsx - OPTIMIZED VERSION

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  TrendingUp,
  Star,
  Sparkles,
  Users,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function Discover() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('all');
  const [trendingCreators, setTrendingCreators] = useState([]);
  const [newCreators, setNewCreators] = useState([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    { id: 'all', name: 'All', icon: Sparkles },
    { id: 'new', name: 'New', icon: Star },
  ];

  useEffect(() => {
    loadCreators();
  }, []);

  const loadCreators = async () => {
    try {
      setLoading(true);

      // Get trending creators (most posts in past 48 hours)
      const trending = await getTrendingCreators();
      setTrendingCreators(trending);

      // Get new creators (recently verified)
      const newlyVerified = await getNewCreators();
      setNewCreators(newlyVerified);

    } catch (error) {
      console.error('Error loading creators:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendingCreators = async () => {
    try {
      // Get all posts from the last 48 hours
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      const postsRef = collection(db, 'posts');
      const postsSnapshot = await getDocs(postsRef);

      // Count posts per creator in last 48 hours
      const creatorPostCounts = {};
      
      postsSnapshot.forEach((doc) => {
        const post = doc.data();
        
        // Handle different date formats
        let postDate = null;
        if (post.createdAt) {
          // If it's a Firestore Timestamp
          if (typeof post.createdAt.toDate === 'function') {
            postDate = post.createdAt.toDate();
          }
          // If it's already a Date object
          else if (post.createdAt instanceof Date) {
            postDate = post.createdAt;
          }
          // If it's a timestamp number
          else if (typeof post.createdAt === 'number') {
            postDate = new Date(post.createdAt);
          }
          // If it has seconds property (Firestore Timestamp object)
          else if (post.createdAt.seconds) {
            postDate = new Date(post.createdAt.seconds * 1000);
          }
        }
        
        if (postDate && postDate >= fortyEightHoursAgo) {
          const userId = post.userId;
          creatorPostCounts[userId] = (creatorPostCounts[userId] || 0) + 1;
        }
      });

      // Sort creators by post count
      const sortedCreators = Object.entries(creatorPostCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12); // Top 12 trending creators

      // Fetch creator details
      const creatorsData = [];
      for (const [userId, postCount] of sortedCreators) {
        const userRef = collection(db, 'users');
        const userQuery = query(userRef, where('__name__', '==', userId));
        const userSnapshot = await getDocs(userQuery);
        
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          creatorsData.push({
            id: userId,
            ...userData,
            recentPosts: postCount
          });
        }
      }

      return creatorsData;
    } catch (error) {
      console.error('Error getting trending creators:', error);
      return [];
    }
  };

  const getNewCreators = async () => {
    try {
      // Get creators verified in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      const newVerified = [];
      
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        const verifiedDate = userData.kycReviewedAt?.toDate();
        
        if (userData.kycStatus === 'approved' && verifiedDate && verifiedDate >= sevenDaysAgo) {
          newVerified.push({
            id: doc.id,
            ...userData,
            verifiedDate
          });
        }
      });

      // Sort by most recently verified
      newVerified.sort((a, b) => b.verifiedDate - a.verifiedDate);

      return newVerified.slice(0, 12); // Top 12 new creators
    } catch (error) {
      console.error('Error getting new creators:', error);
      return [];
    }
  };

  const CreatorCard = ({ creator, showBadge, badgeText, badgeColor }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
      className="bg-white rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-rose-300 hover:shadow-xl transition cursor-pointer"
    >
      {/* Banner */}
      <div className="h-24 sm:h-32 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 flex items-center justify-center text-4xl sm:text-6xl relative">
        <span className="text-5xl">{creator.avatar || '👤'}</span>
        {showBadge && (
          <div className={`absolute top-3 right-3 ${badgeColor} text-white px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1`}>
            {badgeText === 'TRENDING' ? <TrendingUp className="w-3 h-3" /> : <Star className="w-3 h-3 fill-white" />}
            <span>{badgeText}</span>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="p-4 sm:p-6 -mt-8 relative">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 border-4 border-white flex items-center justify-center text-3xl mb-4 shadow-lg">
          {creator.avatar || '👤'}
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-bold text-gray-900 text-lg">{creator.displayName || 'Anonymous'}</h3>
              {creator.kycStatus === 'approved' && (
                <span className="text-blue-500">✓</span>
              )}
            </div>
            <p className="text-sm text-gray-500">@{creator.username || 'user'}</p>
          </div>
        </div>

        {creator.bio && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{creator.bio}</p>
        )}

        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{creator.posts || 0}</p>
            <p className="text-xs text-gray-500">Posts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{creator.followers || 0}</p>
            <p className="text-xs text-gray-500">Followers</p>
          </div>
          {creator.recentPosts && (
            <div className="text-center">
              <p className="text-lg font-bold text-rose-600">{creator.recentPosts}</p>
              <p className="text-xs text-gray-500">48h Posts</p>
            </div>
          )}
        </div>

        <button className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition shadow-lg hover:shadow-xl">
          Follow
        </button>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading creators...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Back Button */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <button 
          onClick={() => navigate('/feed')}
          className="flex items-center space-x-2 text-gray-700"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Back</span>
        </button>
      </div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block max-w-7xl mx-auto px-6 pt-6">
        <button 
          onClick={() => navigate('/feed')}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Back to Feed</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Category Filters */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 sm:space-x-3 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center space-x-1.5 sm:space-x-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-semibold text-sm sm:text-base whitespace-nowrap transition ${
                    activeCategory === category.id
                      ? 'bg-rose-500 text-white shadow-lg'
                      : 'bg-white text-gray-700 border border-gray-200 hover:border-rose-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trending Creators Section */}
        {(activeCategory === 'all') && trendingCreators.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <TrendingUp className="w-6 sm:w-7 h-6 sm:h-7 text-rose-500" />
                <span>Trending Creators</span>
              </h2>
              <p className="text-sm text-gray-500">Most active in 48h</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {trendingCreators.map((creator) => (
                <CreatorCard 
                  key={creator.id} 
                  creator={creator} 
                  showBadge={true}
                  badgeText="TRENDING"
                  badgeColor="bg-rose-500"
                />
              ))}
            </div>
          </div>
        )}

        {/* New Creators Section */}
        {(activeCategory === 'all' || activeCategory === 'new') && newCreators.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <Star className="w-6 sm:w-7 h-6 sm:h-7 text-yellow-500 fill-yellow-500" />
                <span>New Creators</span>
              </h2>
              <p className="text-sm text-gray-500">Recently verified</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {newCreators.map((creator) => (
                <CreatorCard 
                  key={creator.id} 
                  creator={creator} 
                  showBadge={true}
                  badgeText="NEW"
                  badgeColor="bg-yellow-500"
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {trendingCreators.length === 0 && newCreators.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Creators Yet</h3>
            <p className="text-gray-600">Check back soon for trending and new creators!</p>
          </div>
        )}
      </div>
    </div>
  );
}