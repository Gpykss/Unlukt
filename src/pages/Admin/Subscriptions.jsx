// src/pages/Admin/Subscriptions.jsx - Platform Subscriptions & Tier Management
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, ArrowLeft, Search, Filter, Calendar,
  User, DollarSign, CheckCircle2, Clock, XCircle,
  ExternalLink, Sparkles, TrendingUp, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function SubscriptionsManagement() {
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all'); // all, supporter, vip, superfan
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, expired

  const [stats, setStats] = useState({
    activeCount: 0,
    totalCount: 0,
    totalVolume: 0,
    supporterCount: 0,
    vipCount: 0,
    superfanCount: 0,
  });

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const now = new Date();

      // Fetch primary subscriptions + subscription transactions in parallel
      const [subsSnap, txSnap] = await Promise.allSettled([
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'subscription_transactions')),
      ]);

      const mergedMap = new Map();

      // Helper to parse dates safely
      const parseDate = (val) => {
        if (!val) return null;
        if (typeof val.toDate === 'function') return val.toDate();
        if (val.seconds) return new Date(val.seconds * 1000);
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      // 1. Process subscriptions collection
      if (subsSnap.status === 'fulfilled' && subsSnap.value) {
        subsSnap.value.docs.forEach((d) => {
          const data = d.data();
          const userId = data.userId || data.fanId;
          const creatorId = data.creatorId;
          const key = `${userId}_${creatorId}` || d.id;
          const exp = parseDate(data.expiresAt);
          const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
          const isActive = !isExplicitInactive && (!exp || exp > now);

          mergedMap.set(key, {
            id: d.id,
            source: 'subscriptions',
            userId,
            creatorId,
            tier: data.tier || 'supporter',
            amount: Number(data.amount || data.monthlyPrice || 0),
            duration: data.duration || 1,
            durationLabel: data.durationLabel || 'Monthly',
            status: data.status || (isActive ? 'active' : 'expired'),
            isActive,
            expiresAtDate: exp,
            createdAtDate: parseDate(data.createdAt || data.startedAt),
            updatedAtDate: parseDate(data.updatedAt),
            paymentType: data.paymentType || 'crypto',
            raw: data,
          });
        });
      }

      // 2. Process subscription_transactions collection (catches ledger transactions)
      if (txSnap.status === 'fulfilled' && txSnap.value) {
        txSnap.value.docs.forEach((d) => {
          const data = d.data();
          const userId = data.userId || data.fanId;
          const creatorId = data.creatorId;
          const key = `${userId}_${creatorId}` || d.id;

          if (!mergedMap.has(key)) {
            const exp = parseDate(data.expiresAt);
            const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
            const isActive = !isExplicitInactive && (!exp || exp > now);

            mergedMap.set(key, {
              id: d.id,
              source: 'subscription_transactions',
              userId,
              creatorId,
              tier: data.tier || 'supporter',
              amount: Number(data.amount || data.monthlyPrice || 0),
              duration: data.duration || 1,
              durationLabel: data.durationLabel || 'Monthly',
              status: data.status || (isActive ? 'active' : 'expired'),
              isActive,
              expiresAtDate: exp,
              createdAtDate: parseDate(data.createdAt || data.timestamp),
              updatedAtDate: parseDate(data.updatedAt || data.timestamp),
              paymentType: data.paymentType || 'crypto',
              raw: data,
            });
          }
        });
      }

      const rawList = Array.from(mergedMap.values());

      let activeCount = 0;
      let totalVolume = 0;
      let supporterCount = 0;
      let vipCount = 0;
      let superfanCount = 0;

      rawList.forEach((sub) => {
        if (sub.isActive) {
          activeCount++;
          totalVolume += sub.amount;
          const t = (sub.tier || 'supporter').toLowerCase();
          if (t === 'superfan') superfanCount++;
          else if (t === 'vip') vipCount++;
          else supporterCount++;
        }
      });

      setStats({
        activeCount,
        totalCount: rawList.length,
        totalVolume,
        supporterCount,
        vipCount,
        superfanCount,
      });

      // Enrich with fan and creator details
      const userCache = {};
      const getUser = async (uid) => {
        if (!uid) return null;
        if (userCache[uid]) return userCache[uid];
        try {
          const uDoc = await getDoc(doc(db, 'users', uid));
          if (uDoc.exists()) {
            userCache[uid] = { id: uid, ...uDoc.data() };
            return userCache[uid];
          }
        } catch (e) {}
        userCache[uid] = { id: uid, displayName: uid.slice(0, 8), username: 'user' };
        return userCache[uid];
      };

      const enriched = await Promise.all(
        rawList.map(async (sub) => {
          const [fan, creator] = await Promise.all([
            getUser(sub.userId),
            getUser(sub.creatorId),
          ]);
          return {
            ...sub,
            fanUser: fan,
            creatorUser: creator,
          };
        })
      );

      // Sort by newest first
      enriched.sort((a, b) => {
        const timeA = a.updatedAtDate?.getTime() || a.createdAtDate?.getTime() || 0;
        const timeB = b.updatedAtDate?.getTime() || b.createdAtDate?.getTime() || 0;
        return timeB - timeA;
      });

      setSubscriptions(enriched);
    } catch (err) {
      console.error('Error loading subscriptions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSubscriptions();
  };

  // Filtered List
  const filteredSubscriptions = subscriptions.filter((sub) => {
    // Status filter
    if (statusFilter === 'active' && !sub.isActive) return false;
    if (statusFilter === 'expired' && sub.isActive) return false;

    // Tier filter
    const subTier = (sub.tier || 'supporter').toLowerCase();
    if (tierFilter !== 'all' && subTier !== tierFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const fanName = (sub.fanUser?.displayName || sub.fanUser?.name || '').toLowerCase();
      const fanUsername = (sub.fanUser?.username || '').toLowerCase();
      const creatorName = (sub.creatorUser?.displayName || sub.creatorUser?.name || '').toLowerCase();
      const creatorUsername = (sub.creatorUser?.username || '').toLowerCase();
      return (
        fanName.includes(q) ||
        fanUsername.includes(q) ||
        creatorName.includes(q) ||
        creatorUsername.includes(q)
      );
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back and Header */}
        <button
          onClick={() => navigate('/admin')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Admin Dashboard</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                <Crown className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Subscriptions & Member Tiers
              </h1>
            </div>
            <p className="text-gray-500 text-sm">
              Live tracking of fan tier memberships, recurring volume, and creator subscriber counts.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs col-span-2 sm:col-span-1"
          >
            <p className="text-xs text-gray-500 font-medium">Active Subscribers</p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-gray-900">{stats.activeCount}</span>
              <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{stats.totalCount} all-time subs</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs col-span-2 sm:col-span-1"
          >
            <p className="text-xs text-gray-500 font-medium">Recurring Monthly Volume</p>
            <p className="text-2xl font-bold text-emerald-600 mt-2">
              ${stats.totalVolume.toFixed(2)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Platform share ~${(stats.totalVolume * 0.20).toFixed(2)}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-emerald-100 p-5 shadow-2xs bg-emerald-50/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-emerald-800 font-bold">🌱 Supporter</p>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">Tier 1</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.supporterCount}</p>
            <p className="text-[11px] text-gray-500 mt-1">Base community tier</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-purple-100 p-5 shadow-2xs bg-purple-50/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-purple-800 font-bold">⭐ VIP</p>
              <span className="text-xs bg-purple-100 text-purple-800 font-semibold px-1.5 py-0.5 rounded">Tier 2</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.vipCount}</p>
            <p className="text-[11px] text-gray-500 mt-1">Exclusive & discounts</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-amber-100 p-5 shadow-2xs bg-amber-50/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-800 font-bold">👑 Superfan</p>
              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">Tier 3</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.superfanCount}</p>
            <p className="text-[11px] text-gray-500 mt-1">High-value supporters</p>
          </motion.div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-2xs">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by fan or creator..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
              <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'active' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Active ({stats.activeCount})
                </button>
                <button
                  onClick={() => setStatusFilter('expired')}
                  className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'expired' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Expired
                </button>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  All ({stats.totalCount})
                </button>
              </div>

              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:border-rose-500"
              >
                <option value="all">All Tiers</option>
                <option value="supporter">🌱 Supporter</option>
                <option value="vip">⭐ VIP</option>
                <option value="superfan">👑 Superfan</option>
              </select>
            </div>
          </div>
        </div>

        {/* Subscriptions Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Fan / Subscriber</th>
                  <th className="py-3.5 px-4 sm:px-6">Creator</th>
                  <th className="py-3.5 px-4 sm:px-6">Tier Badge</th>
                  <th className="py-3.5 px-4 sm:px-6">Duration & Amount</th>
                  <th className="py-3.5 px-4 sm:px-6">Status & Expiry</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-400">
                      <div className="flex items-center justify-center space-x-2">
                        <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        <span>Loading subscriptions...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-400">
                      No subscriptions match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((sub) => {
                    const tierName = (sub.tier || 'supporter').toLowerCase();
                    const fanDisplayName = sub.fanUser?.displayName || sub.fanUser?.name || 'Fan';
                    const fanUsername = sub.fanUser?.username || sub.userId?.slice(0, 8);
                    const creatorDisplayName = sub.creatorUser?.displayName || sub.creatorUser?.name || 'Creator';
                    const creatorUsername = sub.creatorUser?.username || sub.creatorId?.slice(0, 8);

                    return (
                      <tr key={sub.id} className="hover:bg-gray-50/60 transition">
                        {/* Fan */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700 overflow-hidden flex-shrink-0">
                              {sub.fanUser?.avatar?.startsWith('http') ? (
                                <img src={sub.fanUser.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span>{sub.fanUser?.avatar || '👤'}</span>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{fanDisplayName}</p>
                              <p className="text-xs text-gray-400">@{fanUsername}</p>
                            </div>
                          </div>
                        </td>

                        {/* Creator */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center font-bold text-rose-600 overflow-hidden flex-shrink-0">
                              {sub.creatorUser?.avatar?.startsWith('http') ? (
                                <img src={sub.creatorUser.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span>{sub.creatorUser?.avatar || '⭐'}</span>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{creatorDisplayName}</p>
                              <p className="text-xs text-gray-400">@{creatorUsername}</p>
                            </div>
                          </div>
                        </td>

                        {/* Tier */}
                        <td className="py-4 px-4 sm:px-6">
                          {tierName === 'superfan' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              👑 Superfan
                            </span>
                          ) : tierName === 'vip' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                              ⭐ VIP
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              🌱 Supporter
                            </span>
                          )}
                        </td>

                        {/* Duration & Amount */}
                        <td className="py-4 px-4 sm:px-6">
                          <p className="font-bold text-gray-900">
                            ${Number(sub.amount || sub.monthlyPrice || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {sub.durationLabel || sub.duration || 'Monthly'}
                          </p>
                        </td>

                        {/* Status & Expiry */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${sub.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                            <span className={`text-xs font-bold ${sub.isActive ? 'text-emerald-700' : 'text-gray-500'}`}>
                              {sub.isActive ? 'Active' : 'Expired'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {sub.expiresAtDate
                              ? `Expires ${sub.expiresAtDate.toLocaleDateString()}`
                              : 'No expiry set'}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 sm:px-6 text-right">
                          <button
                            onClick={() => navigate(`/creator/${creatorUsername}`)}
                            className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="View Creator Profile"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
