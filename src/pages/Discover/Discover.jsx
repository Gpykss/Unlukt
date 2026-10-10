// src/pages/Discover/Discover.jsx - UPDATED: GLOBAL NSFW TOGGLE (SETTING ONLY)

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, Users, Loader2, Image as ImageIcon, Eye, EyeOff,
  Video, Calendar, Clock, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, or, limit } from 'firebase/firestore';
import { getScheduledLive, formatLiveTime } from '../../utils/share';
import { db } from '../../config/firebase';
import { useContentSettings } from '../../hooks/useContentSettings';
import { useDataLite } from '../../contexts/DataLiteContext';
import { feedImage } from '../../utils/imageHelpers';

export default function Discover() {
  const navigate = useNavigate();
  const [allCreators, setAllCreators] = useState([]);
  const [shown, setShown] = useState(24);
  const [loading, setLoading] = useState(true);
  const { showNSFW, setShowNSFW } = useContentSettings();
  // Data Saver: creator cards load smaller banners and avatars
  const { dataLite } = useDataLite();
  const lite = (url, width) => (dataLite ? feedImage(url, width) : url);


  // ✅ Realtime: new creators, profile edits, follower counts and live status update instantly
  useEffect(() => {
    // ✅ Every creator account — KYC verified or not (and anyone who has started creator KYC)
    // Capped so the live listener never downloads every creator as the platform grows (data + reads)
    const q = query(collection(db, 'users'), or(where('isCreator', '==', true), where('kycStatus', 'in', ['pending', 'approved'])), limit(150));
    const unsub = onSnapshot(q, (snap) => {
      const creators = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Live now first, then scheduled lives (soonest first), then by followers
      const rank = (c) => (c.is_live ? 2 : getScheduledLive(c) ? 1 : 0);
      creators.sort((a, b) => rank(b) - rank(a)
        || ((getScheduledLive(a)?.date || 0) - (getScheduledLive(b)?.date || 0))
        || (b.followers || 0) - (a.followers || 0));
      setAllCreators(creators);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Post counts live on each creator's profile (kept current by the server) — no need to
  // download every post just to count them (that cost fans a lot of data).
  const postCounts = Object.fromEntries(allCreators.map((c) => [c.id, c.postCount || 0]));

  const creatorPath = (creator) => `/creator/${creator.username?.replace('@', '') || creator.id}`;
  const goToCreator = (e, creator) => { e?.stopPropagation(); navigate(creatorPath(creator)); };

  const CreatorCard = ({ creator }) => (
    <div
      className="relative cursor-pointer"
      onClick={() => navigate(creatorPath(creator))}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-rose-300 hover:shadow-xl transition"
      >
        {/* Banner — taller on mobile so image shows well */}
        <div className="h-40 sm:h-36 bg-gradient-to-br from-rose-300 via-pink-300 to-purple-300 relative">
          {creator.banner && !creator.banner.includes('🎨') && (
            <img src={lite(creator.banner, 480)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          )}
          {creator.is_live ? (
            <button
              className="absolute top-3 right-3 z-10 px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-black rounded-full shadow-md flex items-center gap-1.5"
              onClick={(e) => { e.stopPropagation(); navigate(`/livestream/${creator.id}`); }}
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> LIVE · Join
            </button>
          ) : (
            <button
              className="absolute top-3 right-3 z-10 px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-full shadow-md transition"
              onClick={(e) => goToCreator(e, creator)}
            >
              View
            </button>
          )}
          {!creator.is_live && getScheduledLive(creator) && (
            <span className="absolute bottom-2 left-24 right-3 z-10 text-[11px] font-bold text-white bg-black/55 backdrop-blur px-2.5 py-1 rounded-full truncate">
              🗓 Live {formatLiveTime(getScheduledLive(creator).date)}
            </span>
          )}
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
                <p className="text-sm font-bold text-gray-900">{postCounts[creator.id] || 0}</p>
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
      <div onClick={(e) => goToCreator(e, creator)} role="link" aria-label={`Open ${creator.displayName || 'creator'}'s page`}
        className={`cursor-pointer absolute left-4 top-[120px] sm:top-[104px] z-20 w-20 h-20 rounded-full border-4 ${creator.is_live ? 'border-red-500 ring-2 ring-red-300' : 'border-white'} shadow-lg bg-gradient-to-br from-rose-200 to-pink-200 overflow-hidden flex items-center justify-center`}>
        {(creator.profilePicture || (creator.avatar && !creator.avatar.includes('👤'))) ? (
          <img
            loading="lazy"
            src={lite(creator.profilePicture || creator.avatar, 160)}
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

  // Admin accounts and banned users stay hidden
  const gridCreators = allCreators.filter(c => !c.isAdmin && !c.isBanned && !c.banned);

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
          <p className="text-sm text-gray-500">{gridCreators.length} creators</p>
        </div>

        {gridCreators.length > 0 ? (
          <>
            {/* 24 at a time: each card loads a banner + avatar, so this saves a lot of mobile data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {gridCreators.slice(0, shown).map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
            {gridCreators.length > shown && (
              <div className="flex justify-center mt-6">
                <button onClick={() => setShown((n) => n + 24)}
                  className="px-6 py-3 rounded-xl bg-white border border-gray-200 hover:border-rose-300 text-sm font-semibold text-gray-700">
                  Show more creators ({gridCreators.length - shown} more)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Creators Yet</h3>
            <p className="text-gray-600">Check back soon for new creators!</p>
          </div>
        )}
      </div>
    </div>
  );
}