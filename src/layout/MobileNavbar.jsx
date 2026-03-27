// src/layout/MobileNavbar.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, X, Clock, TrendingUp, Hash, Loader2, Users, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../hooks/useNotifications';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import FollowButton from '../components/common/FollowButton';

export default function MobileNavbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState({ creators: [], tags: [] });

  // ✅ Same localStorage key as Search.jsx so recent searches are shared
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('recentSearches');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [popularCreators, setPopularCreators] = useState([]);
  const [topTags, setTopTags] = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(false);

  // Load popular data when modal opens
  useEffect(() => {
    if (showSearchModal && popularCreators.length === 0) {
      loadPopularData();
    }
  }, [showSearchModal]);

  // Search when query changes
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      performSearch();
    } else {
      setSearchResults({ creators: [], tags: [] });
    }
  }, [searchQuery]);

  const loadPopularData = async () => {
    try {
      setLoadingPopular(true);

      // Load creators
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creators = [];

      const subsSnapshot = await getDocs(query(collection(db, 'subscriptions'), where('status', '==', 'active')));
      const subCounts = {};
      subsSnapshot.forEach(d => {
        const creatorId = d.data().creatorId;
        if (creatorId) subCounts[creatorId] = (subCounts[creatorId] || 0) + 1;
      });

      usersSnapshot.forEach(d => {
        const data = d.data();
        if (data.isCreator) {
          creators.push({ id: d.id, uid: d.id, ...data, subscriberCount: subCounts[d.id] || 0 });
        }
      });
      creators.sort((a, b) =>
        b.subscriberCount !== a.subscriberCount
          ? b.subscriberCount - a.subscriberCount
          : (b.followers || 0) - (a.followers || 0)
      );
      setPopularCreators(creators.slice(0, 5));

      // Load trending hashtags from real posts
      const postsSnapshot = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(200)));
      const hashtagCounts = {};
      postsSnapshot.forEach(d => {
        const tags = (d.data().content || '').match(/#\w+/g) || [];
        tags.forEach(tag => {
          const clean = tag.substring(1).toLowerCase();
          hashtagCounts[clean] = (hashtagCounts[clean] || 0) + 1;
        });
      });
      const sorted = Object.entries(hashtagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([tag, count]) => ({ tag, posts: count }));
      setTopTags(sorted);
    } catch (e) {
      console.error('Error loading popular data:', e);
    } finally {
      setLoadingPopular(false);
    }
  };

  const performSearch = async () => {
    setSearching(true);
    try {
      const searchLower = searchQuery.toLowerCase().trim();

      const usersRef = collection(db, 'users');
      const usernameQuery = query(usersRef, where('username', '>=', searchLower), where('username', '<=', searchLower + '\uf8ff'), limit(10));
      const nameQuery = query(usersRef, where('displayName', '>=', searchQuery), where('displayName', '<=', searchQuery + '\uf8ff'), limit(10));

      const [usernameSnapshot, nameSnapshot] = await Promise.all([getDocs(usernameQuery), getDocs(nameQuery)]);

      const userMap = new Map();
      [...usernameSnapshot.docs, ...nameSnapshot.docs].forEach(doc => {
        userMap.set(doc.id, { id: doc.id, uid: doc.id, ...doc.data() });
      });

      // Hashtag search
      const postsSnapshot = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)));
      const hashtags = [];
      const hashtagSet = new Set();
      postsSnapshot.docs.forEach(doc => {
        const tags = (doc.data().content || '').match(/#\w+/g) || [];
        tags.forEach(tag => {
          const cleanTag = tag.substring(1).toLowerCase();
          if (cleanTag.includes(searchLower) && !hashtagSet.has(cleanTag)) {
            hashtagSet.add(cleanTag);
            hashtags.push({ tag: cleanTag });
          }
        });
      });

      setSearchResults({
        creators: Array.from(userMap.values()),
        tags: hashtags.slice(0, 6),
      });
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({ creators: [], tags: [] });
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

  const handleCreatorClick = (creator) => {
    addToRecentSearches(creator.displayName || creator.username || '');
    navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`);
    closeSearch();
  };

  return (
    <>
      {/* MOBILE NAVBAR */}
      <nav className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onMenuClick} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Menu className="w-6 h-6 text-gray-700" />
          </button>

          {/* Search trigger */}
          <button onClick={() => setShowSearchModal(true)} className="flex-1 mx-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <div className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full text-sm text-gray-400 text-left">
                Search...
              </div>
            </div>
          </button>

          <button onClick={() => navigate('/notifications')} className="relative p-2 hover:bg-gray-100 rounded-lg transition">
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
            className="fixed inset-0 z-[60] lg:hidden bg-white"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
              <div className="flex items-center space-x-3">
                <button onClick={closeSearch} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search creators, posts, tags..."
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-full focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition text-sm"
                    autoFocus
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition">
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto pb-24" style={{ height: 'calc(100dvh - 64px)' }}>
              {!searchQuery ? (
                <div className="px-4 py-4 space-y-6">

                  {/* ✅ Recent Searches — same as Search.jsx */}
                  {recentSearches.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-gray-900 flex items-center space-x-2">
                          <Clock className="w-5 h-5 text-gray-400" />
                          <span>Recent</span>
                        </h2>
                        <button onClick={clearAllRecentSearches} className="text-sm text-rose-500 hover:text-rose-600 font-medium">
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((search, index) => (
                          <div key={index} className="group inline-flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-rose-300 rounded-full text-sm text-gray-700 transition cursor-pointer">
                            <span onClick={() => handleSearchClick(search)}>{search}</span>
                            <button onClick={e => { e.stopPropagation(); removeRecentSearch(search); }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded-full transition">
                              <X className="w-3 h-3 text-gray-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ✅ Popular Creators — real data */}
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-rose-500" />
                      <span>Popular Creators</span>
                    </h2>
                    {loadingPopular ? (
                      <div className="text-center py-6">
                        <Loader2 className="w-6 h-6 text-rose-500 animate-spin mx-auto" />
                      </div>
                    ) : popularCreators.length === 0 ? (
                      <p className="text-sm text-gray-400">No creators yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {popularCreators.map(creator => (
                          <div key={creator.id}
                            className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition flex items-center space-x-3">
                            <div onClick={() => handleCreatorClick(creator)} className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer">
                              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex-shrink-0 overflow-hidden">
                                {creator.profilePicture
                                  ? <img src={creator.profilePicture} alt="" className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-xl">{creator.avatar || '👤'}</div>}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-1">
                                  <p className="font-semibold text-sm text-gray-900 truncate">{creator.displayName || 'Anonymous'}</p>
                                  {creator.kycStatus === 'approved' && <span className="text-blue-500 text-xs flex-shrink-0">✓</span>}
                                </div>
                                <p className="text-xs text-gray-500 truncate">@{creator.username || 'user'}</p>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0">
                                <Crown className="w-3 h-3 text-rose-500" />
                                <span className="text-xs font-semibold text-gray-600">{creator.subscriberCount}</span>
                              </div>
                            </div>
                            <FollowButton userId={creator.uid || creator.id} username={creator.username} size="sm" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ✅ Trending Tags — real data */}
                  {topTags.length > 0 && (
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                        <Hash className="w-5 h-5 text-rose-500" />
                        <span>Trending Tags</span>
                      </h2>
                      <div className="space-y-2">
                        {topTags.map((tag, index) => (
                          <div key={index} onClick={() => handleSearchClick(tag.tag)}
                            className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Hash className="w-5 h-5 text-rose-500" />
                              <p className="font-semibold text-sm text-gray-900">#{tag.tag}</p>
                            </div>
                            <p className="text-xs text-gray-500">{tag.posts} {tag.posts === 1 ? 'post' : 'posts'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              ) : (
                <div className="px-4 py-4">
                  {searching && (
                    <div className="text-center py-10">
                      <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Searching...</p>
                    </div>
                  )}

                  {!searching && (
                    <div className="space-y-5">
                      {/* Creators */}
                      {searchResults.creators.length > 0 && (
                        <div>
                          <h2 className="text-base font-semibold text-gray-900 mb-3">Creators</h2>
                          <div className="space-y-2">
                            {searchResults.creators.map(creator => (
                              <div key={creator.id} className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 transition flex items-center space-x-3">
                                <div onClick={() => handleCreatorClick(creator)} className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer">
                                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex-shrink-0 overflow-hidden">
                                    {creator.profilePicture || creator.avatar?.startsWith('http')
                                      ? <img src={creator.profilePicture || creator.avatar} alt="" className="w-full h-full object-cover" />
                                      : <div className="w-full h-full flex items-center justify-center text-xl">{creator.avatar || '👤'}</div>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center space-x-1">
                                      <p className="font-semibold text-sm text-gray-900 truncate">{creator.displayName || creator.name}</p>
                                      {creator.kycStatus === 'approved' && <span className="text-blue-500 text-xs">✓</span>}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">@{creator.username}</p>
                                  </div>
                                </div>
                                <FollowButton userId={creator.uid || creator.id} username={creator.username} size="sm" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {searchResults.tags.length > 0 && (
                        <div>
                          <h2 className="text-base font-semibold text-gray-900 mb-3">Tags</h2>
                          <div className="space-y-2">
                            {searchResults.tags.map((tag, i) => (
                              <div key={i} onClick={() => handleSearchClick(tag.tag)}
                                className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 transition cursor-pointer flex items-center space-x-3">
                                <Hash className="w-5 h-5 text-rose-500" />
                                <p className="font-semibold text-sm text-gray-900">#{tag.tag}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No results */}
                      {searchResults.creators.length === 0 && searchResults.tags.length === 0 && (
                        <div className="text-center py-12">
                          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">No results found</h3>
                          <p className="text-sm text-gray-500">Try searching for something else</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}