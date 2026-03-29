// src/pages/Admin/Analytics.jsx - ADMIN PLATFORM ANALYTICS

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Crown,
  Loader2, Calendar, ChevronDown, Eye, Heart, MessageCircle,
  Activity, Zap, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, getCountFromServer
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: null },
];

export default function AdminAnalytics() {
  const navigate = useNavigate();

  const [range, setRange] = useState(RANGES[1]);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    platformRevenue: 0,
    creatorRevenue: 0,
    totalUsers: 0,
    totalCreators: 0,
    verifiedCreators: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    totalTips: 0,
    avgRevenuePerUser: 0,
    avgPostsPerCreator: 0,
    avgLikesPerPost: 0,
  });

  const [revenueBreakdown, setRevenueBreakdown] = useState([]);
  const [topCreators, setTopCreators] = useState([]);

  useEffect(() => {
    loadStats();
  }, [range]);

  // JS-side date helper — avoids composite index requirements
  const sinceDate = () => {
    if (!range.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    return d;
  };

  // Returns true if a Firestore doc's createdAt is within the selected range
  const afterSince = (data, field = 'createdAt') => {
    const since = sinceDate();
    if (!since) return true;
    const raw = data[field];
    if (!raw) return false;
    const ts = raw.toDate ? raw.toDate() : (raw.seconds ? new Date(raw.seconds * 1000) : new Date(raw));
    return ts >= since;
  };

  const loadStats = async () => {
    try {
      setLoading(true);

      // ── Revenue: Crypto payments — fetch all then JS date-filter ──────────
      // (avoids composite index: status + createdAt)
      const cryptoSnap = await getDocs(
        query(collection(db, 'crypto_payments'),
          where('status', 'in', ['finished', 'completed', 'confirmed', 'verified']))
      );
      let cryptoRevenue = 0;
      cryptoSnap.forEach(d => {
        if (afterSince(d.data())) cryptoRevenue += Number(d.data().amount || 0);
      });

      // ── Revenue: NGN payments — same pattern ──────────────────────────────
      const ngnSnap = await getDocs(
        query(collection(db, 'ngn_payments'), where('status', '==', 'approved'))
      );
      let ngnRevenue = 0;
      ngnSnap.forEach(d => {
        if (afterSince(d.data())) ngnRevenue += Number(d.data().amountUSD || 0);
      });

      const totalRevenue    = cryptoRevenue + ngnRevenue;
      const platformRevenue = totalRevenue * 0.20;
      const creatorRevenue  = totalRevenue * 0.80;

      // ── Users (totals — not date filtered, counts make more sense all-time) ─
      const usersCount    = await getCountFromServer(collection(db, 'users'));
      const creatorsQuery = query(collection(db, 'users'), where('isCreator', '==', true));
      const creatorsCount = await getCountFromServer(creatorsQuery);
      const verifiedCount = await getCountFromServer(
        query(collection(db, 'users'), where('kycStatus', '==', 'approved'))
      );

      // ── Subscriptions counts (all-time totals) ────────────────────────────
      const allSubsCount    = await getCountFromServer(collection(db, 'subscriptions'));
      const activeSubsCount = await getCountFromServer(
        query(collection(db, 'subscriptions'), where('status', '==', 'active'))
      );

      // ── Posts — fetch once, JS date-filter for range stats ───────────────
      const allPostsSnap = await getDocs(collection(db, 'posts'));
      let totalLikes = 0, totalComments = 0, totalPostsNum = 0;
      allPostsSnap.forEach(d => {
        if (afterSince(d.data())) {
          totalPostsNum++;
          totalLikes    += Number(d.data().likes    || 0);
          totalComments += Number(d.data().comments || 0);
        }
      });

      // ── Tips — fetch all, JS date-filter ─────────────────────────────────
      const tipsSnap = await getDocs(collection(db, 'tips'));
      let totalTips = 0;
      tipsSnap.forEach(d => {
        if (afterSince(d.data())) totalTips += Number(d.data().amount || 0);
      });

      // ── PPV unlocks — fetch all, JS date-filter ───────────────────────────
      const ppvSnap = await getDocs(collection(db, 'ppv_unlocks'));
      let ppvRevenue = 0;
      ppvSnap.forEach(d => {
        if (afterSince(d.data())) ppvRevenue += Number(d.data().amount || 0);
      });

      // ── Subscriptions spending — fetch all, JS date-filter ────────────────
      const subsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('status', 'in', ['active', 'expired']))
      );
      let subsRevenue = 0;
      subsSnap.forEach(d => {
        if (afterSince(d.data())) subsRevenue += Number(d.data().amount || 0);
      });

      // ── Completed calls — fetch all, JS date-filter ───────────────────────
      const callsSnap = await getDocs(
        query(collection(db, 'video_calls'), where('status', '==', 'completed'))
      );
      let callsRevenue = 0;
      callsSnap.forEach(d => {
        if (afterSince(d.data())) callsRevenue += Number(d.data().price || 0);
      });

      const totalSpending = subsRevenue + ppvRevenue + totalTips + callsRevenue;
      const safePct = (n) => totalSpending > 0 ? Math.round((n / totalSpending) * 100) : 0;

      const totalUsersNum    = usersCount.data().count;
      const totalCreatorsNum = creatorsCount.data().count;

      setStats({
        totalRevenue, platformRevenue, creatorRevenue,
        cryptoRevenue, ngnRevenue,
        totalUsers:          totalUsersNum,
        totalCreators:       totalCreatorsNum,
        verifiedCreators:    verifiedCount.data().count,
        totalSubscriptions:  allSubsCount.data().count,
        activeSubscriptions: activeSubsCount.data().count,
        totalPosts:          totalPostsNum,
        totalLikes, totalComments, totalTips,
        avgRevenuePerUser:   totalUsersNum    > 0 ? totalRevenue / totalUsersNum    : 0,
        avgPostsPerCreator:  totalCreatorsNum > 0 ? totalPostsNum / totalCreatorsNum : 0,
        avgLikesPerPost:     totalPostsNum    > 0 ? totalLikes / totalPostsNum      : 0,
      });

      setRevenueBreakdown([
        { label: 'Subscriptions',     amount: subsRevenue,  color: 'bg-rose-500',   pct: safePct(subsRevenue)  },
        { label: 'Tips',              amount: totalTips,    color: 'bg-yellow-400', pct: safePct(totalTips)    },
        { label: 'PPV Messages',      amount: ppvRevenue,   color: 'bg-purple-500', pct: safePct(ppvRevenue)   },
        { label: 'Video/Voice Calls', amount: callsRevenue, color: 'bg-blue-400',   pct: safePct(callsRevenue) },
      ]);

      // ── Top creators — enrich with real follow/subscriber counts ──────────
      const creatorsSnap = await getDocs(creatorsQuery);
      const creatorList  = creatorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch real counts for each creator (batched)
      const enriched = await Promise.all(
        creatorList.map(async (c) => {
          const [fSnap, sSnap] = await Promise.all([
            getCountFromServer(query(collection(db, 'follows'), where('followingId', '==', c.id))),
            getCountFromServer(query(collection(db, 'subscriptions'), where('creatorId', '==', c.id), where('status', '==', 'active'))),
          ]);
          return {
            ...c,
            followersCount:    fSnap.data().count,
            subscribersCount:  sSnap.data().count,
          };
        })
      );

      setTopCreators(
        enriched
          .sort((a, b) => b.followersCount - a.followersCount)
          .slice(0, 5)
      );

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Platform Analytics</h1>
              <p className="text-xs text-gray-500">Real-time platform statistics</p>
            </div>
          </div>

          {/* Range picker */}
          <div className="relative">
            <button
              onClick={() => setShowRangeMenu(v => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold text-gray-700 transition"
            >
              <Calendar className="w-4 h-4" />
              {range.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showRangeMenu && (
              <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[120px]">
                {RANGES.map(r => (
                  <button key={r.label} onClick={() => { setRange(r); setShowRangeMenu(false); }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-50 font-medium ${range.label === r.label ? 'text-rose-600' : 'text-gray-700'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Revenue Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <DollarSign className="w-8 h-8" />
              <span className="text-sm opacity-90">Total Revenue</span>
            </div>
            <p className="text-4xl font-bold mb-1">{fmt(stats.totalRevenue)}</p>
            <p className="text-sm opacity-75">From all payments</p>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <Zap className="w-8 h-8" />
              <span className="text-sm opacity-90">Platform Share</span>
            </div>
            <p className="text-4xl font-bold mb-1">{fmt(stats.platformRevenue)}</p>
            <p className="text-sm opacity-75">20% of revenue</p>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <Crown className="w-8 h-8" />
              <span className="text-sm opacity-90">Creator Earnings</span>
            </div>
            <p className="text-4xl font-bold mb-1">{fmt(stats.creatorRevenue)}</p>
            <p className="text-sm opacity-75">80% of revenue</p>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Active Creators', value: stats.totalCreators, icon: Crown, color: 'text-purple-500', bg: 'bg-purple-50' },
            { label: 'Verified Creators', value: stats.verifiedCreators, icon: Target, color: 'text-green-500', bg: 'bg-green-50' },
            { label: 'Active Subs', value: stats.activeSubscriptions, icon: TrendingUp, color: 'text-rose-500', bg: 'bg-rose-50' },
            { label: 'Total Posts', value: stats.totalPosts, icon: Eye, color: 'text-gray-600', bg: 'bg-gray-50' },
            { label: 'Total Likes', value: stats.totalLikes.toLocaleString(), icon: Heart, color: 'text-red-500', bg: 'bg-red-50' },
            { label: 'Total Comments', value: stats.totalComments.toLocaleString(), icon: MessageCircle, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Total Tips', value: fmt(stats.totalTips), icon: DollarSign, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <motion.div key={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-500" />
              Revenue Breakdown
            </h2>
            <div className="space-y-3">
              {revenueBreakdown.map(({ label, amount, color, pct }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className="font-bold text-gray-900">{fmt(amount)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className={`h-full ${color} rounded-full`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Averages */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-4">Platform Averages</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-600">Revenue per User</span>
                <span className="font-bold text-gray-900">{fmt(stats.avgRevenuePerUser)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-600">Posts per Creator</span>
                <span className="font-bold text-gray-900">{Math.round(stats.avgPostsPerCreator)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-600">Avg Likes per Post</span>
                <span className="font-bold text-gray-900">{Math.round(stats.avgLikesPerPost)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-600">Creator Verification Rate</span>
                <span className="font-bold text-gray-900">
                  {stats.totalCreators > 0 ? Math.round((stats.verifiedCreators / stats.totalCreators) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Creators */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            Top Creators
          </h2>
          {topCreators.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No creators yet</p>
          ) : (
            <div className="space-y-3">
              {topCreators.map((creator, index) => (
                <div key={creator.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                  <span className="text-lg font-bold text-gray-300 w-6">#{index + 1}</span>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                    {creator.avatar || creator.profilePicture ? (
                      <img src={creator.avatar || creator.profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{creator.displayName?.charAt(0).toUpperCase() || 'C'}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{creator.displayName || 'Unknown'}</p>
                    <p className="text-sm text-gray-500">@{creator.username || 'user'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{creator.followersCount || 0}</p>
                    <p className="text-xs text-gray-500">followers</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{creator.subscribersCount || 0}</p>
                    <p className="text-xs text-gray-500">subscribers</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}