// src/pages/Communities/Communities.jsx - Browse All Communities

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Plus, Search, Lock, Globe, ArrowLeft, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  getCommunities, 
  getUserCommunities,
  getCreatorCommunities,
  isCommunityMember 
} from '../../services/communityService';

const CATEGORIES = [
  'All','Fitness','Gaming','Art','Music','Fashion','Cooking','Tech','Lifestyle','Business'
];

export default function Communities() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [communities, setCommunities] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTab, setActiveTab] = useState('discover');

  useEffect(() => {
    loadCommunities();
    if (currentUser) loadMyCommunities();
  }, [currentUser]);

  const loadCommunities = async () => {
    try {
      setLoading(true);
      setCommunities(await getCommunities());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMyCommunities = async () => {
    try {
      const [joined, created] = await Promise.all([
        getUserCommunities(currentUser.uid),
        getCreatorCommunities(currentUser.uid)
      ]);
      // Strict dedup by id using a Map — last write wins but we prefer created over joined
      const map = new Map();
      [...joined, ...created].forEach(c => { if (c?.id) map.set(c.id, c); });
      setMyCommunities(Array.from(map.values()));
    } catch (e) { console.error(e); }
  };

  const filteredCommunities = communities.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || c.category === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button onClick={() => navigate('/feed')} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Communities</h1>
                <p className="text-sm text-gray-600">Join exclusive creator communities</p>
              </div>
            </div>
            <button onClick={() => navigate('/create-community')}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition flex items-center space-x-2 text-sm sm:text-base">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Create Community</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>

          <div className="flex space-x-4 border-b border-gray-200">
            {['discover', 'my-communities'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`pb-3 px-2 font-semibold transition border-b-2 capitalize ${
                  activeTab === tab ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}>
                {tab === 'my-communities'
                  ? `My Communities${myCommunities.length > 0 ? ` (${myCommunities.length})` : ''}`
                  : 'Discover'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'discover' ? (
          <>
            {/* Search */}
            <div className="mb-6 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search communities..."
                className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 transition" />
            </div>

            {/* Categories */}
            <div className="mb-6 overflow-x-auto scrollbar-hide">
              <div className="flex space-x-2 min-w-max pb-2">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition whitespace-nowrap ${
                      activeCategory === cat ? 'bg-rose-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading communities...</p>
              </div>
            ) : filteredCommunities.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No communities found</h3>
                <p className="text-gray-600 mb-4">Try a different search or category</p>
                <button onClick={() => navigate('/create-community')}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition inline-flex items-center space-x-2">
                  <Plus className="w-5 h-5" /><span>Create First Community</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredCommunities.map((community, index) => (
                  <CommunityCard key={community.id} community={community} index={index}
                    isMember={myCommunities.some(c => c.id === community.id)}
                    onClick={() => navigate(`/community/${community.id}`)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            {myCommunities.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No communities yet</h3>
                <p className="text-gray-600 mb-4">Join communities to see them here</p>
                <button onClick={() => setActiveTab('discover')}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition">
                  Discover Communities
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {myCommunities.map((community, index) => (
                  <CommunityCard key={community.id} community={community} index={index} isMember
                    onClick={() => navigate(`/community/${community.id}`)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommunityCard({ community, index, isMember = false, onClick }) {
  const isFree = community.isPrivate === false;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 hover:border-rose-300 hover:shadow-lg transition cursor-pointer overflow-hidden group">

      {/* Cover */}
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 overflow-hidden">
        {community.coverImage
          ? <img src={community.coverImage} alt={community.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          : <div className="w-full h-full flex items-center justify-center text-6xl">👥</div>}

        {/* Privacy badge */}
        <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full flex items-center space-x-1">
          {isFree
            ? <><Globe className="w-3 h-3 text-white" /><span className="text-xs text-white font-medium">Free</span></>
            : <><Lock className="w-3 h-3 text-white" /><span className="text-xs text-white font-medium">Private</span></>}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">{community.name}</h3>
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{community.description || 'No description'}</p>
        <span className="inline-block px-2 py-1 bg-rose-50 text-rose-600 text-xs font-medium rounded-full mb-3">
          {community.category || 'general'}
        </span>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 text-gray-600 text-sm">
            <Users className="w-4 h-4" />
            <span>{community.memberCount || 0} members</span>
          </div>
          {isMember && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Joined</span>
          )}
        </div>

        {/* Price row — only show for private communities */}
        <div className="flex items-center justify-between mt-3">
          {isFree
            ? <span className="text-lg font-bold text-green-600">Free</span>
            : <div className="text-lg font-bold text-gray-900">${(community.price || 9.99).toFixed(2)}<span className="text-sm text-gray-500">/mo</span></div>
          }
          {isMember ? (
            <div className="flex items-center space-x-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
              <span>✓</span><span>Joined</span>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); onClick(); }}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                isFree ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-rose-500 text-white hover:bg-rose-600'
              }`}>
              {isFree ? 'Join Free' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}