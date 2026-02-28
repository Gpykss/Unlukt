// src/pages/Communities/Communities.jsx - Browse All Communities

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Plus, 
  Search, 
  TrendingUp, 
  Lock, 
  Globe,
  ArrowLeft,
  Loader2,
  Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  getCommunities, 
  getUserCommunities, 
  isCommunityMember 
} from '../../services/communityService';

const CATEGORIES = [
  'All',
  'Fitness',
  'Gaming',
  'Art',
  'Music',
  'Fashion',
  'Cooking',
  'Tech',
  'Lifestyle',
  'Business'
];

export default function Communities() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [communities, setCommunities] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTab, setActiveTab] = useState('discover'); // discover or my-communities

  useEffect(() => {
    loadCommunities();
    if (currentUser) {
      loadMyCommunities();
    }
  }, [currentUser]);

  const loadCommunities = async () => {
    try {
      setLoading(true);
      const allCommunities = await getCommunities();
      setCommunities(allCommunities);
    } catch (error) {
      console.error('Error loading communities:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyCommunities = async () => {
    try {
      const userCommunities = await getUserCommunities(currentUser.uid);
      setMyCommunities(userCommunities);
    } catch (error) {
      console.error('Error loading my communities:', error);
    }
  };

  const filteredCommunities = communities.filter(community => {
    const matchesSearch = community.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         community.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || community.category === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const handleJoinCommunity = (communityId) => {
    navigate(`/community/${communityId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/feed')}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Communities</h1>
                <p className="text-sm text-gray-600">Join exclusive creator communities</p>
              </div>
            </div>
            
            <button
              onClick={() => navigate('/create-community')}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition flex items-center space-x-2 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Create Community</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('discover')}
              className={`pb-3 px-2 font-semibold transition border-b-2 ${
                activeTab === 'discover'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Discover
            </button>
            <button
              onClick={() => setActiveTab('my-communities')}
              className={`pb-3 px-2 font-semibold transition border-b-2 ${
                activeTab === 'my-communities'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              My Communities {myCommunities.length > 0 && `(${myCommunities.length})`}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'discover' ? (
          <>
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search communities..."
                  className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="mb-6 overflow-x-auto scrollbar-hide">
              <div className="flex space-x-2 min-w-max pb-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition whitespace-nowrap ${
                      activeCategory === category
                        ? 'bg-rose-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Communities Grid */}
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
                <button
                  onClick={() => navigate('/create-community')}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition inline-flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create First Community</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredCommunities.map((community, index) => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    index={index}
                    onClick={() => handleJoinCommunity(community.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* My Communities Tab */
          <div>
            {myCommunities.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No communities yet</h3>
                <p className="text-gray-600 mb-4">Join communities to see them here</p>
                <button
                  onClick={() => setActiveTab('discover')}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
                >
                  Discover Communities
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {myCommunities.map((community, index) => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    index={index}
                    isMember={true}
                    onClick={() => navigate(`/community/${community.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Community Card Component
function CommunityCard({ community, index, isMember = false, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 hover:border-rose-300 hover:shadow-lg transition cursor-pointer overflow-hidden group"
    >
      {/* Cover Image */}
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 overflow-hidden">
        {community.coverImage ? (
          <img 
            src={community.coverImage} 
            alt={community.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">
            👥
          </div>
        )}
        
        {/* Privacy Badge */}
        <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full flex items-center space-x-1">
          {community.isPrivate ? (
            <>
              <Lock className="w-3 h-3 text-white" />
              <span className="text-xs text-white font-medium">Private</span>
            </>
          ) : (
            <>
              <Globe className="w-3 h-3 text-white" />
              <span className="text-xs text-white font-medium">Public</span>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mb-3">
          <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">
            {community.name}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {community.description || 'No description'}
          </p>
          
          {/* Category Tag */}
          <span className="inline-block px-2 py-1 bg-rose-50 text-rose-600 text-xs font-medium rounded-full">
            {community.category || 'general'}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm mb-3">
          <div className="flex items-center space-x-1 text-gray-600">
            <Users className="w-4 h-4" />
            <span>{community.memberCount || 0} members</span>
          </div>
          
          {isMember && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
              Joined
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-gray-900">
            ${(community.price || 9.99).toFixed(2)}<span className="text-sm text-gray-500">/month</span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              isMember
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-rose-500 text-white hover:bg-rose-600'
            }`}
          >
            {isMember ? 'View' : 'Join'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}