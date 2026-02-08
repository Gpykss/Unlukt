// src/pages/Discover/Discover.jsx - FIXED: ALL CREATORS + STATS

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Sparkles,
  Users,
  Loader2,
  Image as ImageIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function Discover() {
  const navigate = useNavigate();
  const [allCreators, setAllCreators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllCreators();
  }, []);

  const loadAllCreators = async () => {
    try {
      setLoading(true);

      // ✅ GET ALL APPROVED CREATORS
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

      // ✅ GET POST COUNT FOR EACH CREATOR
      const postsRef = collection(db, 'posts');
      const postsSnapshot = await getDocs(postsRef);
      
      const postCounts = {};
      postsSnapshot.forEach((doc) => {
        const post = doc.data();
        if (post.userId && !post.archived) {
          postCounts[post.userId] = (postCounts[post.userId] || 0) + 1;
        }
      });

      // Add post counts to creators
      creators.forEach(creator => {
        creator.mediaCount = postCounts[creator.id] || 0;
      });

      // Sort by followers (highest first)
      creators.sort((a, b) => (b.followers || 0) - (a.followers || 0));

      setAllCreators(creators);

    } catch (error) {
      console.error('Error loading creators:', error);
    } finally {
      setLoading(false);
    }
  };

  const CreatorCard = ({ creator }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
      className="bg-white rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-rose-300 hover:shadow-xl transition cursor-pointer"
    >
      {/* Banner */}
      <div className="h-24 sm:h-32 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 flex items-center justify-center relative">
        {creator.profilePicture ? (
          <img 
            src={creator.profilePicture} 
            alt={creator.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-5xl">{creator.avatar || '👤'}</span>
        )}
      </div>

      {/* Profile */}
      <div className="p-4 sm:p-6 -mt-8 relative">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 border-4 border-white flex items-center justify-center text-3xl mb-4 shadow-lg overflow-hidden">
          {creator.profilePicture ? (
            <img 
              src={creator.profilePicture} 
              alt={creator.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{creator.avatar || '👤'}</span>
          )}
        </div>

        {/* Name & Username */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-bold text-gray-900 text-lg truncate">{creator.displayName || 'Anonymous'}</h3>
              {creator.kycStatus === 'approved' && (
                <span className="text-blue-500 flex-shrink-0">✓</span>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">@{creator.username || 'user'}</p>
          </div>
        </div>

        {/* Bio */}
        {creator.bio && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{creator.bio}</p>
        )}

        {/* ✅ STATS: FOLLOWERS + MEDIA COUNT */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <div className="text-center flex-1">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Users className="w-4 h-4 text-gray-500" />
              <p className="text-lg font-bold text-gray-900">{creator.followers || 0}</p>
            </div>
            <p className="text-xs text-gray-500">Followers</p>
          </div>
          
          <div className="h-10 w-px bg-gray-200"></div>
          
          <div className="text-center flex-1">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <p className="text-lg font-bold text-gray-900">{creator.mediaCount || 0}</p>
            </div>
            <p className="text-xs text-gray-500">Media</p>
          </div>
        </div>

        {/* Follow Button */}
        <button className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition shadow-lg hover:shadow-xl">
          View Profile
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
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center space-x-3">
              <Sparkles className="w-7 sm:w-8 h-7 sm:h-8 text-rose-500" />
              <span>All Creators</span>
            </h2>
            <p className="text-sm sm:text-base text-gray-500">{allCreators.length} creators</p>
          </div>
        </div>

        {/* ✅ ALL CREATORS GRID */}
        {allCreators.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {allCreators.map((creator) => (
              <CreatorCard 
                key={creator.id} 
                creator={creator} 
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Creators Yet</h3>
            <p className="text-gray-600">Check back soon for approved creators!</p>
          </div>
        )}
      </div>
    </div>
  );
}
