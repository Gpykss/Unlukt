// src/pages/Discover/Discover.jsx - UPDATED: GLOBAL NSFW TOGGLE (SETTING ONLY)

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, Users, Loader2, Image as ImageIcon, Eye, EyeOff,
  Video, Calendar, Clock, ChevronRight
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

  const liveCreators = allCreators.filter(c => c.is_live === true);
  const gridCreators = allCreators.filter(c => c.is_live !== true);

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
        {/* "Live Now" Carousel Slider */}
        <div className="mb-10">
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span>Live Now</span>
          </h3>
          
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {liveCreators.length > 0 ? (
              liveCreators.map((creator) => (
                <div
                  key={creator.id}
                  onClick={() => navigate(`/livestream/${creator.id}`)}
                  className="w-72 sm:w-80 h-96 flex-shrink-0 relative rounded-3xl overflow-hidden shadow-xl border border-white/10 group cursor-pointer bg-slate-900 snap-start"
                >
                  {/* Background Loop */}
                  <img
                    src={`/ads/${creator.username}/fallback-1.webp`}
                    alt=""
                    onError={(e) => { e.target.src = '/ads/default/fallback-1.webp'; }}
                    className="absolute inset-0 w-full h-full object-cover z-0 opacity-70 group-hover:scale-105 transition-transform duration-700 pointer-events-none"
                  />
                  
                  {/* Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-10" />
                  
                  {/* Live Badge */}
                  <div className="absolute top-4 left-4 bg-red-500/90 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg z-20">
                    <span className="w-2 h-2 bg-white rounded-full animate-blink-red" />
                    <span>LIVE NOW</span>
                  </div>
                  
                  {/* Content Overlay */}
                  <div className="absolute bottom-0 inset-x-0 p-5 z-20 flex flex-col justify-end text-white">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-12 rounded-full border-2 border-rose-500 animate-neon-pulse overflow-hidden flex-shrink-0 bg-slate-800">
                        <img
                          src={creator.profilePicture || creator.avatar || '/ads/default/fallback-1.webp'}
                          alt=""
                          onError={(e) => { e.target.src = '/ads/default/fallback-1.webp'; }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-base truncate drop-shadow-md">{creator.displayName || creator.username}</h4>
                        <p className="text-xs text-rose-300 font-semibold drop-shadow-md truncate">@{creator.username}</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-200 font-medium mb-3 line-clamp-2 leading-snug drop-shadow-md">
                      {creator.bio || "Join my private live room and stream with me now!"}
                    </p>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/livestream/${creator.id}`);
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-rose-500/20 transition-all duration-300 transform active:scale-95"
                    >
                      Tap to Join Live Room
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <>
                {/* Drisana Dummy Slide */}
                <div
                  onClick={() => navigate('/creator/drisana')}
                  className="w-72 sm:w-80 h-96 flex-shrink-0 relative rounded-3xl overflow-hidden shadow-xl border border-white/10 group cursor-pointer bg-slate-900 snap-start"
                >
                  {/* Background Loop */}
                  <img
                    src="/ads/drisana/fallback-1.webp"
                    alt=""
                    onError={(e) => { e.target.src = '/ads/default/fallback-1.webp'; }}
                    className="absolute inset-0 w-full h-full object-cover z-0 opacity-70 group-hover:scale-105 transition-transform duration-700 pointer-events-none"
                  />
                  
                  {/* Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-10" />
                  
                  {/* Badge */}
                  <div className="absolute top-4 left-4 bg-rose-600/90 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg z-20">
                    <span className="w-2 h-2 bg-rose-200 rounded-full animate-blink-red" />
                    <span>DAILY SHOWS</span>
                  </div>
                  
                  {/* Content Overlay */}
                  <div className="absolute bottom-0 inset-x-0 p-5 z-20 flex flex-col justify-end text-white">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-12 rounded-full border-2 border-rose-500 animate-neon-pulse overflow-hidden flex-shrink-0 bg-slate-800">
                        <img
                          src="/ads/drisana/image-1.webp"
                          alt=""
                          onError={(e) => { e.target.src = '/ads/drisana/fallback-1.webp'; }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-base truncate drop-shadow-md">Drisana</h4>
                        <p className="text-xs text-rose-300 font-semibold drop-shadow-md truncate">@drisana</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-200 font-medium mb-3 line-clamp-2 leading-snug drop-shadow-md">
                      Drisana's Private Lounge Active Daily — Scheduled Shows Streaming Tonight! 🤫
                    </p>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/creator/drisana');
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-rose-500/20 transition-all duration-300 transform active:scale-95"
                    >
                      View Scheduled Showtimes
                    </button>
                  </div>
                </div>
                
                {/* Scheduled Showtimes Slide Card */}
                <div
                  className="w-72 sm:w-80 h-96 flex-shrink-0 relative rounded-3xl p-6 shadow-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 flex flex-col justify-between snap-start"
                >
                  <div>
                    <div className="flex items-center space-x-2 text-rose-500 mb-4">
                      <Calendar className="w-5 h-5" />
                      <h4 className="font-black text-sm uppercase tracking-wider text-gray-900">Scheduled Showtimes</h4>
                    </div>
                    <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                      Don't miss the next interactive live streaming event! Set your reminders for these scheduled showtimes:
                    </p>
                    
                    <div className="space-y-3">
                      {[
                        { day: 'Mon, Wed, Fri', time: '9:00 PM EST', desc: 'Interactive Q&A' },
                        { day: 'Thursday', time: '10:00 PM EST', desc: 'VIP Lounge Exclusive' },
                        { day: 'Saturday', time: '11:00 PM EST', desc: 'Weekend Party Stream' }
                      ].map((sched, idx) => (
                        <div key={idx} className="flex items-start justify-between p-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm">
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-gray-900">{sched.day}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{sched.desc}</p>
                          </div>
                          <div className="flex items-center text-xs font-bold text-rose-500 gap-1 bg-rose-50 px-2.5 py-1 rounded-xl">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{sched.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => navigate('/creator/drisana')}
                    className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm rounded-xl transition duration-300 flex items-center justify-center gap-1"
                  >
                    <span>Explore Her Profile</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <Sparkles className="w-7 sm:w-8 h-7 sm:h-8 text-rose-500" />
            <span>All Creators</span>
          </h2>
          <p className="text-sm text-gray-500">{gridCreators.length} creators</p>
        </div>

        {gridCreators.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {gridCreators.map((creator) => (
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