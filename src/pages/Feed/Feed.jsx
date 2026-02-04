// src/pages/Feed/Feed.jsx - UPDATED with Trending Creator Posts

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Users, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PostCard from '../../components/feed/PostCard';
import { getAllPosts } from '../../services/postService';
import { getFollowingPosts } from '../../services/followService';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function Feed() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isCreator, profile } = useUserProfile();
  const [activeTab, setActiveTab] = useState('foryou');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const tabs = [
    { id: 'foryou', label: 'For You', icon: Sparkles },
    { id: 'following', label: 'Following', icon: Users },
  ];

  useEffect(() => {
    loadPosts();
  }, [activeTab, currentUser]);

  // Reload posts when component becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadPosts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, currentUser]);

  const getTrendingCreatorIds = async () => {
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

      // Get top 20 trending creators
      const trendingCreatorIds = Object.entries(creatorPostCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([userId]) => userId);

      return trendingCreatorIds;
    } catch (error) {
      console.error('Error getting trending creators:', error);
      return [];
    }
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
        // For "For You" tab, get posts from trending creators
        const trendingCreatorIds = await getTrendingCreatorIds();
        
        if (trendingCreatorIds.length > 0) {
          // Get all posts and filter by trending creators
          const allPosts = await getAllPosts(100); // Get more posts to filter
          fetchedPosts = allPosts.filter(post => 
            trendingCreatorIds.includes(post.userId)
          ).slice(0, 20); // Limit to 20 posts
        } else {
          // Fallback to all posts if no trending creators
          fetchedPosts = await getAllPosts(20);
        }
      }
      
      // Filter out archived posts from feed
      const visiblePosts = fetchedPosts.filter(post => !post.archived);
      
      setPosts(visiblePosts);
    } catch (err) {
      console.error('Error loading posts:', err);
      setError('Failed to load posts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePostCreated = (newPost) => {
    setPosts([newPost, ...posts]);
  };

  const handlePostDeleted = (postId) => {
    setPosts(posts.filter(post => post.id !== postId));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 p-2 mb-6 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-rose-500 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Description */}
        {activeTab === 'foryou' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg"
          >
            <p className="text-sm text-rose-700 flex items-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>Posts from trending creators (most active in 48 hours)</span>
            </p>
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-4" />
            <p className="text-gray-600">Loading posts...</p>
          </div>
        ) : (
          <>
            {/* Empty State */}
            {posts.length === 0 ? (
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
                    ? "Follow creators to see their content here" 
                    : "Check back soon for posts from trending creators"}
                </p>
                <button
                  onClick={() => navigate('/discover')}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
                >
                  Discover Creators
                </button>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={handlePostDeleted}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Load More */}
        {!loading && posts.length > 0 && posts.length >= 20 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 text-center"
          >
            <button
              onClick={loadPosts}
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium border border-gray-200 transition"
            >
              Load More Posts
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}