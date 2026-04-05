// src/pages/Discover/Discover.jsx - UPDATED: GLOBAL NSFW TOGGLE (SETTING ONLY)

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, Users, Loader2, Image as ImageIcon, Eye, EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useContentSettings } from '../../hooks/useContentSettings';

export default function Discover() {
  const navigate = useNavigate();
  const [allCreators, setAllCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showNSFW, setShowNSFW } = useContentSettings();

  useEffect(() => { loadAllCreators(); }, []);

  const loadAllCreators = async () => {
    try {
      setLoading(true);
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creators = [];
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.kycStatus === 'approved') {
          creators.push({ id: doc.id, ...userData });
        }
      });

      const postsSnapshot = await getDocs(collection(db, 'posts'));
      const postCounts = {};
      postsSnapshot.forEach((doc) => {
        const post = doc.data();
        if (post.userId && !post.archived) {
          postCounts[post.userId] = (postCounts[post.userId] || 0) + 1;
        }
      });

      creators.forEach((creator) => {
        creator.mediaCount = postCounts[creator.id] || 0;
      });

      creators.sort((a, b) => (b.followers || 0) - (a.followers || 0));
      setAllCreators(creators);
    } catch (error) {
      console.error('Error loading creators:', error);
    } finally {
      setLoading(false);
    }
  };

  const CreatorCard = ({ creator }) => (
    <div
      className="relative cursor-pointer"
      onClick={() => navigate(`/creator/${creator.username?.replace('@', '') || creator.id}`)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-rose-300 hover:shadow-xl transition"
      >
        {/* Banner — taller on mobile so image shows well */}
        <div className="h-40 sm:h-36 bg-gradient-to-br from-rose-300 via-pink-300 to-purple-300 relative">
          {creator.banner && !creator.banner.includes('🎨') && (
            <img src={creator.banner} alt="" className="w-full h-full object-cover" />
          )}
          <button
            className="absolute top-3 right-3 z-10 px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-full shadow-md transition"
            onClick={e => e.stopPropagation()}
          >
            View
          </button>
        </div>

        {/* Content — pt-12 clears the avatar that pokes below the banner */}
        <div className="px-4 pb-4 pt-12">
          <div className="mb-2">
            <div className="flex items-center space-x-1.5 mb-0.5">
              <h3 className="font-bold text-gray-900 text-base truncate">
                {creator.displayName || 'Anonymous'}
              </h3>
              {creator.kycStatus === 'approved' && (
                <span className="text-blue-500 text-xs flex-shrink-0">✓</span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">@{creator.username || 'user'}</p>
          </div>

          {creator.bio && (
            <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">{creator.bio}</p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-center">
              <div className="flex items-center space-x-1">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{creator.followers || 0}</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Followers</p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="text-center">
              <div className="flex items-center space-x-1">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{creator.mediaCount || 0}</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Posts</p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900">
                ${Number(creator.subscriptionPriceMonthly ?? creator.subscriptionPrice ?? 9.99).toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">/month</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Avatar — outside overflow-hidden, position matches banner height */}
      <div className="absolute left-4 top-[120px] sm:top-[104px] z-20 w-20 h-20 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-rose-200 to-pink-200 overflow-hidden flex items-center justify-center">
        {(creator.profilePicture || (creator.avatar && !creator.avatar.includes('👤'))) ? (
          <img
            src={creator.profilePicture || creator.avatar}
            alt={creator.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-2xl font-bold text-rose-400">
            {creator.displayName?.charAt(0)?.toUpperCase() || '?'}
          </span>
        )}
      </div>
    </div>
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
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="flex items-center space-x-2 text-gray-700">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNSFW((v) => !v)}
            className={`px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
              showNSFW
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {showNSFW ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showNSFW ? 'NSFW: ON' : 'NSFW: OFF'}</span>
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/feed')} className="flex items-center space-x-2 text-gray-700 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back to Feed</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNSFW((v) => !v)}
            className={`px-4 py-2 rounded-lg border font-semibold flex items-center gap-2 ${
              showNSFW
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {showNSFW ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showNSFW ? 'Show NSFW: ON' : 'Show NSFW: OFF'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <Sparkles className="w-7 sm:w-8 h-7 sm:h-8 text-rose-500" />
            <span>All Creators</span>
          </h2>
          <p className="text-sm text-gray-500">{allCreators.length} creators</p>
        </div>

        {allCreators.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {allCreators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
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