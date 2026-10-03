// src/pages/Dashboard/SimplifiedDashboard.jsx
// Implements PRD Section 15.1: The "Rule of 3" (Money, Status, Action Required)
// Styled using Unlukt's signature clean light aesthetic (bg-gray-50, white cards, rose/emerald accents).

import { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, ArrowUpRight, Plus, Video, Phone,
  Clock, CheckCircle2, ChevronRight, BarChart3,
  Radio, X, ExternalLink, Crown, MessageSquare, Copy, Check, Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where,
  getDocs, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import AvailabilityToggle from '../../components/Dashboard/AvailabilityToggle';
import WithdrawModal from '../../components/Dashboard/WithdrawModal';
import CreatorTierModal from '../../components/Dashboard/CreatorTierModal';

// Deep analytics loaded lazily on demand
const CreatorAnalytics = lazy(() => import('../Analytics/Analytics'));

export default function SimplifiedDashboard({ onSwitchToLegacy }) {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  // Active View Tab: 'overview' (Rule of 3) vs 'analytics' (Deep stats)
  const [activeTab, setActiveTab] = useState('overview');

  // Rule of 3 State
  const [balance, setBalance] = useState({ available: 0 });
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [activeSubsCount, setActiveSubsCount] = useState(0);
  const [subscribersList, setSubscribersList] = useState([]);
  const [tierCounts, setTierCounts] = useState({ supporter: 0, vip: 0, superfan: 0 });
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [loadingAction, setLoadingAction] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawModalTab, setWithdrawModalTab] = useState('withdraw');
  const [pendingPayout, setPendingPayout] = useState(null);
  const [showTierModal, setShowTierModal] = useState(false);
  const [dismissPill, setDismissPill] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    setLoadingSubs(true);

    const parseDate = (val) => {
      if (!val) return null;
      if (typeof val.toDate === 'function') return val.toDate();
      if (val.seconds) return new Date(val.seconds * 1000);
      const parsed = new Date(val);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const processSubscribers = async (primaryDocs = [], txDocs = []) => {
      const now = new Date();
      const mergedMap = new Map();

      // Process primary subscriptions
      primaryDocs.forEach((d) => {
        const data = d.data();
        const fanId = data.userId || data.fanId;
        if (!fanId) return;
        const exp = parseDate(data.expiresAt);
        const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
        const isActive = !isExplicitInactive && (!exp || exp > now);

        mergedMap.set(fanId, {
          id: d.id,
          fanId,
          tier: data.tier || 'supporter',
          amount: data.amount || data.monthlyPrice || 0,
          status: data.status || (isActive ? 'active' : 'expired'),
          isActive,
          expiresAt: exp,
          createdAt: parseDate(data.createdAt || data.startedAt),
        });
      });

      // Process subscription transactions
      txDocs.forEach((d) => {
        const data = d.data();
        const fanId = data.userId || data.fanId;
        if (!fanId || mergedMap.has(fanId)) return;
        const exp = parseDate(data.expiresAt);
        const isExplicitInactive = data.status === 'expired' || data.status === 'cancelled';
        const isActive = !isExplicitInactive && (!exp || exp > now);

        mergedMap.set(fanId, {
          id: d.id,
          fanId,
          tier: data.tier || 'supporter',
          amount: data.amount || data.monthlyPrice || 0,
          status: data.status || (isActive ? 'active' : 'expired'),
          isActive,
          expiresAt: exp,
          createdAt: parseDate(data.createdAt || data.timestamp),
        });
      });

      const allSubs = Array.from(mergedMap.values());
      const activeSubs = allSubs.filter((s) => s.isActive);
      const displaySubs = activeSubs.length > 0 ? activeSubs : allSubs;

      let sup = 0;
      let vip = 0;
      let superfan = 0;

      displaySubs.forEach((s) => {
        const t = (s.tier || 'supporter').toLowerCase();
        if (t === 'superfan') superfan++;
        else if (t === 'vip') vip++;
        else sup++;
      });

      const count = Math.max(
        displaySubs.length,
        userProfile?.subscribersCount || userProfile?.subscriberCount || 0
      );
      setActiveSubsCount(count);
      setTierCounts({ supporter: sup, vip, superfan });

      // Enrich top subscribers with user profile info
      try {
        const enriched = await Promise.all(
          displaySubs.slice(0, 10).map(async (s) => {
            if (!s.fanId) return s;
            try {
              const fanDoc = await getDoc(doc(db, 'users', s.fanId));
              return {
                ...s,
                fan: fanDoc.exists() ? fanDoc.data() : null,
              };
            } catch {
              return s;
            }
          })
        );
        setSubscribersList(enriched);
      } catch {
        setSubscribersList(displaySubs);
      }
      setLoadingSubs(false);
    };

    // Real-time listener on primary subscriptions
    const subsQ = query(
      collection(db, 'subscriptions'),
      where('creatorId', '==', currentUser.uid)
    );

    const unsub = onSnapshot(subsQ, async (snap) => {
      try {
        // Also fetch any transactions for this creator
        const txSnap = await getDocs(
          query(collection(db, 'subscription_transactions'), where('creatorId', '==', currentUser.uid))
        ).catch(() => ({ docs: [] }));

        await processSubscribers(snap.docs, txSnap.docs || []);
      } catch (err) {
        console.warn('Subscriptions listener error:', err);
        await processSubscribers(snap.docs, []);
      }
    }, (err) => {
      console.warn('Subscriptions dashboard listener:', err);
      // Fallback: check transactions or profile
      getDocs(query(collection(db, 'subscription_transactions'), where('creatorId', '==', currentUser.uid)))
        .then((txSnap) => processSubscribers([], txSnap.docs))
        .catch(() => {
          setActiveSubsCount(userProfile?.subscribersCount || userProfile?.subscriberCount || 0);
          setLoadingSubs(false);
        });
    });

    return () => unsub();
  }, [currentUser?.uid, userProfile?.subscribersCount, userProfile?.subscriberCount]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    setLoadingBalance(true);

    // 1. Real-time balance synchronization (PRD §15.1)
    // Primary source of truth for creator earnings is creator_balances.
    // Also cross-references wallets so maximum cumulative balance is always shown.
    const unsubCreatorBal = onSnapshot(doc(db, 'creator_balances', currentUser.uid), async (creatorBalSnap) => {
      let cAvail = 0;
      if (creatorBalSnap.exists()) {
        const d = creatorBalSnap.data();
        cAvail = (d.availableBalance || 0) + (d.pendingBalance || 0);
      }

      try {
        const walletSnap = await getDoc(doc(db, 'wallets', currentUser.uid));
        let wAvail = 0;
        if (walletSnap.exists() && walletSnap.data().balanceMinor !== undefined) {
          wAvail = walletSnap.data().balanceMinor / 100;
        }
        setBalance({ available: Math.max(cAvail, wAvail) });
      } catch {
        setBalance({ available: cAvail });
      } finally {
        setLoadingBalance(false);
      }
    }, () => {
      setLoadingBalance(false);
    });

    // Real-time listener for creator pending payouts
    const qPayout = query(
      collection(db, 'payout_requests'),
      where('creatorId', '==', currentUser.uid)
    );
    const unsubPayout = onSnapshot(qPayout, (snap) => {
      const pending = snap.docs.find(d => d.data().status === 'pending');
      if (pending) {
        setPendingPayout({ id: pending.id, ...pending.data() });
      } else {
        setPendingPayout(null);
      }
    }, () => {});

    fetchUrgentActionItem();

    return () => {
      unsubCreatorBal();
      unsubPayout();
    };
  }, [currentUser?.uid]);

  // 2. Fetch urgent action items (upcoming calls, pending sessions)
  const fetchUrgentActionItem = async () => {
    if (!currentUser?.uid) return;
    try {
      setLoadingAction(true);
      
      // Check call_bookings first
      let callsSnap = await getDocs(query(
        collection(db, 'call_bookings'),
        where('creatorId', '==', currentUser.uid),
        where('status', 'in', ['pending', 'accepted', 'confirmed', 'waiting']),
        limit(1)
      ));

      if (callsSnap.empty) {
        // Fallback to video_calls collection
        callsSnap = await getDocs(query(
          collection(db, 'video_calls'),
          where('creatorId', '==', currentUser.uid),
          where('status', 'in', ['pending', 'accepted', 'confirmed', 'waiting']),
          limit(1)
        ));
      }

      if (!callsSnap.empty) {
        const call = callsSnap.docs[0].data();
        const callId = callsSnap.docs[0].id;
        setActionItem({
          type: 'call',
          title: `Upcoming ${call.type || 'video'} call`,
          subtitle: `With @${call.userName || call.fanUsername || 'Fan'}`,
          actionLabel: 'Open Waiting Room',
          actionUrl: `/waiting-room/${callId}`,
          urgent: true,
        });
        return;
      }

      setActionItem(null);
    } catch {
      setActionItem(null);
    } finally {
      setLoadingAction(false);
    }
  };

  // Progressive onboarding progress pill (PRD 15.4)
  const getOnboardingPill = () => {
    if (dismissPill) return null;
    const isKYCApproved = userProfile?.kycStatus === 'approved';
    const hasHandle = !!userProfile?.username;

    if (!hasHandle) {
      return {
        step: '1 of 3',
        text: 'Complete your creator profile & handle',
        url: '/edit-profile',
      };
    }
    if (!isKYCApproved) {
      return {
        step: '2 of 3',
        text: 'Identity verification required to receive earnings',
        url: '/complete-profile',
      };
    }
    return null;
  };

  const onboardingPill = getOnboardingPill();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-28 pt-6 px-4 sm:px-6 max-w-4xl mx-auto">
      {/* ── Top Bar & Greeting ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            Hey, {userProfile?.displayName || userProfile?.username || 'Creator'}
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Creator Command Center</p>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToLegacy && (
            <button
              onClick={onSwitchToLegacy}
              className="text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl px-3 py-2 font-medium transition shadow-sm"
            >
              Classic View
            </button>
          )}
          <button
            onClick={() => navigate('/new-post')}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Post</span>
          </button>
        </div>
      </div>

      {/* ── Progressive Onboarding Progress Pill (PRD 15.4) ── */}
      {onboardingPill && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-rose-50/80 border border-rose-200/80 rounded-2xl p-3.5 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-rose-500 text-white font-bold px-2 py-0.5 rounded-md text-[10px]">
              {onboardingPill.step}
            </span>
            <span className="text-rose-950 font-medium">{onboardingPill.text}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(onboardingPill.url)}
              className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-0.5 underline underline-offset-2"
            >
              Finish setup
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDismissPill(true)}
              className="text-rose-400 hover:text-rose-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Tab Switcher: Overview vs Deep Analytics ── */}
      <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition ${
            activeTab === 'overview'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Studio Overview
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Deep Analytics</span>
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          {/* ══════════════════════════════════════════════════════════
              CREATOR METRICS: MONEY + ACTIVE SUBSCRIBERS
             ══════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Block 1: Balance & Withdraw */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Available to Withdraw
                </p>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                    {loadingBalance ? (
                      <span className="text-gray-300 animate-pulse">$--.--</span>
                    ) : (
                      `$${balance.available.toFixed(2)}`
                    )}
                  </span>
                  {pendingPayout ? (
                    <button
                      onClick={() => {
                        setWithdrawModalTab('history');
                        setShowWithdrawModal(true);
                      }}
                      className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300 hover:bg-amber-100 transition flex items-center gap-1 shadow-2xs"
                      title="View payout status"
                    >
                      <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                      <span>${Number(pendingPayout.amount || 0).toFixed(2)} Pending</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Instant Net
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setWithdrawModalTab('history');
                    setShowWithdrawModal(true);
                  }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 font-bold transition p-1"
                >
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>Payout History</span>
                </button>

                <button
                  onClick={() => {
                    setWithdrawModalTab('withdraw');
                    setShowWithdrawModal(true);
                  }}
                  disabled={balance.available < 20}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition active:scale-95 ${
                    balance.available >= 20
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                  title={balance.available < 20 ? 'Minimum withdrawal is $20' : 'Request payout'}
                >
                  <span>Withdraw</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Block 1b: Active Subscribers & Tiers */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    Active Subscribers
                  </p>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-500" />
                    Recurring MRR
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                    {loadingSubs ? (
                      <span className="text-gray-300 animate-pulse">--</span>
                    ) : (
                      activeSubsCount
                    )}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    {activeSubsCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
                  <span className="px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px]">
                    🌱 {tierCounts.supporter} Supporter
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200/60 text-[11px]">
                    ⭐ {tierCounts.vip} VIP
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px]">
                    👑 {tierCounts.superfan} Superfan
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">Tier Memberships</span>
                <button
                  onClick={() => setShowTierModal(true)}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 transition"
                >
                  Manage Tiers
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              RULE OF 3: BLOCK 2 - STATUS (One Big Tactile Availability Toggle)
             ══════════════════════════════════════════════════════════ */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
            <AvailabilityToggle compact={true} />
          </div>

          {/* ══════════════════════════════════════════════════════════
              RULE OF 3: BLOCK 3 - ACTION REQUIRED (Only show when pending,
              otherwise collapse into a clean + Create Post prompt)
             ══════════════════════════════════════════════════════════ */}
          <div>
            {actionItem ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">{actionItem.title}</h4>
                    <p className="text-xs text-amber-700">{actionItem.subtitle}</p>
                  </div>
                </div>

                <button
                  onClick={() => navigate(actionItem.actionUrl)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition active:scale-95 shadow-sm"
                >
                  {actionItem.actionLabel}
                </button>
              </motion.div>
            ) : (
              <div className="bg-white border border-gray-200/80 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-gray-900">You're all caught up!</h4>
                <p className="text-xs text-gray-500 max-w-sm">
                  No pending calls or urgent requests right now. Share new content to engage your subscribers.
                </p>
                <button
                  onClick={() => navigate('/new-post')}
                  className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700 shadow-sm transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Post</span>
                </button>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              MY SUBSCRIBERS & MEMBER ROSTER
             ══════════════════════════════════════════════════════════ */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">My Subscribers</h3>
                  <p className="text-[11px] text-gray-500">Active supporters directly funding your studio</p>
                </div>
              </div>

              <button
                onClick={() => {
                  const target = userProfile?.username ? userProfile.username.replace('@', '') : currentUser?.uid;
                  const profileUrl = `${window.location.origin}/creator/${target}`;
                  navigator.clipboard.writeText(profileUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Share Profile'}</span>
              </button>
            </div>

            {loadingSubs ? (
              <div className="py-6 text-center text-xs text-gray-400">Loading subscribers...</div>
            ) : subscribersList.length === 0 ? (
              <div className="py-6 px-4 bg-gray-50/60 rounded-xl text-center border border-dashed border-gray-200">
                <Crown className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-700">No active subscribers yet</p>
                <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm mx-auto">
                  Fans who subscribe to your Supporter, VIP, or Superfan tiers will appear right here with their badges.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {subscribersList.map((sub) => {
                  const fanName = sub.fan?.displayName || sub.fan?.name || 'Fan';
                  const fanUsername = sub.fan?.username || (sub.fanId ? sub.fanId.slice(0, 8) : 'user');
                  const tier = (sub.tier || 'supporter').toLowerCase();

                  return (
                    <div key={sub.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center font-bold text-gray-700 overflow-hidden flex-shrink-0">
                          {sub.fan?.avatar?.startsWith('http') ? (
                            <img src={sub.fan.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{sub.fan?.avatar || '👤'}</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-gray-900">{fanName}</p>
                            {tier === 'superfan' ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                👑 Superfan
                              </span>
                            ) : tier === 'vip' ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                ⭐ VIP
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🌱 Supporter
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400">@{fanUsername}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/messages?with=${sub.fanId}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Quick CRM & Studio Navigation ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <button
              onClick={() => navigate('/messages')}
              className="bg-white border border-gray-200/80 hover:border-gray-300 p-4 rounded-2xl text-left transition group shadow-sm"
            >
              <p className="text-xs text-gray-500">Unified Inbox</p>
              <p className="text-sm font-bold text-gray-900 mt-1 group-hover:text-rose-500 transition">
                DMs & PPVs →
              </p>
            </button>
            <button
              onClick={() => navigate('/my-calls')}
              className="bg-white border border-gray-200/80 hover:border-gray-300 p-4 rounded-2xl text-left transition group shadow-sm"
            >
              <p className="text-xs text-gray-500">Bookings</p>
              <p className="text-sm font-bold text-gray-900 mt-1 group-hover:text-rose-500 transition">
                My Calls →
              </p>
            </button>
            <button
              onClick={() => setShowTierModal(true)}
              className="bg-white border border-gray-200/80 hover:border-gray-300 p-4 rounded-2xl text-left transition group shadow-sm relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Subscriptions</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                  {activeSubsCount} Active
                </span>
              </div>
              <p className="text-sm font-bold text-gray-900 mt-1 group-hover:text-rose-500 transition">
                Tier Pricing →
              </p>
            </button>
            <button
              onClick={() => {
                const target = userProfile?.username ? userProfile.username.replace('@', '') : currentUser?.uid;
                navigate(`/creator/${target}`);
              }}
              className="bg-white border border-gray-200/80 hover:border-gray-300 p-4 rounded-2xl text-left transition group shadow-sm"
            >
              <p className="text-xs text-gray-500">Fan View</p>
              <p className="text-sm font-bold text-gray-900 mt-1 group-hover:text-rose-500 transition">
                My Profile →
              </p>
            </button>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════
            DEEP ANALYTICS: Lazy loaded on-demand
           ══════════════════════════════════════════════════════════ */
        <Suspense fallback={
          <div className="py-20 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            Loading analytics data...
          </div>
        }>
          <CreatorAnalytics embedded={true} />
        </Suspense>
      )}

      {/* ── Withdraw Modal ── */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        initialTab={withdrawModalTab}
        onClose={() => {
          setShowWithdrawModal(false);
          fetchBalance();
        }}
      />

      {/* ── Creator Tier Modal ── */}
      <CreatorTierModal
        isOpen={showTierModal}
        onClose={() => setShowTierModal(false)}
        creatorId={currentUser?.uid}
      />
    </div>
  );
}
