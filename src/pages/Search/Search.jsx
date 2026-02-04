// src/pages/Search/Search.jsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search as SearchIcon,
  ArrowLeft,
  TrendingUp,
  Hash,
  X,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchUsers, searchPosts } from '../../services/searchService';
import FollowButton from '../../components/common/FollowButton';

export default function Search() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : ['fitness content', 'art creators', 'photography', 'lifestyle'];
  });

  const [searchResults, setSearchResults] = useState({
    creators: [],
    posts: [],
    tags: []
  });

  const trendingTopics = [
    { tag: 'Fashion', posts: '2.5K', growth: '+12%' },
    { tag: 'Fitness', posts: '1.8K', growth: '+8%' },
    { tag: 'Art', posts: '3.2K', growth: '+15%' },
    { tag: 'Photography', posts: '2.1K', growth: '+10%' },
    { tag: 'Travel', posts: '1.5K', growth: '+5%' }
  ];

  // ✅ Perform search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch();
    } else {
      setSearchResults({ creators: [], posts: [], tags: [] });
    }
  }, [searchQuery]);

  const performSearch = async () => {
    setSearching(true);
    try {
      // Search users/creators
      const users = await searchUsers(searchQuery);
      
      // Search posts (you'll need to implement this)
      // const posts = await searchPosts(searchQuery);
      
      setSearchResults({
        creators: users,
        posts: [], // Add posts when implemented
        tags: [] // Add tags when implemented
      });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleSearchClick = (search) => {
    setSearchQuery(search);
    // Add to recent searches
    addToRecentSearches(search);
  };

  const addToRecentSearches = (search) => {
    const updated = [search, ...recentSearches.filter(s => s !== search)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const removeRecentSearch = (search) => {
    const updated = recentSearches.filter(s => s !== search);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button
              onClick={() => navigate('/feed')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search creators, posts, or tags..."
                className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-50 border-2 border-gray-200 rounded-full focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {!searchQuery ? (
          <div className="space-y-6 sm:space-y-8">
            {/* Recent Searches - Simple Text Style */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <span>Recent</span>
                  </h2>
                  <button
                    onClick={clearAllRecentSearches}
                    className="text-xs sm:text-sm text-rose-500 hover:text-rose-600 font-medium"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="group inline-flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-rose-300 rounded-full text-xs sm:text-sm text-gray-700 transition cursor-pointer"
                    >
                      <span onClick={() => handleSearchClick(search)} className="cursor-pointer">{search}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentSearch(search);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded-full transition"
                      >
                        <X className="w-3 h-3 text-gray-500" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Topics */}
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                <span>Trending</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {trendingTopics.map((topic, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-xl p-4 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer"
                    onClick={() => handleSearchClick(topic.tag)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Hash className="w-5 h-5 text-rose-500" />
                      <span className="text-green-500 text-xs font-semibold">{topic.growth}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-0.5">#{topic.tag}</h3>
                    <p className="text-xs text-gray-500">{topic.posts} posts</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Search Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 mb-4 sm:mb-6 flex space-x-1 overflow-x-auto scrollbar-hide">
              {['all', 'creators', 'posts', 'tags'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 min-w-[70px] py-2 rounded-lg font-semibold text-xs sm:text-sm transition whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-rose-500 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Loading State */}
            {searching && (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Searching...</p>
              </div>
            )}

            {/* Search Results */}
            {!searching && (
              <div className="space-y-6">
                {/* Creators Results */}
                {(activeTab === 'all' || activeTab === 'creators') && searchResults.creators.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Creators</h2>
                    <div className="space-y-2">
                      {searchResults.creators.map((creator, index) => (
                        <motion.div
                          key={creator.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 hover:border-rose-300 hover:shadow-md transition"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div 
                              className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
                              onClick={() => navigate(`/creator/${creator.username}`)}
                            >
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0">
                                {creator.avatar || creator.photoURL || '👤'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-1">
                                  <p className="font-semibold text-sm text-gray-900 truncate">
                                    {creator.displayName || creator.name}
                                  </p>
                                  {creator.verified && (
                                    <span className="text-blue-500 text-xs">✓</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 truncate">@{creator.username}</p>
                                {creator.followersCount > 0 && (
                                  <p className="text-xs text-gray-400">{creator.followersCount} followers</p>
                                )}
                              </div>
                            </div>
                            <FollowButton 
                              userId={creator.uid || creator.id}
                              username={creator.username}
                              size="sm"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts Results */}
                {(activeTab === 'all' || activeTab === 'posts') && searchResults.posts.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Posts</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                      {searchResults.posts.map((post, index) => (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="group cursor-pointer relative"
                        >
                          <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden relative">
                            {post.images && post.images[0] ? (
                              <img 
                                src={post.images[0]} 
                                alt="Post" 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-4xl">
                                📸
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <div className="text-white font-semibold text-sm">❤️ {post.likes || 0}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags Results */}
                {(activeTab === 'all' || activeTab === 'tags') && searchResults.tags.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Tags</h2>
                    <div className="space-y-2">
                      {searchResults.tags.map((tag, index) => (
                        <motion.div
                          key={tag.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer"
                        >
                          <div className="flex items-center space-x-3">
                            <Hash className="w-5 h-5 text-rose-500" />
                            <div>
                              <p className="font-semibold text-sm text-gray-900">#{tag.tag}</p>
                              <p className="text-xs text-gray-500">{tag.posts} posts</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {!searching && 
                 searchResults.creators.length === 0 && 
                 searchResults.posts.length === 0 && 
                 searchResults.tags.length === 0 && (
                  <div className="text-center py-12">
                    <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">No results found</h3>
                    <p className="text-sm text-gray-500">Try searching for something else</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}