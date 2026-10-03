// src/pages/Analytics/Analytics.jsx - CREATOR DEEP ANALYTICS
// Scoped to the logged-in creator. Implements PRD Section 15.1 lazy analytics.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Crown,
  Loader2, Calendar, ChevronDown, Eye, Heart, MessageCircle,
  Sparkles, RefreshCw, Video, Gift, Lock, ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, getDoc,
  orderBy, limit
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

const RANGES = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time',     days: null },
];

export default function CreatorAnalytics({ embedded = false }) {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const [range, setRange] = useState(RANGES[1]);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core metrics
  const [stats, setStats] = useState({
    availableBalance: 0,
    lifetimeEarnings: 0,
    activeSubscribers: 0,
    followers: 0,
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
  });

  // Revenue breakdown streams
  const [revenueStreams, setRevenueStreams] = useState({
    subscriptions: 0,
    tips: 0,
    unlocks: 0,
    calls: 0,
  });

  // Monthly historical trend (last 6 months)
  const [monthlyEarnings, setMonthlyEarnings] = useState([]);

  // Top performing posts
  const [topPosts, setTopPosts] = useState([]);

  // Recent fan interactions
  const [recentActivities, setRecentActivities] = useState([]);

  const formatCurrency = (n) => `$${Number(n || 0).toFixed(2)}`;

  const formatTimeAgo = (ts) => {
    if (!ts) return 'Just now';
    try {
      const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts.seconds ? ts.seconds * 1000 : ts));
      const s = Math.floor((Date.now() - date.getTime()) / 1000);
      if (s < 60) return 'Just now';
      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
      return `${Math.floor(s / 86400)}d ago`;
    } catch {
      return 'Recently';
    }
  };

  const loadCreatorAnalytics = useCallback(async () => {
    if (!currentUser?.uid) return;

    try {
      setLoading(true);
      const uid = currentUser.uid;

      // 1. Fetch Balances (wallets + creator_balances)
      let availBal = 0;
      let lifeBal = 0;
      let monthMap = {};

      try {
        const cBalSnap = await getDoc(doc(db, 'creator_balances', uid));
        let cAvail = 0;
        if (cBalSnap.exists()) {
          const d = cBalSnap.data();
          cAvail = (d.availableBalance || 0) + (d.pendingBalance || 0);
          lifeBal = d.totalEarnings || (cAvail > 0 ? cAvail : 0);
          monthMap = d.monthlyEarnings || {};
        }

        const walletSnap = await getDoc(doc(db, 'wallets', uid));
        let wAvail = 0;
        if (walletSnap.exists() && walletSnap.data().balanceMinor !== undefined) {
          wAvail = walletSnap.data().balanceMinor / 100;
        }

        availBal = Math.max(cAvail, wAvail);
        if (!lifeBal || lifeBal < availBal) lifeBal = availBal;
      } catch (err) {
        console.warn('Error reading creator balances:', err);
      }

      // 2. Fetch Active Subscriptions for this creator
      let activeSubs = 0;
      let subRevenue = 0;
      try {
        const subsSnap = await getDocs(query(
          collection(db, 'subscriptions'),
          where('creatorId', '==', uid)
        ));
        const now = new Date();
        subsSnap.forEach(d => {
          const data = d.data();
          const exp = data.expiresAt?.toDate?.() || (data.expiresAt?.seconds ? new Date(data.expiresAt.seconds * 1000) : null);
          if (data.status === 'active' && (!exp || exp > now)) {
            activeSubs++;
          }
          subRevenue += Number(data.creatorEarning || data.amount || 0);
        });
      } catch (err) {
        console.warn('Error loading subscriptions:', err);
      }

      // 3. Fetch Creator Posts
      let postCount = 0;
      let likesCount = 0;
      let commentsCount = 0;
      let creatorPostsList = [];

      try {
        const postsSnap = await getDocs(query(
          collection(db, 'posts'),
          where('userId', '==', uid)
        ));
        postCount = postsSnap.size;

        postsSnap.forEach(d => {
          const p = { id: d.id, ...d.data() };
          likesCount += Number(p.likes || 0);
          commentsCount += Number(p.comments || 0);
          creatorPostsList.push(p);
        });

        // Sort top posts by likes and engagement
        creatorPostsList.sort((a, b) => {
          const scoreA = Number(a.likes || 0) * 2 + Number(a.comments || 0);
          const scoreB = Number(b.likes || 0) * 2 + Number(b.comments || 0);
          return scoreB - scoreA;
        });
        setTopPosts(creatorPostsList.slice(0, 4));
      } catch (err) {
        console.warn('Error loading creator posts:', err);
      }

      // 4. Fetch Unlocks & Tips
      let unlockRevenue = 0;
      let tipRevenue = 0;
      let rawActivities = [];

      try {
        const [unlocksSnap, tipsSnap] = await Promise.all([
          getDocs(query(collection(db, 'unlocked_content'), where('creatorId', '==', uid))),
          getDocs(query(collection(db, 'tips'), where('toCreatorId', '==', uid)))
        ]);

        unlocksSnap.forEach(d => {
          const u = d.data();
          const earning = Number(u.creatorEarning || (Number(u.price || 0) * 0.8) || 0);
          unlockRevenue += earning;
          rawActivities.push({
            id: d.id,
            type: 'unlock',
            fanId: u.userId,
            amount: earning,
            time: u.unlockedAt || u.createdAt,
            label: 'Unlocked content'
          });
        });

        tipsSnap.forEach(d => {
          const t = d.data();
          const earning = Number(t.creatorEarning || (Number(t.amount || 0) * 0.8) || 0);
          tipRevenue += earning;
          rawActivities.push({
            id: d.id,
            type: 'tip',
            fanId: t.fromUserId || t.fanId,
            amount: earning,
            time: t.createdAt,
            label: 'Sent a tip'
          });
        });
      } catch (err) {
        console.warn('Error loading unlocks and tips:', err);
      }

      // 5. Fetch Calls Revenue & Bookings
      let callsRevenue = 0;
      try {
        const callsSnap = await getDocs(query(
          collection(db, 'call_bookings'),
          where('creatorId', '==', uid),
          where('status', 'in', ['completed', 'accepted', 'confirmed'])
        ));
        callsSnap.forEach(d => {
          const c = d.data();
          const earning = Number(c.creatorEarning || (Number(c.price || 0) * 0.8) || 0);
          callsRevenue += earning;
          rawActivities.push({
            id: d.id,
            type: 'call',
            fanId: c.userId || c.fanId,
            amount: earning,
            time: c.createdAt,
            label: `${c.type === 'voice' ? 'Voice' : 'Video'} call session`
          });
        });
      } catch (err) {
        console.warn('Error loading calls for analytics:', err);
      }

      // Sort activities newest first and resolve fan profiles
      rawActivities.sort((a, b) => {
        const getTime = item => {
          if (!item.time) return 0;
          if (item.time.toDate) return item.time.toDate().getTime();
          if (item.time.seconds) return item.time.seconds * 1000;
          if (item.time instanceof Date) return item.time.getTime();
          return 0;
        };
        return getTime(b) - getTime(a);
      });

      const topActivities = rawActivities.slice(0, 10);
      const enrichedActivities = await Promise.all(
        topActivities.map(async (act) => {
          let fanData = { name: 'Fan', avatar: null };
          if (act.fanId) {
            try {
              const uSnap = await getDoc(doc(db, 'users', act.fanId));
              if (uSnap.exists()) {
                const u = uSnap.data();
                fanData = {
                  name: u.displayName || u.username || 'Fan',
                  avatar: u.profilePicture || u.avatar || null,
                };
              }
            } catch {}
          }
          return {
            ...act,
            fanName: fanData.name,
            fanAvatar: fanData.avatar,
            timeFormatted: formatTimeAgo(act.time),
          };
        })
      );
      setRecentActivities(enrichedActivities);

      // 6. Build 6-Month Historical Revenue Chart Data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const curMonthIdx = new Date().getMonth();
      const trend = [];
      let maxMonthAmt = 1;

      for (let i = 5; i >= 0; i--) {
        const mIdx = (curMonthIdx - i + 12) % 12;
        const name = monthNames[mIdx];
        const val = Number(monthMap[name] || 0);
        if (val > maxMonthAmt) maxMonthAmt = val;
        trend.push({ month: name, amount: val });
      }

      setMonthlyEarnings(trend.map(t => ({
        ...t,
        pct: Math.max(8, Math.round((t.amount / maxMonthAmt) * 100))
      })));

      // Set Final Aggregated Stats
      setStats({
        availableBalance: availBal,
        lifetimeEarnings: lifeBal || (subRevenue + tipRevenue + unlockRevenue + callsRevenue),
        activeSubscribers: activeSubs,
        followers: userProfile?.followers || userProfile?.followersCount || 0,
        totalPosts: postCount,
        totalLikes: likesCount,
        totalComments: commentsCount,
      });

      setRevenueStreams({
        subscriptions: subRevenue,
        tips: tipRevenue,
        unlocks: unlockRevenue,
        calls: callsRevenue,
      });

    } catch (error) {
      console.error('Error loading creator analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.uid, userProfile?.followers, userProfile?.followersCount]);

  useEffect(() => {
    loadCreatorAnalytics();
  }, [loadCreatorAnalytics, range]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCreatorAnalytics();
  };

  const totalStreamSum = useMemo(() => {
    return (
      revenueStreams.subscriptions +
      revenueStreams.tips +
      revenueStreams.unlocks +
      revenueStreams.calls
    ) || 1;
  }, [revenueStreams]);

  if (loading && !refreshing) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        <p className="text-xs text-gray-500 font-medium">Crunching your creator analytics...</p>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'min-h-screen bg-gray-50 pb-20 pt-4 px-4 sm:px-6 max-w-5xl mx-auto'}>
      {/* ── Top Bar (Only if standalone page) ── */}
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-gray-200/80 rounded-xl transition"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                Creator Analytics
              </h1>
              <p className="text-xs text-gray-500">Earnings, Audience & Content Performance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl transition shadow-xs active:scale-95"
              title="Refresh Stats"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-rose-500' : ''}`} />
            </button>

            {/* Range dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRangeMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 transition shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span>{range.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {showRangeMenu && (
                <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[130px]">
                  {RANGES.map(r => (
                    <button
                      key={r.label}
                      onClick={() => { setRange(r); setShowRangeMenu(false); }}
                      className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 font-medium ${range.label === r.label ? 'text-rose-600 font-bold bg-rose-50/50' : 'text-gray-700'}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Embedded Action Bar ── */}
      {embedded && (
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-base font-bold text-gray-900">Performance & Growth</h3>
            <p className="text-xs text-gray-500">Real-time stats across subscriptions, content & calls</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-xs transition active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-rose-500' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      )}

      {/* ── Key Metrics 4-Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Available Balance */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-xs">
          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-xs text-gray-500 font-medium">Available Balance</p>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            {formatCurrency(stats.availableBalance)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {formatCurrency(stats.lifetimeEarnings)} lifetime
          </p>
        </div>

        {/* Active Subscribers */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-xs">
          <div className="w-9 h-9 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center mb-3">
            <Crown className="w-5 h-5" />
          </div>
          <p className="text-xs text-gray-500 font-medium">Active Subscribers</p>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            {stats.activeSubscribers}
          </p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">
            {stats.followers} total followers
          </p>
        </div>

        {/* Total Posts */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-xs">
          <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-xs text-gray-500 font-medium">Content Published</p>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            {stats.totalPosts}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {stats.totalLikes} total likes
          </p>
        </div>

        {/* Engagement Rate / Comments */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-xs">
          <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3">
            <MessageCircle className="w-5 h-5" />
          </div>
          <p className="text-xs text-gray-500 font-medium">Fan Comments</p>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            {stats.totalComments}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Across all media
          </p>
        </div>
      </div>

      {/* ── Revenue Stream Breakdown & Monthly Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Stream Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
          <h4 className="text-sm font-bold text-gray-900 mb-3">Revenue Streams</h4>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-rose-500" /> Subscriptions
                </span>
                <span className="font-bold text-gray-900">{formatCurrency(revenueStreams.subscriptions)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-rose-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((revenueStreams.subscriptions / totalStreamSum) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" /> PPV Unlocks
                </span>
                <span className="font-bold text-gray-900">{formatCurrency(revenueStreams.unlocks)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((revenueStreams.unlocks / totalStreamSum) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-amber-500" /> Tips & Gifts
                </span>
                <span className="font-bold text-gray-900">{formatCurrency(revenueStreams.tips)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((revenueStreams.tips / totalStreamSum) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-blue-500" /> 1-on-1 Calls
                </span>
                <span className="font-bold text-gray-900">{formatCurrency(revenueStreams.calls)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((revenueStreams.calls / totalStreamSum) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 6-Month Historical Revenue Bars */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-gray-900">Earnings Trend (Last 6 Months)</h4>
            <span className="text-[11px] text-gray-400">Monthly Net</span>
          </div>

          <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-2">
            {monthlyEarnings.map((m, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-[10px] font-bold text-gray-600">
                  {m.amount > 0 ? `$${Math.round(m.amount)}` : '$0'}
                </span>
                <div
                  className="w-full max-w-[42px] bg-gradient-to-t from-rose-500 to-pink-400 rounded-t-lg transition-all duration-500 shadow-xs"
                  style={{ height: `${m.pct}%` }}
                />
                <span className="text-xs font-semibold text-gray-500 mt-1">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top Posts & Recent CRM Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Posts */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
          <h4 className="text-sm font-bold text-gray-900 mb-3">Top Performing Content</h4>

          {topPosts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No content published yet.</p>
          ) : (
            <div className="space-y-3">
              {topPosts.map(post => {
                const img = post.images?.[0]?.url || post.images?.[0] || null;
                return (
                  <div key={post.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-lg">
                      {img ? (
                        <img src={typeof img === 'string' ? img : img.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        '📸'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {post.content || 'Media Post'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3 text-rose-500" /> {post.likes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-blue-500" /> {post.comments || 0}
                        </span>
                        {post.price > 0 && (
                          <span className="font-semibold text-emerald-600">
                            ${Number(post.price).toFixed(2)} PPV
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Fan Activity (CRM Feed) */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
          <h4 className="text-sm font-bold text-gray-900 mb-3">Recent Fan Interactions</h4>

          {recentActivities.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No fan activity yet. Promote your profile to start earning.</p>
          ) : (
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {recentActivities.map((act) => (
                <div key={act.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-rose-700">
                      {act.fanAvatar ? (
                        <img src={act.fanAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        act.fanName?.charAt(0)?.toUpperCase() || 'F'
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{act.fanName}</p>
                      <p className="text-[10px] text-gray-500">{act.label} • {act.timeFormatted}</p>
                    </div>
                  </div>

                  <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                    +{formatCurrency(act.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}