// src/layout/MobileNavbar.jsx - FIXED: SEARCH MODAL (NO PAGE NAVIGATION)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, X, Clock, TrendingUp, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../hooks/useNotifications';
import { searchUsers } from '../services/searchService';
import FollowButton from '../components/common/FollowButton';

export default function MobileNavbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState({ creators: [], posts: [], tags: [] });
  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : ['fitness content', 'art creators', 'photography'];
  });

  const trendingTopics = [
    { tag: 'Fashion', posts: '2.5K', growth: '+12%' },
    { tag: 'Fitness', posts: '1.8K', growth: '+8%' },
    { tag: 'Art', posts: '3.2K', growth: '+15%' },
    { tag: 'Photography', posts: '2.1K', growth: '+10%' },
  ];

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
      const users = await searchUsers(searchQuery);
      setSearchResults({
        creators: users,
        posts: [],
        tags: []
      });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchClick = (search) => {
    setSearchQuery(search);
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

  const closeSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };

  return (
    <>
      {/* MOBILE NAVBAR */}
      <nav className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Hamburger Menu */}
          <button
            onClick={onMenuClick}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <Menu className="w-6 h-6 text-gray-700" />
          </button>

          {/* ✅ SEARCH - Opens Modal (NOT /search page) */}
          <button
            onClick={() => setShowSearchModal(true)}
            className="flex-1 mx-3"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <div className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full text-sm text-gray-400 text-left">
                Search...
              </div>
            </div>
          </button>

          {/* Notifications */}
          <button
            onClick={() => navigate('/notifications')}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <Bell className="w-6 h-6 text-gray-700" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* 🔍 SEARCH MODAL */}
      <AnimatePresence>
        {showSearchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] lg:hidden"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-white min-h-screen"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={closeSearch}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search creators, posts, tags..."
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-full focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              {/* Search Content */}
              <div className="px-4 py-4 max-h-[calc(100vh-80px)] overflow-y-auto">
                {!searchQuery ? (
                  <div className="space-y-6">
                    {/* Recent Searches */}
                    {recentSearches.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-base font-semibold text-gray-900 flex items-center space-x-2">
                            <Clock className="w-5 h-5 text-gray-400" />
                            <span>Recent</span>
                          </h2>
                          <button
                            onClick={clearAllRecentSearches}
                            className="text-sm text-red-500 hover:text-red-600 font-medium"
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
                              className="group inline-flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-red-300 rounded-full text-sm text-gray-700 transition"
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
                      <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-red-500" />
                        <span>Trending</span>
                      </h2>
                      <div className="space-y-2">
                        {trendingTopics.map((topic, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-white rounded-xl p-3 border border-gray-200 hover:border-red-300 hover:shadow-md transition cursor-pointer"
                            onClick={() => handleSearchClick(topic.tag)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <Hash className="w-5 h-5 text-red-500" />
                                <div>
                                  <h3 className="text-sm font-bold text-gray-900">#{topic.tag}</h3>
                                  <p className="text-xs text-gray-500">{topic.posts} posts</p>
                                </div>
                              </div>
                              <span className="text-green-500 text-xs font-semibold">{topic.growth}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Loading State */}
                    {searching && (
                      <div className="text-center py-12">
                        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-sm text-gray-500">Searching...</p>
                      </div>
                    )}

                    {/* Creators Results */}
                    {!searching && searchResults.creators.length > 0 && (
                      <div>
                        <h2 className="text-base font-semibold text-gray-900 mb-3">Creators</h2>
                        <div className="space-y-2">
                          {searchResults.creators.map((creator, index) => (
                            <motion.div
                              key={creator.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="bg-white rounded-xl p-3 border border-gray-200 hover:border-red-300 hover:shadow-md transition"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div 
                                  className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
                                  onClick={() => {
                                    navigate(`/creator/${creator.username}`);
                                    closeSearch();
                                  }}
                                >
                                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0">
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

                    {/* No Results */}
                    {!searching && searchResults.creators.length === 0 && (
                      <div className="text-center py-12">
                        <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">No results found</h3>
                        <p className="text-sm text-gray-500">Try searching for something else</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
