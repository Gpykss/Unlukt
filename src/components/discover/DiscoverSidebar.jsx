// src/components/discover/DiscoverSidebar.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Loader2, ChevronRight, Users, Crown, Image as ImageIcon } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creators = [];
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isCreator) creators.push({ id: doc.id, ...data });
      });

      const subsSnapshot = await getDocs(query(
        collection(db, 'subscriptions'),
        where('status', '==', 'active')
      ));
      const subCounts = {};
      subsSnapshot.forEach((doc) => {
        const creatorId = doc.data().creatorId;
        if (creatorId) subCounts[creatorId] = (subCounts[creatorId] || 0) + 1;
      });

      const postsSnapshot = await getDocs(collection(db, 'posts'));
      const postCounts = {};
      postsSnapshot.forEach((doc) => {
        const { userId, archived } = doc.data();
        if (userId && !archived) postCounts[userId] = (postCounts[userId] || 0) + 1;
      });

      creators.forEach((c) => {
        c.subscriberCount = subCounts[c.id] || 0;
        c.postCount = postCounts[c.id] || 0;
      });

      creators.sort((a, b) =>
        b.subscriberCount !== a.subscriberCount
          ? b.subscriberCount - a.subscriberCount
          : (b.followers || 0) - (a.followers || 0)
      );

      setTopCreators(creators.slice(0, 6));
    } catch (error) {
      console.error('Error loading top creators:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="hidden lg:block fixed right-0 top-0 w-72 h-screen bg-white border-l border-gray-200 p-6">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="hidden lg:block fixed right-0 top-0 w-72 h-screen bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <span>Top Creators</span>
          </h2>
          <button
            onClick={() => navigate('/discover')}
            className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center"
          >
            See All
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Creator Cards */}
        <div className="space-y-3">
          {topCreators.map((creator, index) => (
            <div
              key={creator.id}
              onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
              className="bg-white border border-gray-200 hover:border-rose-300 hover:shadow-md rounded-xl p-3 cursor-pointer transition"
            >
              {/* Top row: rank + avatar + name */}
              <div className="flex items-center space-x-2 mb-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  index === 0 ? 'bg-yellow-400 text-white' :
                  index === 1 ? 'bg-gray-400 text-white' :
                  index === 2 ? 'bg-orange-400 text-white' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {index + 1}
                </span>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-100 to-pink-100 flex-shrink-0 overflow-hidden border-2 border-white shadow-sm">
                  {creator.profilePicture ? (
                    <img src={creator.profilePicture} alt={creator.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base">
                      {creator.avatar || '👤'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1">
                    <p className="font-bold text-gray-900 text-xs truncate">{creator.displayName || 'Anonymous'}</p>
                    {creator.kycStatus === 'approved' && <span className="text-blue-500 text-[10px]">✓</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">@{creator.username || 'user'}</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1 bg-gray-50 rounded-lg p-2">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-0.5 mb-0.5">
                    <Crown className="w-2.5 h-2.5 text-rose-500" />
                    <span className="text-xs font-bold text-gray-800">{creator.subscriberCount}</span>
                  </div>
                  <p className="text-[9px] text-gray-400">Subs</p>
                </div>
                <div className="text-center border-x border-gray-200">
                  <div className="flex items-center justify-center space-x-0.5 mb-0.5">
                    <Users className="w-2.5 h-2.5 text-blue-400" />
                    <span className="text-xs font-bold text-gray-800">{creator.followers || 0}</span>
                  </div>
                  <p className="text-[9px] text-gray-400">Followers</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-0.5 mb-0.5">
                    <ImageIcon className="w-2.5 h-2.5 text-purple-400" />
                    <span className="text-xs font-bold text-gray-800">{creator.postCount}</span>
                  </div>
                  <p className="text-[9px] text-gray-400">Posts</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/discover')}
          className="w-full mt-4 py-2.5 border-2 border-gray-200 hover:border-red-500 text-gray-700 hover:text-red-500 rounded-xl text-sm font-semibold transition"
        >
          See All Creators
        </button>
      </div>
    </div>
  );
}