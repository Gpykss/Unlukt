// src/pages/Search/Search.jsx

import { useState, useEffect } from 'react';
import { Users, Plus, Search as SearchIcon, ArrowLeft, TrendingUp, Hash, X, Clock, Loader2, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import FollowButton from '../../components/common/FollowButton';

export default function Search() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchResults, setSearchResults] = useState({ creators: [], posts: [], tags: [] });
  const [popularCreators, setPopularCreators] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(true);

  // ✅ Load real popular creators on mount
  useEffect(() => {
    loadPopularCreators();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      performSearch();
    } else {
      setSearchResults({ creators: [], posts: [], tags: [] });
    }
  }, [searchQuery]);

  const [topTags, setTopTags] = useState([]);

  const loadPopularCreators = async () => {
    try {
      setLoadingCreators(true);
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creators = [];

      const subsSnapshot = await getDocs(query(
        collection(db, 'subscriptions'),
        where('status', '==', 'active')
      ));
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
      setPopularCreators(creators.slice(0, 3));

      // ✅ Real hashtags from posts
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
        .slice(0, 3)
        .map(([tag, count]) => ({ tag, posts: count }));
      setTopTags(sorted);
    } catch (e) {
      console.error('Error loading popular creators:', e);
    } finally {
      setLoadingCreators(false);
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
      const users = Array.from(userMap.values());

      const postsSnapshot = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)));
      const posts = postsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => (post.content || '').toLowerCase().includes(searchLower))
        .slice(0, 20);

      const hashtags = [];
      const hashtagSet = new Set();
      postsSnapshot.docs.forEach(doc => {
        const tags = (doc.data().content || '').match(/#\w+/g) || [];
        tags.forEach(tag => {
          const cleanTag = tag.substring(1).toLowerCase();
          if (cleanTag.includes(searchLower) && !hashtagSet.has(cleanTag)) {
            hashtagSet.add(cleanTag);
            hashtags.push({ tag: cleanTag, posts: 0 });
          }
        });
      });

      setSearchResults({ creators: users, posts, tags: hashtags.slice(0, 10) });
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({ creators: [], posts: [], tags: [] });
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => setSearchQuery('');

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

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
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
                <button onClick={clearSearch} className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition">
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

            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <span>Recent</span>
                  </h2>
                  <button onClick={clearAllRecentSearches} className="text-xs sm:text-sm text-rose-500 hover:text-rose-600 font-medium">
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search, index) => (
                    <div key={index} className="group inline-flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-rose-300 rounded-full text-xs sm:text-sm text-gray-700 transition cursor-pointer">
                      <span onClick={() => handleSearchClick(search)}>{search}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeRecentSearch(search); }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded-full transition">
                        <X className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ Popular Creators - real data */}
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                <span>Popular Creators</span>
              </h2>

              {loadingCreators ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading creators...</p>
                </div>
              ) : popularCreators.length === 0 ? (
                <p className="text-sm text-gray-500">No creators yet.</p>
              ) : (
                <div className="space-y-2">
                  {popularCreators.map((creator) => (
                    <div
                      key={creator.id}
                      onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
                      className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer flex items-center space-x-3"
                    >
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex-shrink-0 overflow-hidden">
                        {creator.profilePicture ? (
                          <img src={creator.profilePicture} alt={creator.displayName} className="w-full h-full object-cover" />
                        ) : creator.avatar?.startsWith('http') ? (
                          <img src={creator.avatar} alt={creator.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">{creator.avatar || '👤'}</div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1">
                          <p className="font-semibold text-sm text-gray-900 truncate">{creator.displayName || 'Anonymous'}</p>
                          {creator.kycStatus === 'approved' && <span className="text-blue-500 text-xs flex-shrink-0">✓</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate">@{creator.username || 'user'}</p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center space-x-3 flex-shrink-0 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Crown className="w-3 h-3 text-rose-500" />
                          <span className="font-semibold text-gray-700">{creator.subscriberCount}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Users className="w-3 h-3 text-blue-400" />
                          <span className="font-semibold text-gray-700">{creator.followers || 0}</span>
                        </div>
                      </div>

                      <FollowButton userId={creator.uid || creator.id} username={creator.username} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ Top 3 real hashtags */}
            {topTags.length > 0 && (
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                  <Hash className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                  <span>Trending Tags</span>
                </h2>
                <div className="space-y-2">
                  {topTags.map((tag, index) => (
                    <div
                      key={index}
                      onClick={() => handleSearchClick(tag.tag)}
                      className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer flex items-center justify-between"
                    >
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
          <div>
            {/* Search Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 mb-4 sm:mb-6 flex space-x-1 overflow-x-auto scrollbar-hide">
              {['all', 'creators', 'posts', 'tags'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 min-w-[70px] py-2 rounded-lg font-semibold text-xs sm:text-sm transition whitespace-nowrap ${
                    activeTab === tab ? 'bg-rose-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {searching && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Searching...</p>
              </div>
            )}

            {!searching && (
              <div className="space-y-6">
                {/* Creators */}
                {(activeTab === 'all' || activeTab === 'creators') && searchResults.creators.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Creators</h2>
                    <div className="space-y-2">
                      {searchResults.creators.map((creator) => (
                        <div key={creator.id} className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 hover:border-rose-300 hover:shadow-md transition">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/creator/${creator.username}`)}>
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                                {creator.avatar ? <img src={creator.avatar} alt={creator.displayName} className="w-full h-full object-cover" /> : '👤'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-1">
                                  <p className="font-semibold text-sm text-gray-900 truncate">{creator.displayName || creator.name}</p>
                                  {creator.kycStatus === 'approved' && <span className="text-blue-500 text-xs">✓</span>}
                                </div>
                                <p className="text-xs text-gray-500 truncate">@{creator.username}</p>
                                {creator.followersCount > 0 && <p className="text-xs text-gray-400">{creator.followersCount} followers</p>}
                              </div>
                            </div>
                            <FollowButton userId={creator.uid || creator.id} username={creator.username} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts */}
                {(activeTab === 'all' || activeTab === 'posts') && searchResults.posts.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Posts</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                      {searchResults.posts.map((post) => (
                        <div key={post.id} className="group cursor-pointer relative">
                          <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden relative">
                            {post.images && post.images[0] ? (
                              <img src={post.images[0]} alt="Post" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-4xl">📸</div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <div className="text-white font-semibold text-sm">❤️ {post.likes || 0}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {(activeTab === 'all' || activeTab === 'tags') && searchResults.tags.length > 0 && (
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Tags</h2>
                    <div className="space-y-2">
                      {searchResults.tags.map((tag, index) => (
                        <div key={index} className="bg-white rounded-xl p-3 border border-gray-200 hover:border-rose-300 hover:shadow-md transition cursor-pointer" onClick={() => handleSearchClick(tag.tag)}>
                          <div className="flex items-center space-x-3">
                            <Hash className="w-5 h-5 text-rose-500" />
                            <p className="font-semibold text-sm text-gray-900">#{tag.tag}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {searchResults.creators.length === 0 && searchResults.posts.length === 0 && searchResults.tags.length === 0 && (
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