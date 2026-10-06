// src/pages/Admin/Admin.jsx - Unified Admin Command Center (Original Brand Palette)
import React, { useState, useEffect, Suspense, lazy, Component } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Users, FileCheck, DollarSign, TrendingUp,
  AlertCircle, CheckCircle, Clock, ArrowRight, Wallet,
  Settings, Award, Crown, RefreshCw, BarChart3, ChevronRight,
  ExternalLink, Layers, Check, X, Eye
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, getCountFromServer,
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { withContact } from '../../utils/adminContact';

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Tab module error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-12 text-center bg-white rounded-2xl border border-gray-200 shadow-2xs">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">Module Temporarily Unavailable</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
            {this.state.error?.message || 'An error occurred while displaying this section.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-2xs"
          >
            Retry Section
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy load sub-components for instant switching without full page reload
const SubscriptionsManagement = lazy(() => import('./Subscriptions'));
const KYCManagement            = lazy(() => import('./KYCManagement'));
const CryptoPayments           = lazy(() => import('./CryptoPayments'));
const NGNPayments              = lazy(() => import('./NGNPayments'));
const UserManagement           = lazy(() => import('./UserManagement'));
const AdminPayouts             = lazy(() => import('./Payouts'));
const PlatformSettings         = lazy(() => import('./PlatformSettings'));
const AdminAnalytics           = lazy(() => import('./Analytics'));
const Ambassadors              = lazy(() => import('./Ambassadors'));
const AdAssetManagement        = lazy(() => import('./AdAssetManagement'));

export default function Admin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  // Fast In-Sync Unified Stats State
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCreators: 0,
    pendingKYC: 0,
    approvedKYC: 0,
    rejectedKYC: 0,
    grossRevenue: 0,
    cryptoRevenue: 0,
    ngnRevenue: 0,
    platformRevenue: 0,
    creatorRevenue: 0,
    pendingPayments: 0,
    pendingCrypto: 0,
    pendingNgn: 0,
    activeSubscriptions: 0,
    totalSubscriptions: 0,
    subsRevenue: 0,
    supporterCount: 0,
    vipCount: 0,
    superfanCount: 0,
    pendingPayouts: 0,
    tipsRevenue: 0,
    ppvRevenue: 0,
    callsRevenue: 0,
  });

  // Actionable queues for instant resolution from Overview
  const [pendingKYCList, setPendingKYCList] = useState([]);
  const [pendingNGNList, setPendingNGNList] = useState([]);
  const [pendingPayoutsList, setPendingPayoutsList] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    loadAllStats();
  }, []);

  const loadAllStats = async () => {
    try {
      setRefreshing(true);
      const now = new Date();

      // Parallel single-pass fetch for ultra-fast load (< 800ms)
      const [
        usersSnap,
        creatorsSnap,
        pendingKycSnap,
        cryptoFinishedSnap,
        ngnApprovedSnap,
        cryptoPendingSnap,
        ngnPendingSnap,
        subsSnap,
        subsTxSnap,
        payoutsSnap,
        payoutRequestsSnap,
        tipsSnap,
        ppvSnap,
        callsSnap
      ] = await Promise.allSettled([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(query(collection(db, 'users'), where('isCreator', '==', true))),
        getDocs(query(collection(db, 'users'), where('kycStatus', '==', 'pending'))),
        getDocs(query(collection(db, 'crypto_payments'), where('status', 'in', ['finished', 'completed', 'confirmed', 'verified']))),
        getDocs(query(collection(db, 'ngn_payments'), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, 'crypto_payments'), where('status', 'in', ['waiting', 'confirming', 'pending_review']))),
        getDocs(query(collection(db, 'ngn_payments'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'subscription_transactions')),
        getDocs(query(collection(db, 'payouts'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'payout_requests'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'tips')),
        getDocs(collection(db, 'ppv_unlocks')),
        getDocs(query(collection(db, 'video_calls'), where('status', '==', 'completed'))),
      ]);

      // 1. Users & Creators
      const totalUsers = usersSnap.status === 'fulfilled' ? usersSnap.value.data().count : 0;
      const totalCreators = creatorsSnap.status === 'fulfilled' ? creatorsSnap.value.data().count : 0;

      // 2. KYC applications
      let pendingKYC = 0;
      const kycList = [];
      if (pendingKycSnap.status === 'fulfilled' && pendingKycSnap.value) {
        pendingKYC = pendingKycSnap.value.size;
        pendingKycSnap.value.docs.slice(0, 5).forEach(d => {
          kycList.push({ id: d.id, ...d.data() });
        });
      }
      setPendingKYCList(await withContact(kycList));

      // 3. Gross Revenue (Crypto + NGN)
      let cryptoRevenue = 0;
      if (cryptoFinishedSnap.status === 'fulfilled' && cryptoFinishedSnap.value) {
        cryptoFinishedSnap.value.forEach(d => {
          cryptoRevenue += Number(d.data().amount || 0);
        });
      }

      let ngnRevenue = 0;
      if (ngnApprovedSnap.status === 'fulfilled' && ngnApprovedSnap.value) {
        ngnApprovedSnap.value.forEach(d => {
          ngnRevenue += Number(d.data().amountUSD || 0);
        });
      }

      const grossRevenue = cryptoRevenue + ngnRevenue;
      const platformRevenue = grossRevenue * 0.20;
      const creatorRevenue = grossRevenue * 0.80;

      // 4. Pending Payments
      const pendingCrypto = cryptoPendingSnap.status === 'fulfilled' ? cryptoPendingSnap.value.data().count : 0;
      let pendingNgn = 0;
      const ngnList = [];
      if (ngnPendingSnap.status === 'fulfilled' && ngnPendingSnap.value) {
        pendingNgn = ngnPendingSnap.value.size;
        ngnPendingSnap.value.docs.slice(0, 5).forEach(d => {
          ngnList.push({ id: d.id, ...d.data() });
        });
      }
      setPendingNGNList(ngnList);
      const pendingPayments = pendingCrypto + pendingNgn;

      // 5. Subscriptions In-Sync (combines subscriptions + subscription_transactions)
      const mergedSubs = new Map();
      const parseDate = (val) => {
        if (!val) return null;
        if (typeof val.toDate === 'function') return val.toDate();
        if (val.seconds) return new Date(val.seconds * 1000);
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      if (subsSnap.status === 'fulfilled' && subsSnap.value) {
        subsSnap.value.docs.forEach(d => {
          const data = d.data();
          const userId = data.userId || data.fanId;
          const creatorId = data.creatorId;
          const key = `${userId}_${creatorId}` || d.id;
          const exp = parseDate(data.expiresAt);
          const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
          const isActive = !isExplicitInactive && (!exp || exp > now);

          mergedSubs.set(key, {
            ...data,
            isActive,
            amount: Number(data.amount || data.monthlyPrice || 0),
            tier: (data.tier || 'supporter').toLowerCase(),
          });
        });
      }

      if (subsTxSnap.status === 'fulfilled' && subsTxSnap.value) {
        subsTxSnap.value.docs.forEach(d => {
          const data = d.data();
          const userId = data.userId || data.fanId;
          const creatorId = data.creatorId;
          const key = `${userId}_${creatorId}` || d.id;
          if (!mergedSubs.has(key)) {
            const exp = parseDate(data.expiresAt);
            const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
            const isActive = !isExplicitInactive && (!exp || exp > now);

            mergedSubs.set(key, {
              ...data,
              isActive,
              amount: Number(data.amount || data.monthlyPrice || 0),
              tier: (data.tier || 'supporter').toLowerCase(),
            });
          }
        });
      }

      let activeSubs = 0;
      let subsRevenue = 0;
      let supporterCount = 0;
      let vipCount = 0;
      let superfanCount = 0;

      mergedSubs.forEach(sub => {
        if (sub.isActive) {
          activeSubs++;
          subsRevenue += sub.amount;
          if (sub.tier === 'superfan') superfanCount++;
          else if (sub.tier === 'vip') vipCount++;
          else supporterCount++;
        }
      });

      // 6. Subcategory revenues
      let tipsRevenue = 0;
      if (tipsSnap.status === 'fulfilled' && tipsSnap.value) {
        tipsSnap.value.forEach(d => { tipsRevenue += Number(d.data().amount || 0); });
      }

      let ppvRevenue = 0;
      if (ppvSnap.status === 'fulfilled' && ppvSnap.value) {
        ppvSnap.value.forEach(d => { ppvRevenue += Number(d.data().amount || 0); });
      }

      let callsRevenue = 0;
      if (callsSnap.status === 'fulfilled' && callsSnap.value) {
        callsSnap.value.forEach(d => { callsRevenue += Number(d.data().price || 0); });
      }

      // 7. Payout Requests (combining payouts + payout_requests)
      const pList = [];
      const seenPayoutIds = new Set();
      if (payoutRequestsSnap.status === 'fulfilled' && payoutRequestsSnap.value) {
        payoutRequestsSnap.value.forEach(d => {
          seenPayoutIds.add(d.id);
          pList.push({ id: d.id, ...d.data(), source: 'payout_requests' });
        });
      }
      if (payoutsSnap.status === 'fulfilled' && payoutsSnap.value) {
        payoutsSnap.value.forEach(d => {
          if (!seenPayoutIds.has(d.id)) {
            pList.push({ id: d.id, ...d.data(), source: 'payouts' });
          }
        });
      }
      setPendingPayoutsList(pList);
      const pendingPayouts = pList.length;

      setStats({
        totalUsers,
        totalCreators,
        pendingKYC,
        approvedKYC: 0,
        rejectedKYC: 0,
        grossRevenue,
        cryptoRevenue,
        ngnRevenue,
        platformRevenue,
        creatorRevenue,
        pendingPayments,
        pendingCrypto,
        pendingNgn,
        activeSubscriptions: activeSubs,
        totalSubscriptions: mergedSubs.size,
        subsRevenue,
        supporterCount,
        vipCount,
        superfanCount,
        pendingPayouts,
        tipsRevenue,
        ppvRevenue,
        callsRevenue,
      });

      setLastSynced(new Date());
    } catch (err) {
      console.error('Error loading admin command center stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Quick 1-click KYC Approve from Overview
  const handleQuickApproveKYC = async (userId) => {
    if (!window.confirm('Approve creator KYC for this user?')) return;
    setActionLoadingId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        kycStatus: 'approved',
        isCreator: true,
        kycApprovedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setPendingKYCList(prev => prev.filter(u => u.id !== userId));
      setStats(prev => ({ ...prev, pendingKYC: Math.max(0, prev.pendingKYC - 1), totalCreators: prev.totalCreators + 1 }));
    } catch (err) {
      alert('Error approving KYC: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Quick 1-click KYC Reject from Overview
  const handleQuickRejectKYC = async (userId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason === null) return;
    setActionLoadingId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        kycStatus: 'rejected',
        kycRejectionReason: reason || 'Application details did not meet requirements.',
        updatedAt: serverTimestamp(),
      });
      setPendingKYCList(prev => prev.filter(u => u.id !== userId));
      setStats(prev => ({ ...prev, pendingKYC: Math.max(0, prev.pendingKYC - 1) }));
    } catch (err) {
      alert('Error rejecting KYC: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTabChange = (tabKey) => {
    if (tabKey === 'overview') {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ tab: tabKey });
    }
  };

  // Tab definitions (matching original brand styling)
  const TABS = [
    { key: 'overview',        label: 'Dashboard Overview', icon: BarChart3 },
    { key: 'subscriptions',   label: 'Subscriptions',      icon: Crown,      badge: stats.activeSubscriptions, badgeColor: 'bg-amber-100 text-amber-800' },
    { key: 'kyc',             label: 'KYC Queue',          icon: FileCheck,  badge: stats.pendingKYC,          badgeColor: 'bg-rose-100 text-rose-800' },
    { key: 'crypto-payments', label: 'Crypto USDT',        icon: Wallet,     badge: stats.pendingCrypto,       badgeColor: 'bg-yellow-100 text-yellow-800' },
    { key: 'ngn-payments',    label: 'NGN Bank',           icon: DollarSign, badge: stats.pendingNgn,          badgeColor: 'bg-emerald-100 text-emerald-800' },
    { key: 'users',           label: 'Users & Roles',      icon: Users },
    { key: 'payouts',         label: 'Payouts',            icon: DollarSign, badge: stats.pendingPayouts,      badgeColor: 'bg-teal-100 text-teal-800' },
    { key: 'settings',        label: 'Platform Settings',  icon: Settings },
    { key: 'analytics',       label: 'Deep Analytics',     icon: TrendingUp },
    { key: 'ambassadors',     label: 'Ambassadors',        icon: Award },
    { key: 'ad-assets',       label: 'Ad Assets',          icon: Layers },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ═════════════════════════════════════════════════════════════════
            HEADER (ORIGINAL BRAND STYLE: ROSE GRADIENT + CLEAN WHITE)
           ═════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Manage platform operations, creator verification, ledger financials, and subscriptions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {lastSynced && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}

            <button
              onClick={loadAllStats}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl border border-gray-200 shadow-2xs transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-rose-500' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => navigate('/feed')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-xl border border-rose-200 transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Fan Feed</span>
            </button>
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════
            UNIFIED HORIZONTAL TABS (CLEAN LIGHT THEME)
           ═════════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-2 shadow-2xs overflow-x-auto no-scrollbar flex items-center gap-1.5">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.key;
            const Icon = tab.icon;
            const hasBadge = tab.badge && tab.badge > 0;

            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {hasBadge && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-white/20 text-white' : tab.badgeColor || 'bg-gray-100 text-gray-700'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ═════════════════════════════════════════════════════════════════
            TAB CONTENT ROUTER
           ═════════════════════════════════════════════════════════════════ */}
        <Suspense fallback={
          <div className="py-24 bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center text-center shadow-2xs">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mb-3" />
            <p className="text-sm text-gray-500 font-medium">Loading command module...</p>
          </div>
        }>
          {currentTab === 'overview' && (
            <div className="space-y-6">
              {/* Creator Withdrawal Urgent Alert Banner */}
              {stats.pendingPayouts > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                      <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm sm:text-base font-bold text-amber-950">
                          {stats.pendingPayouts} Creator Withdrawal Request{stats.pendingPayouts > 1 ? 's' : ''} Pending
                        </h4>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Creators have requested payouts. Review wallet addresses and mark completed upon TRC20 transfer.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTabChange('payouts')}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow-2xs whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5"
                  >
                    <span>Process Payouts</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* ─────────────────────────────────────────────────────────
                  1. ORIGINAL STYLE STATS TILES (WITH ALL FINANCIAL METRICS)
                 ───────────────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* Total Users */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleTabChange('users')}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs hover:border-blue-300 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{stats.totalUsers}</h3>
                  <p className="text-gray-500 text-xs font-medium">Total Users</p>
                </motion.div>

                {/* Active Creators */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
                  onClick={() => handleTabChange('users')}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs hover:border-purple-300 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{stats.totalCreators}</h3>
                  <p className="text-gray-500 text-xs font-medium">Active Creators</p>
                </motion.div>

                {/* Subscriptions & Tiers */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
                  onClick={() => handleTabChange('subscriptions')}
                  className="bg-white rounded-2xl border border-amber-200 p-5 shadow-2xs hover:border-amber-400 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                      <Crown className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      Live
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{stats.activeSubscriptions}</h3>
                    <span className="text-xs text-emerald-600 font-bold">${stats.subsRevenue.toFixed(0)}/mo</span>
                  </div>
                  <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5 font-medium">
                    <span>🌱{stats.supporterCount}</span>
                    <span>⭐{stats.vipCount}</span>
                    <span>👑{stats.superfanCount}</span>
                  </p>
                </motion.div>

                {/* Pending KYC */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
                  onClick={() => handleTabChange('kyc')}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs hover:border-yellow-300 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center text-yellow-600">
                      <Clock className="w-5 h-5" />
                    </div>
                    {stats.pendingKYC > 0 && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded-full">
                        Action
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{stats.pendingKYC}</h3>
                  <p className="text-gray-500 text-xs font-medium">Pending KYC</p>
                </motion.div>

                {/* Total Gross Revenue */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      In-Sync
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-0.5">${stats.grossRevenue.toFixed(2)}</h3>
                  <p className="text-gray-500 text-xs font-medium">Gross Platform Volume</p>
                </motion.div>

                {/* Pending Payouts */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  onClick={() => handleTabChange('payouts')}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs hover:border-teal-400 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    {stats.pendingPayouts > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full animate-pulse">
                        Action
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{stats.pendingPayouts}</h3>
                  <p className="text-gray-500 text-xs font-medium">Pending Payouts</p>
                </motion.div>
              </div>

              {/* ─────────────────────────────────────────────────────────
                  2. SUB-REVENUE SPLIT BAR (PLATFORM 20% VS CREATOR 80%)
                 ───────────────────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Financial Split & Settlement</h3>
                    <p className="text-xs text-gray-500">Automated 80/20 platform ledger attribution</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
                      Platform 20%: ${stats.platformRevenue.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                      Creators 80%: ${stats.creatorRevenue.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5 font-medium">Subscriptions MRR</p>
                    <p className="text-lg font-bold text-amber-600">${stats.subsRevenue.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-400">{stats.activeSubscriptions} active subs</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5 font-medium">PPV Messages</p>
                    <p className="text-lg font-bold text-purple-600">${stats.ppvRevenue.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-400">Media unlocks</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5 font-medium">Direct Tips</p>
                    <p className="text-lg font-bold text-yellow-600">${stats.tipsRevenue.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-400">Post & profile tips</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5 font-medium">Video/Voice Calls</p>
                    <p className="text-lg font-bold text-blue-600">${stats.callsRevenue.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-400">Completed sessions</p>
                  </div>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────
                  3. ORIGINAL SUBSCRIPTIONS & MEMBER TIERS BANNER
                 ───────────────────────────────────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-200/80 rounded-2xl p-6 shadow-2xs"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Crown className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <span>Platform Subscriptions & Member Tiers</span>
                        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                          {stats.activeSubscriptions} Active
                        </span>
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Tracking active tier subscriptions across creators:
                        <span className="font-semibold text-emerald-700 ml-1">🌱 {stats.supporterCount} Supporters</span> •
                        <span className="font-semibold text-purple-700 ml-1">⭐ {stats.vipCount} VIPs</span> •
                        <span className="font-semibold text-amber-700 ml-1">👑 {stats.superfanCount} Superfans</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTabChange('subscriptions')}
                    className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-sm self-start md:self-auto flex-shrink-0"
                  >
                    <span>Manage Subscriptions</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>

              {/* ─────────────────────────────────────────────────────────
                  4. ACTION QUEUES (KYC, NGN PROOFS & CREATOR WITHDRAWALS)
                 ───────────────────────────────────────────────────────── */}
              {(pendingKYCList.length > 0 || pendingNGNList.length > 0 || pendingPayoutsList.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* KYC Pending List */}
                  {pendingKYCList.length > 0 && (
                    <div className="bg-white rounded-2xl border border-yellow-200 p-5 shadow-2xs">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <FileCheck className="w-5 h-5 text-yellow-600" />
                          <h3 className="text-sm font-bold text-gray-900">Pending KYC Review ({stats.pendingKYC})</h3>
                        </div>
                        <button
                          onClick={() => handleTabChange('kyc')}
                          className="text-xs text-rose-600 hover:text-rose-700 font-bold"
                        >
                          View Full Queue →
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {pendingKYCList.map((app) => (
                          <div key={app.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{app.displayName || app.fullName || app.username || 'Applicant'}</p>
                              <p className="text-[11px] text-gray-500">@{app.username || 'creator'} • {app.email || 'No email'}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => handleQuickApproveKYC(app.id)}
                                disabled={actionLoadingId === app.id}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition shadow-2xs"
                              >
                                <Check className="w-3 h-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleQuickRejectKYC(app.id)}
                                disabled={actionLoadingId === app.id}
                                className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-300 transition shadow-2xs"
                              >
                                <X className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* NGN Bank Pending List */}
                  {pendingNGNList.length > 0 && (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-2xs">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <DollarSign className="w-5 h-5 text-emerald-600" />
                          <h3 className="text-sm font-bold text-gray-900">Pending NGN Bank Proofs ({stats.pendingNgn})</h3>
                        </div>
                        <button
                          onClick={() => handleTabChange('ngn-payments')}
                          className="text-xs text-emerald-700 hover:text-emerald-800 font-bold"
                        >
                          Review All →
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {pendingNGNList.map((p) => (
                          <div key={p.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">${Number(p.amountUSD || 0).toFixed(2)}</span>
                                <span className="text-[11px] text-gray-500 font-medium">({Number(p.amountNGN || 0).toLocaleString()} NGN)</span>
                              </div>
                              <p className="text-[11px] text-gray-500 truncate">Payer: {p.senderName || 'Direct Transfer'}</p>
                            </div>
                            <button
                              onClick={() => handleTabChange('ngn-payments')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition shadow-2xs"
                            >
                              Review Proof
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Creator Payouts Pending Queue */}
                  {pendingPayoutsList.length > 0 && (
                    <div className="bg-white rounded-2xl border border-teal-200 p-5 shadow-2xs">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <DollarSign className="w-5 h-5 text-teal-600" />
                          <h3 className="text-sm font-bold text-gray-900">Pending Withdrawals ({pendingPayoutsList.length})</h3>
                        </div>
                        <button
                          onClick={() => handleTabChange('payouts')}
                          className="text-xs text-teal-700 hover:text-teal-800 font-bold"
                        >
                          Process All →
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {pendingPayoutsList.slice(0, 5).map((p) => (
                          <div key={p.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">
                                  ${Number(p.amount || (p.amountMinor ? p.amountMinor / 100 : 0)).toFixed(2)}
                                </span>
                                <span className="text-[11px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-medium">
                                  {p.method || 'USDT TRC20'}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 truncate font-mono">
                                To: {p.walletAddress || p.payoutAddress || 'Address'}
                              </p>
                            </div>
                            <button
                              onClick={() => handleTabChange('payouts')}
                              className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition shadow-2xs flex-shrink-0"
                            >
                              Review & Pay
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────
                  5. ORIGINAL ADMIN SECTION TILES (PRESERVING 100% PREVIOUS)
                 ───────────────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Subscriptions */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('subscriptions')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Crown className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Subscriptions & Member Tiers</h3>
                  <p className="text-gray-600 mb-4 text-sm">Track active subscribers, tier distribution, and recurring revenue.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.activeSubscriptions}</span>
                    <span className="text-sm text-gray-500 font-medium">Active Subscribers</span>
                  </div>
                </motion.div>

                {/* 2. KYC */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('kyc')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group relative"
                >
                  {stats.pendingKYC > 0 && (
                    <div className="absolute top-4 right-4">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <FileCheck className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">KYC Management</h3>
                  <p className="text-gray-600 mb-4 text-sm">Review and approve creator verification applications.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.pendingKYC}</span>
                    <span className="text-sm text-gray-500 font-medium">Pending Applications</span>
                  </div>
                </motion.div>

                {/* 3. Crypto Payments */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('crypto-payments')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group relative"
                >
                  {stats.pendingCrypto > 0 && (
                    <div className="absolute top-4 right-4">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Wallet className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Crypto Payments</h3>
                  <p className="text-gray-600 mb-4 text-sm">Review NowPayments USDT transactions and confirmations.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.pendingCrypto}</span>
                    <span className="text-sm text-gray-500 font-medium">Pending Verification</span>
                  </div>
                </motion.div>

                {/* 4. NGN Payments */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('ngn-payments')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group relative"
                >
                  {stats.pendingNgn > 0 && (
                    <div className="absolute top-4 right-4">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <DollarSign className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">NGN Payments</h3>
                  <p className="text-gray-600 mb-4 text-sm">Approve Nigerian bank transfer proofs and credit wallets.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.pendingNgn}</span>
                    <span className="text-sm text-gray-500 font-medium">Pending Approval</span>
                  </div>
                </motion.div>

                {/* 5. User Management */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('users')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Users className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">User Management</h3>
                  <p className="text-gray-600 mb-4 text-sm">Manage users, toggle creator status, and inspect profiles.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.totalUsers}</span>
                    <span className="text-sm text-gray-500 font-medium">Total Users</span>
                  </div>
                </motion.div>

                {/* 6. Analytics */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('analytics')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <TrendingUp className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Deep Analytics</h3>
                  <p className="text-gray-600 mb-4 text-sm">View in-depth platform metrics, creator charts, and trends.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.totalCreators}</span>
                    <span className="text-sm text-gray-500 font-medium">Active Creators</span>
                  </div>
                </motion.div>

                {/* 7. Platform Settings */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('settings')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Settings className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Platform Settings</h3>
                  <p className="text-gray-600 mb-4 text-sm">Set NGN exchange rate, buffer markup, and payment gateways.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-orange-600">Configure</span>
                    <span className="text-sm text-gray-500 font-medium">NGN Rate & Buffer</span>
                  </div>
                </motion.div>

                {/* 8. Creator Payouts */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('payouts')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <DollarSign className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Creator Payouts</h3>
                  <p className="text-gray-600 mb-4 text-sm">Manage creator withdrawal requests and mark paid.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900">{stats.pendingPayouts}</span>
                    <span className="text-sm text-gray-500 font-medium">Withdrawal Queue</span>
                  </div>
                </motion.div>

                {/* 9. Ambassadors */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('ambassadors')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Award className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Ambassadors</h3>
                  <p className="text-gray-600 mb-4 text-sm">View ambassador referral stats and commissions.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-600">Open Panel</span>
                    <span className="text-sm text-gray-500 font-medium">Ambassador Panel</span>
                  </div>
                </motion.div>

                {/* 10. Ad Asset Pipeline */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => handleTabChange('ad-assets')}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition shadow-sm">
                      <Layers className="w-7 h-7 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Ad Asset Pipeline</h3>
                  <p className="text-gray-600 mb-4 text-sm">Upload and process creator ad campaign assets.</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-rose-600">Pipeline</span>
                    <span className="text-sm text-gray-500 font-medium">Upload & Process</span>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────
              SUB-COMPONENT TABS (ALL FULLY PRESERVED & INTEGRATED)
             ───────────────────────────────────────────────────────── */}
          {currentTab !== 'overview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-gray-200 shadow-2xs">
                <button
                  onClick={() => handleTabChange('overview')}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition"
                >
                  <span>← Back to Admin Dashboard</span>
                </button>
                <button
                  onClick={() => navigate(`/admin/${currentTab}`)}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold transition"
                  title="Open direct route in browser"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Dedicated Page (/admin/{currentTab})</span>
                </button>
              </div>

              <TabErrorBoundary key={currentTab}>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
                  {currentTab === 'subscriptions'   && <SubscriptionsManagement />}
                  {currentTab === 'kyc'             && <KYCManagement />}
                  {currentTab === 'crypto-payments' && <CryptoPayments />}
                  {currentTab === 'ngn-payments'    && <NGNPayments />}
                  {currentTab === 'users'           && <UserManagement />}
                  {currentTab === 'payouts'         && <AdminPayouts />}
                  {currentTab === 'settings'        && <PlatformSettings />}
                  {currentTab === 'analytics'       && <AdminAnalytics />}
                  {currentTab === 'ambassadors'     && <Ambassadors />}
                  {currentTab === 'ad-assets'       && <AdAssetManagement />}
                </div>
              </TabErrorBoundary>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}