// src/pages/Dashboard/AmbassadorDashboard.jsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Link2, Copy, Check, TrendingUp, Users, DollarSign,
  ArrowLeft, Loader2, ChevronDown, ChevronUp, Calendar,
  Award, BarChart3, Wallet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc,
  getDoc, updateDoc, increment
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';

function StatCard({ icon: Icon, label, value, sub, color = 'rose', delay = 0 }) {
  const colors = {
    rose:   'from-rose-500 to-pink-600',
    green:  'from-green-500 to-emerald-600',
    blue:   'from-blue-500 to-indigo-600',
    amber:  'from-amber-500 to-orange-500',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export default function AmbassadorDashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();

  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [ambassadorData, setAmbassadorData] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [referredCreators, setReferredCreators] = useState([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);

  useEffect(() => {
    if (currentUser) loadAll();
  }, [currentUser]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [userDoc, commissionsData] = await Promise.all([
        getDoc(doc(db, 'users', currentUser.uid)),
        loadCommissions(),
      ]);
      const userData = userDoc.data() || {};
      setAmbassadorData(userData);

      // Load referred creators
      if (userData.referralCode) {
        await loadReferredCreators(userData.referralCode);
      }
    } catch (err) {
      console.error('Error loading ambassador data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCommissions = async () => {
    const q = query(
      collection(db, 'referralCommissions'),
      where('ambassadorId', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCommissions(data);

    // Build monthly breakdown
    const byMonth = {};
    data.forEach(c => {
      const date = c.createdAt?.toDate?.() || new Date(c.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { month: key, total: 0, count: 0 };
      byMonth[key].total += c.amount || 0;
      byMonth[key].count += 1;
    });
    const sorted = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
    setMonthlyBreakdown(sorted);
    return data;
  };

  const loadReferredCreators = async (referralCode) => {
    const q = query(
      collection(db, 'users'),
      where('referredBy', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    const creators = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setReferredCreators(creators);
  };

  const referralLink = ambassadorData?.referralCode
    ? `https://unlukt.com/register?ref=${ambassadorData.referralCode}`
    : null;

  const copyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Commission this month
  const thisMonthKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const commissionThisMonth = monthlyBreakdown.find(m => m.month === thisMonthKey)?.total || 0;

  const handleWithdraw = async () => {
    const balance = ambassadorData?.ambassadorBalance || 0;
    if (balance <= 0) {
      alert('No ambassador balance to withdraw.');
      return;
    }
    if (!window.confirm(`Withdraw $${balance.toFixed(2)} into your creator earnings wallet?`)) return;

    try {
      setWithdrawing(true);
      // Move ambassadorBalance → creator_balances (same collection payouts use)
      const userRef = doc(db, 'users', currentUser.uid);
      const balanceRef = doc(db, 'creator_balances', currentUser.uid);

      const balSnap = await getDoc(balanceRef);
      if (balSnap.exists()) {
        await updateDoc(balanceRef, {
          availableBalance: increment(balance),
          updatedAt: new Date(),
        });
      } else {
        // Create balance doc if it doesn't exist
        const { setDoc } = await import('firebase/firestore');
        await setDoc(balanceRef, {
          creatorId: currentUser.uid,
          availableBalance: balance,
          pendingBalance: 0,
          totalEarnings: balance,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Zero out ambassador balance
      await updateDoc(userRef, { ambassadorBalance: 0 });
      setAmbassadorData(prev => ({ ...prev, ambassadorBalance: 0 }));
      alert('Done! Funds moved to your creator wallet. You can now request a payout from your Wallet page.');
    } catch (err) {
      console.error('Withdraw error:', err);
      alert('Withdrawal failed: ' + err.message);
    } finally {
      setWithdrawing(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatMonth = (key) => {
    const [y, m] = key.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getCreatorCommission = (creatorId) => {
    return commissions
      .filter(c => c.referredCreatorId === creatorId)
      .reduce((sum, c) => sum + (c.amount || 0), 0);
  };

  const getCommissionStatus = (creatorId) => {
    const creatorComms = commissions.filter(c => c.referredCreatorId === creatorId);
    if (!creatorComms.length) return null;
    const hasPaid = creatorComms.some(c => c.status === 'paid');
    const hasPending = creatorComms.some(c => c.status === 'pending');
    if (hasPaid && !hasPending) return 'paid';
    return 'pending';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  // Guard: only ambassadors
  if (profile?.role !== 'ambassador') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ambassador Access Only</h2>
          <p className="text-gray-500 mb-6">This section is only available to Unlukt Ambassadors.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const balance = ambassadorData?.ambassadorBalance || 0;
  const totalEarned = ambassadorData?.totalCommissionEarned || 0;
  const clicks = ambassadorData?.referralLinkClicks || 0;
  const commRate = ((ambassadorData?.referralCommissionRate || 0) * 100).toFixed(0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Ambassador Dashboard
              </h1>
              <p className="text-sm text-gray-500">{commRate}% commission on referred creator payouts</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Wallet} label="Withdrawable Balance" value={`$${balance.toFixed(2)}`} color="rose" delay={0} />
          <StatCard icon={TrendingUp} label="Total Earned (All Time)" value={`$${totalEarned.toFixed(2)}`} color="green" delay={0.05} />
          <StatCard icon={DollarSign} label="This Month" value={`$${commissionThisMonth.toFixed(2)}`} color="blue" delay={0.1} />
          <StatCard icon={Users} label="Referred Creators" value={referredCreators.length} sub={`${clicks} link clicks`} color="amber" delay={0.15} />
        </div>

        {/* Withdraw Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-white/80 text-sm mb-1">Ambassador Balance</p>
              <p className="text-4xl font-bold">${balance.toFixed(2)}</p>
              <p className="text-white/70 text-sm mt-2">
                Withdraw to your creator wallet, then request a payout as normal.
              </p>
            </div>
            <button
              onClick={handleWithdraw}
              disabled={balance <= 0 || withdrawing}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {withdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
              {withdrawing ? 'Moving funds...' : 'Withdraw to Wallet'}
            </button>
          </div>
        </motion.div>

        {/* Referral Link */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-rose-500" />
            Your Referral Link
          </h2>
          <p className="text-sm text-gray-500 mb-4">Share this link. When a creator signs up through it, you earn commission on every payout they receive (for 1 year).</p>

          {referralLink ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 truncate">
                {referralLink}
              </div>
              <button
                onClick={copyLink}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition whitespace-nowrap ${
                  copied ? 'bg-green-500 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Referral code not yet assigned. Contact admin.</p>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-gray-100 rounded-full font-mono font-semibold">
              {ambassadorData?.referralCode || '—'}
            </span>
            <span>· {clicks} link clicks tracked</span>
          </div>
        </motion.div>

        {/* Referred Creators Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-rose-500" />
              Referred Creators
              <span className="ml-auto text-sm font-normal text-gray-500">{referredCreators.length} total</span>
            </h2>
          </div>

          {referredCreators.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">No creators referred yet. Share your link to start earning!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Creator</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Joined</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission Earned</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referredCreators.map(creator => {
                    const earned = getCreatorCommission(creator.id);
                    const status = getCommissionStatus(creator.id);
                    return (
                      <tr key={creator.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0">
                              {creator.avatar || creator.profilePicture
                                ? <img src={creator.avatar || creator.profilePicture} alt="" className="w-full h-full object-cover" />
                                : creator.displayName?.charAt(0).toUpperCase() || 'C'}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{creator.displayName || 'Creator'}</p>
                              <p className="text-xs text-gray-500">@{creator.username || creator.id?.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(creator.createdAt)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-gray-900">${earned.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {status === 'paid' && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Paid</span>
                          )}
                          {status === 'pending' && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Pending</span>
                          )}
                          {!status && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">No payouts yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Monthly Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
        >
          <button
            onClick={() => setShowMonthly(v => !v)}
            className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition"
          >
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-rose-500" />
              Monthly Breakdown
            </h2>
            {showMonthly ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {showMonthly && (
            <div className="border-t border-gray-100">
              {monthlyBreakdown.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No commission history yet.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {monthlyBreakdown.map(row => (
                    <div key={row.month} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900 text-sm">{formatMonth(row.month)}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">${row.total.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">{row.count} transaction{row.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
