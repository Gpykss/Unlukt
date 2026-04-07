// src/pages/Dashboard/Dashboard.jsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Heart, DollarSign, TrendingUp,
  Users, Eye, Upload, Image as ImageIcon,
  BarChart3, Settings, Loader2, Lock, Clock,
  Video, Phone, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query,
  where, getDocs, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import AvailabilityToggle from '../../components/Dashboard/AvailabilityToggle';
import WithdrawModal from '../../components/Dashboard/WithdrawModal';

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const [balance, setBalance]               = useState(null);
  const [stats, setStats]                   = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingStats, setLoadingStats]     = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [topPosts, setTopPosts]             = useState([]);
  const [earningsData, setEarningsData]     = useState([]);
  const [isCreator, setIsCreator]           = useState(false);
  const [checkingCreator, setCheckingCreator] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [upcomingCalls, setUpcomingCalls]   = useState([]);
  const [loadingCalls, setLoadingCalls]     = useState(true);
  // ✅ Fan active calls
  const [activeFanCalls, setActiveFanCalls] = useState([]);
  const [loadingFanCalls, setLoadingFanCalls] = useState(true);

  useEffect(() => { checkIfCreator(); }, [currentUser, userProfile]);

  useEffect(() => {
    if (currentUser) {
      fetchActiveFanCalls(); // ✅ always fetch for fans
    }
  }, [currentUser]);

  useEffect(() => {
    if (isCreator && currentUser) {
      fetchCreatorBalance();
      fetchCreatorStats();
      fetchRecentActivity();
      fetchTopPosts();
      fetchEarningsHistory();
      fetchUpcomingCalls();
    }
  }, [isCreator, currentUser]);

  const checkIfCreator = async () => {
    if (!currentUser) { navigate('/login'); return; }
    try {
      setCheckingCreator(true);
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
        setIsCreator(d.isCreator || d.kycStatus === 'approved' || false);
      } else {
        setIsCreator(false);
      }
    } catch { setIsCreator(false); }
    finally { setCheckingCreator(false); }
  };

  const fetchCreatorBalance = async () => {
    try {
      setLoadingBalance(true);
      const snap = await getDoc(doc(db, 'creator_balances', currentUser.uid));
      if (snap.exists()) {
        const d = snap.data();
        // Combine old pendingBalance + new availableBalance so historical data is not hidden
        const available = (d.availableBalance || 0) + (d.pendingBalance || 0);
        setBalance({ available, total: d.totalEarnings || available });
      } else {
        setBalance({ available: 0, total: 0 });
      }
    } catch { setBalance({ available: 0, total: 0 }); }
    finally { setLoadingBalance(false); }
  };

  const fetchCreatorStats = async () => {
    try {
      setLoadingStats(true);
      const subsSnap = await getDocs(query(
        collection(db, 'subscriptions'),
        where('creatorId', '==', currentUser.uid),
        where('status', '==', 'active')
      ));
      const postsSnap = await getDocs(query(
        collection(db, 'posts'),
        where('userId', '==', currentUser.uid)
      ));
      let totalLikes = 0;
      postsSnap.docs.forEach(d => { totalLikes += d.data().likes || 0; });
      setStats({
        subscribers: subsSnap.size,
        newSubscribers: '+' + Math.floor(subsSnap.size * 0.1),
        totalPosts: postsSnap.size,
        totalLikes,
        totalLikesFormatted: totalLikes >= 1000 ? (totalLikes / 1000).toFixed(1) + 'K' : String(totalLikes),
      });
    } catch {
      setStats({ subscribers: 0, newSubscribers: '+0', totalPosts: 0, totalLikes: 0, totalLikesFormatted: '0' });
    } finally { setLoadingStats(false); }
  };

  const fetchRecentActivity = async () => {
    try {
      // Fetch ALL historical activity across subscriptions, tips, and unlocks
      const [subsSnap, tipsSnap, unlocksSnap] = await Promise.all([
        getDocs(query(collection(db, 'subscriptions'), where('creatorId', '==', currentUser.uid))),
        getDocs(query(collection(db, 'tips'), where('toCreatorId', '==', currentUser.uid))), // correctly uses toCreatorId
        getDocs(query(collection(db, 'unlocked_content'), where('creatorId', '==', currentUser.uid))),
      ]);

      let allData = [];
      subsSnap.docs.forEach(d => allData.push({ type: 'sub', fanId: d.data().userId, ...d.data(), id: d.id }));
      tipsSnap.docs.forEach(d => allData.push({ type: 'tip', fanId: d.data().fromUserId, ...d.data(), id: d.id }));
      unlocksSnap.docs.forEach(d => allData.push({ type: 'unlock', fanId: d.data().userId, ...d.data(), id: d.id }));

      const sorted = allData
        .sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() || a.unlockedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() || b.unlockedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        })
        .slice(0, 15); // show more rows

      const activities = await Promise.all(sorted.map(async (data) => {
        // Fetch correct fan profile per activity type
        let u = {};
        if (data.fanId) {
          const userDoc = await getDoc(doc(db, 'users', data.fanId));
          if (userDoc.exists()) u = userDoc.data();
        }
        
        let action = 'Interaction';
        let amount = 0;
        let timeTs = data.createdAt || data.unlockedAt;
        
        if (data.type === 'sub') {
           action = `${data.durationLabel || 'Monthly'} subscription`;
           amount = data.creatorEarning || data.amount || 0;
        } else if (data.type === 'tip') {
           action = 'Sent a tip';
           amount = data.creatorEarning || (Number(data.amount || 0) * 0.8) || 0;
        } else if (data.type === 'unlock') {
           action = 'Unlocked content';
           amount = data.creatorEarning || (Number(data.price || 0) * 0.8) || 0;
        }

        return {
          id: data.id,
          user: u.displayName || 'Fan',
          action,
          amount: `$${Number(amount).toFixed(2)}`,
          time: formatTimeAgo(timeTs),
          avatar: u.profilePicture || u.avatar || null,
        };
      }));
      setRecentActivity(activities);
    } catch (e) {
      console.error('Activity fetch error:', e);
      setRecentActivity([]);
    }
  };

  const fetchTopPosts = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'posts'),
        where('userId', '==', currentUser.uid)
      ));
      const sorted = snap.docs
        .sort((a, b) => (b.data().likes || 0) - (a.data().likes || 0))
        .slice(0, 3);
      setTopPosts(sorted.map(d => {
        const data = d.data();
        return {
          id: d.id,
          preview: data.images?.[0]?.url || data.images?.[0] || null,
          views: data.views || 0,
          likes: data.likes || 0,
          earnings: `$${((data.likes || 0) * 0.15).toFixed(2)}`,
        };
      }));
    } catch (e) { console.error('Top posts error:', e); setTopPosts([]); }
  };

  const fetchEarningsHistory = async () => {
    try {
      const snap = await getDoc(doc(db, 'creator_balances', currentUser.uid));
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const cur = new Date().getMonth();
      const monthlyEarnings = snap.exists() ? (snap.data().monthlyEarnings || {}) : {};
      const earnings = [];
      for (let i = 4; i >= 0; i--) {
        const idx = (cur - i + 12) % 12;
        const amt = Number(monthlyEarnings[months[idx]] || 0);
        earnings.push({ month: months[idx], amount: parseFloat(amt.toFixed(2)) });
      }
      setEarningsData(earnings);
    } catch { setEarningsData([]); }
  };

  // ✅ Creator: fetch upcoming calls they need to join
  const fetchUpcomingCalls = async () => {
    try {
      setLoadingCalls(true);
      const snap = await getDocs(query(
        collection(db, 'call_bookings'),
        where('creatorId', '==', currentUser.uid),
        where('status', 'in', ['confirmed', 'in_progress'])
      ));

      const now = new Date();
      const calls = await Promise.all(
        snap.docs.map(async (d) => {
          const data = { id: d.id, ...d.data() };
          const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
          // ✅ Expiry = scheduled + call duration (not hardcoded 1hr)
          const durationMs = (data.duration || 30) * 60 * 1000;
          const expiresAt = new Date(scheduled.getTime() + durationMs);
          if (now > expiresAt) return null;

          const userDoc = await getDoc(doc(db, 'users', data.userId));
          const fan = userDoc.exists() ? userDoc.data() : {};

          const minsUntil = Math.floor((scheduled - now) / 60000);
          const canJoin = minsUntil <= 5;

          return {
            id: data.id,
            type: data.type,
            scheduled,
            duration: data.duration,
            price: data.price,
            status: data.status,
            canJoin,
            minsUntil,
            fan: {
              name: fan.displayName || 'Fan',
              username: fan.username || '',
              avatar: fan.profilePicture || fan.avatar || null,
            },
          };
        })
      );

      const valid = calls.filter(Boolean).sort((a, b) => a.scheduled - b.scheduled);
      setUpcomingCalls(valid);
    } catch (e) {
      console.error('Upcoming calls error:', e);
      setUpcomingCalls([]);
    } finally {
      setLoadingCalls(false);
    }
  };

  // ✅ Fan: fetch active calls they booked that haven't expired yet
  const fetchActiveFanCalls = async () => {
    try {
      setLoadingFanCalls(true);
      const snap = await getDocs(query(
        collection(db, 'call_bookings'),
        where('userId', '==', currentUser.uid),
        where('status', 'in', ['confirmed', 'in_progress'])
      ));

      const now = new Date();
      const calls = await Promise.all(
        snap.docs.map(async (d) => {
          const data = { id: d.id, ...d.data() };
          const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
          // ✅ Expiry = scheduled + call duration
          const durationMs = (data.duration || 30) * 60 * 1000;
          const expiresAt = new Date(scheduled.getTime() + durationMs);
          if (now > expiresAt) return null;

          const creatorDoc = await getDoc(doc(db, 'users', data.creatorId));
          const creator = creatorDoc.exists() ? creatorDoc.data() : {};

          const minsUntil = Math.floor((scheduled - now) / 60000);
          const canJoin = minsUntil <= 5;

          return {
            id: data.id,
            type: data.type,
            scheduled,
            duration: data.duration,
            price: data.price,
            status: data.status,
            canJoin,
            minsUntil,
            expiresAt,
            creator: {
              name: creator.displayName || 'Creator',
              username: creator.username || '',
              avatar: creator.profilePicture || creator.avatar || null,
            },
          };
        })
      );

      const valid = calls.filter(Boolean).sort((a, b) => a.scheduled - b.scheduled);
      setActiveFanCalls(valid);
    } catch (e) {
      console.error('Fan calls error:', e);
      setActiveFanCalls([]);
    } finally {
      setLoadingFanCalls(false);
    }
  };

  const formatTimeAgo = (ts) => {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const s = Math.floor((new Date() - date) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'min ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  const formatScheduled = (date) => {
    const now = new Date();
    const diff = Math.floor((date - now) / 60000);
    if (diff < 0) return 'Now';
    if (diff < 60) return `In ${diff} min`;
    if (diff < 1440) return `In ${Math.floor(diff / 60)}h ${diff % 60}m`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (checkingCreator) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );

  // ✅ Non-creators go to /my-calls
  if (!isCreator) {
    navigate('/my-calls');
    return null;
  }

  if (false) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">

        {/* Active calls for fan */}
        {!loadingFanCalls && activeFanCalls.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Phone className="w-5 h-5 text-rose-500" />
              Your Active Calls
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFanCalls.length}
              </span>
            </h2>
            <div className="space-y-3">
              {activeFanCalls.map((call) => (
                <div key={call.id}
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                    call.canJoin ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {call.creator.avatar
                        ? <img src={call.creator.avatar} alt="" className="w-full h-full object-cover" />
                        : <span className="text-base">👤</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        {call.type === 'video'
                          ? <Video className="w-3.5 h-3.5 text-rose-500" />
                          : <Phone className="w-3.5 h-3.5 text-purple-500" />}
                        <p className="font-bold text-gray-900 text-sm truncate">{call.creator.name}</p>
                      </div>
                      <p className="text-xs text-gray-500">{call.duration} min · ${call.price?.toFixed(2)}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${call.canJoin ? 'text-green-600' : 'text-gray-500'}`}>
                        {call.canJoin ? '🟢 Ready to join' : `⏰ ${formatScheduled(call.scheduled)}`}
                      </p>
                    </div>
                  </div>
                  {call.canJoin ? (
                    <button
                      onClick={() => navigate(`/waiting-room/${call.id}`)}
                      className="flex-shrink-0 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition flex items-center gap-1">
                      {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                      Join
                    </button>
                  ) : (
                    <div className="flex-shrink-0 px-3 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold text-center">
                      <Clock className="w-4 h-4 mx-auto mb-0.5" />
                      {call.minsUntil > 5 ? `${call.minsUntil - 5}m` : 'Soon'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Dashboard</h2>
          <p className="text-gray-600 mb-6">Complete creator verification to access analytics and earnings.</p>
          <div className="space-y-3">
            <button onClick={() => navigate('/become-creator')}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-semibold transition">
              Become a Creator
            </button>
            <button onClick={() => navigate('/feed')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold transition">
              Back to Feed
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const maxEarning = Math.max(...earningsData.map(d => d.amount), 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Desktop back */}
      <div className="hidden lg:block max-w-7xl mx-auto px-6 pt-6">
        <button onClick={() => navigate('/feed')}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Back to Feed</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

        {/* ✅ Fan's active booked calls — shown at top for creators too if they have any */}
        {!loadingFanCalls && activeFanCalls.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-500" />
              Your Booked Calls
              <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFanCalls.length}
              </span>
            </h2>
            {activeFanCalls.map((call) => (
              <div key={call.id}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
                  call.canJoin ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-gray-200'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {call.creator.avatar
                      ? <img src={call.creator.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">👤</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {call.type === 'video'
                        ? <Video className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        : <Phone className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                      <p className="font-bold text-gray-900 text-sm truncate">{call.creator.name}</p>
                    </div>
                    <p className="text-xs text-gray-500">{call.duration} min · ${call.price?.toFixed(2)}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${call.canJoin ? 'text-blue-600' : 'text-gray-500'}`}>
                      {call.canJoin ? '🟢 Ready to join' : `⏰ ${formatScheduled(call.scheduled)}`}
                    </p>
                  </div>
                </div>
                {call.canJoin ? (
                  <button
                    onClick={() => navigate(`/waiting-room/${call.id}`)}
                    className="flex-shrink-0 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition shadow-md flex items-center gap-2">
                    {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    Rejoin
                  </button>
                ) : (
                  <div className="flex-shrink-0 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold text-center">
                    <Clock className="w-4 h-4 mx-auto mb-0.5" />
                    {call.minsUntil > 5 ? `${call.minsUntil - 5}m` : 'Soon'}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Creator Upcoming Calls Banner ── */}
        {!loadingCalls && upcomingCalls.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              Upcoming Calls
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {upcomingCalls.length}
              </span>
            </h2>
            {upcomingCalls.map((call) => (
              <div key={call.id}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
                  call.canJoin ? 'bg-green-50 border-green-300 shadow-sm shadow-green-100' : 'bg-white border-gray-200'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {call.fan.avatar
                      ? <img src={call.fan.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">👤</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {call.type === 'video'
                        ? <Video className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        : <Phone className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                      <p className="font-bold text-gray-900 text-sm truncate">{call.fan.name}</p>
                    </div>
                    <p className="text-xs text-gray-500">{call.duration} min · ${call.price?.toFixed(2)}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${call.canJoin ? 'text-green-600' : 'text-gray-500'}`}>
                      {call.canJoin ? '🟢 Ready to join' : `⏰ ${formatScheduled(call.scheduled)}`}
                    </p>
                  </div>
                </div>
                {call.canJoin ? (
                  <button
                    onClick={() => navigate(`/waiting-room/${call.id}`)}
                    className="flex-shrink-0 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition shadow-md flex items-center gap-2">
                    {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    Join Now
                  </button>
                ) : (
                  <div className="flex-shrink-0 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold text-center">
                    <Clock className="w-4 h-4 mx-auto mb-0.5" />
                    {call.minsUntil > 5 ? `${call.minsUntil - 5}m` : 'Soon'}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 sm:p-3 bg-rose-50 rounded-xl">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />
              </div>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Available Balance</p>
            {loadingBalance
              ? <div className="h-8 bg-gray-200 rounded animate-pulse" />
              : <p className="text-2xl sm:text-3xl font-bold text-gray-900">${balance?.available.toFixed(2)}</p>}
            <p className="text-gray-500 text-xs mt-1">
              ${balance?.total.toFixed(2)} lifetime earnings
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 sm:p-3 bg-blue-50 rounded-xl">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
              </div>
              {!loadingStats && <span className="text-green-500 text-xs font-semibold">{stats?.newSubscribers}</span>}
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Subscribers</p>
            {loadingStats
              ? <div className="h-8 bg-gray-200 rounded animate-pulse" />
              : <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.subscribers}</p>}
            <p className="text-gray-500 text-xs mt-1">Active</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 sm:p-3 bg-purple-50 rounded-xl">
                <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500" />
              </div>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Total Posts</p>
            {loadingStats
              ? <div className="h-8 bg-gray-200 rounded animate-pulse" />
              : <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.totalPosts}</p>}
            <p className="text-gray-500 text-xs mt-1">Published</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 sm:p-3 bg-pink-50 rounded-xl">
                <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-pink-500" />
              </div>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Total Likes</p>
            {loadingStats
              ? <div className="h-8 bg-gray-200 rounded animate-pulse" />
              : <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.totalLikesFormatted}</p>}
            <p className="text-gray-500 text-xs mt-1">Across all posts</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Revenue Overview</h2>
                <span className="text-xs text-gray-400">Last 5 months</span>
              </div>
              <div className="space-y-3">
                {earningsData.slice().reverse().map((data, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border border-gray-100 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                    <span className="font-semibold text-gray-600">{data.month}</span>
                    <span className="font-bold text-gray-900">${data.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {earningsData.every(d => d.amount === 0) && (
                <p className="text-center text-sm text-gray-400 mt-2">No earnings data yet</p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Top Posts</h2>
              {topPosts.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No posts yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topPosts.map(post => (
                    <div key={post.id} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                      <div className="w-14 h-14 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl">
                        {post.preview
                          ? <img src={typeof post.preview === 'string' && post.preview.startsWith('http') ? post.preview : post.preview?.url || post.preview} alt="" className="w-full h-full object-cover" />
                          : '📸'}
                      </div>
                      <div className="flex-1 flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{post.views}</span>
                        <span className="flex items-center gap-1"><Heart className="w-4 h-4" />{post.likes}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-rose-500">{post.earnings}</p>
                        <p className="text-xs text-gray-500">Est. earned</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map(a => (
                    <div key={a.id} className="flex items-center space-x-3 pb-3 border-b border-gray-100 last:border-0">
                      <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
                        {a.avatar ? <img src={a.avatar} className="w-full h-full object-cover" /> : '👤'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{a.user}</p>
                        <p className="text-xs text-gray-500">{a.action}</p>
                        <p className="text-xs text-gray-400">{a.time}</p>
                      </div>
                      <p className="text-sm font-bold text-green-600 flex-shrink-0">{a.amount}</p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/analytics')}
                className="w-full mt-3 text-rose-500 hover:text-rose-600 font-semibold text-sm">
                View All Activity →
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                <button onClick={() => navigate('/new-post')}
                  className="w-full flex items-center space-x-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                  <div className="p-2 bg-rose-100 rounded-lg"><Upload className="w-5 h-5 text-rose-500" /></div>
                  <span className="font-semibold text-gray-900">Upload Content</span>
                </button>
                <button onClick={() => navigate('/analytics')}
                  className="w-full flex items-center space-x-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                  <div className="p-2 bg-blue-100 rounded-lg"><BarChart3 className="w-5 h-5 text-blue-500" /></div>
                  <span className="font-semibold text-gray-900">View Analytics</span>
                </button>
                <button onClick={() => setShowWithdrawModal(true)}
                  className="w-full flex items-center space-x-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                  <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="w-5 h-5 text-green-500" /></div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900">Withdraw Funds</p>
                    {!loadingBalance && balance?.available > 0 && (
                      <p className="text-xs text-green-600">${balance.available.toFixed(2)} available</p>
                    )}
                  </div>
                </button>
                <button onClick={() => navigate('/settings')}
                  className="w-full flex items-center space-x-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                  <div className="p-2 bg-gray-200 rounded-lg"><Settings className="w-5 h-5 text-gray-600" /></div>
                  <span className="font-semibold text-gray-900">Settings & Discounts</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => { setShowWithdrawModal(false); fetchCreatorBalance(); }}
      />
    </div>
  );
}