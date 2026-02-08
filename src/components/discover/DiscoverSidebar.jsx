// src/components/discover/DiscoverSidebar.jsx - FIXED: NO TOP SPACE

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Loader2, ChevronRight } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function DiscoverSidebar() {
  const navigate = useNavigate();
  const [topCreators, setTopCreators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopCreators();
  }, []);

  const loadTopCreators = async () => {
    try {
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      const creators = [];
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.kycStatus === 'approved') {
          creators.push({
            id: doc.id,
            ...userData,
          });
        }
      });

      creators.sort((a, b) => (b.followers || 0) - (a.followers || 0));
      setTopCreators(creators.slice(0, 8));
    } catch (error) {
      console.error('Error loading top creators:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="hidden xl:block fixed right-0 top-0 w-80 h-screen bg-white border-l border-gray-200 p-6">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="hidden xl:block fixed right-0 top-0 w-80 h-screen bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header - NO TOP MARGIN */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-red-500" />
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

        {/* Creators List */}
        <div className="space-y-4">
          {topCreators.map((creator, index) => (
            <div
              key={creator.id}
              onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition group"
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                index === 0 ? 'bg-yellow-500 text-white' :
                index === 1 ? 'bg-gray-300 text-gray-700' :
                index === 2 ? 'bg-orange-400 text-white' :
                'bg-gray-100 text-gray-600'
              }`}>
                {index + 1}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {creator.profilePicture ? (
                  <img 
                    src={creator.profilePicture} 
                    alt={creator.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl">{creator.avatar || '👤'}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1">
                  <h3 className="font-semibold text-gray-900 truncate text-sm">
                    {creator.displayName || 'Anonymous'}
                  </h3>
                  {creator.kycStatus === 'approved' && (
                    <span className="text-blue-500 flex-shrink-0">✓</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {creator.followers || 0} followers
                </p>
              </div>

              {/* Follow Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Implement follow functionality
                }}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition opacity-0 group-hover:opacity-100"
              >
                Follow
              </button>
            </div>
          ))}
        </div>

        {/* View All Button */}
        <button
          onClick={() => navigate('/discover')}
          className="w-full mt-6 py-3 border-2 border-gray-200 hover:border-red-500 text-gray-700 hover:text-red-500 rounded-lg font-semibold transition"
        >
          See All Creators
        </button>
      </div>
    </div>
  );
}
