// src/pages/Admin/NowPaymentsLogs.jsx
// Reads from 'crypto_payments' collection — matches your exact Firestore field names:
// reference, status, nowPaymentsStatus, userId, userEmail, userName, amount, baseAmount,
// vatAmount, vatPercentage, contentType, contentId, creatorId, txHash, cryptoCurrency,
// nowPaymentsUrl, nowPaymentsPaymentId, createdAt, updatedAt, expiresAt

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bitcoin, CheckCircle, XCircle, Clock, AlertCircle,
  ExternalLink, RefreshCw, DollarSign, Search,
  ArrowLeft, Copy, Check, ChevronDown, Activity,
  Tag, Zap, TrendingUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  getCountFromServer, limit, startAfter, onSnapshot
} from 'firebase/firestore';
import { db } from '../../config/firebase';

// ── Status map — uses YOUR app's status values ────────────────────────────────
const STATUS_CONFIG = {
  completed:       { label: 'Completed',  color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle },
  confirmed:       { label: 'Confirmed',  color: 'bg-green-100 text-green-800 border-green-200',       dot: 'bg-green-500',   icon: CheckCircle },
  confirming:      { label: 'Confirming', color: 'bg-blue-100 text-blue-800 border-blue-200',          dot: 'bg-blue-400',    icon: Activity },
  pending_payment: { label: 'Pending',    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',    dot: 'bg-yellow-400',  icon: Clock },
  partially_paid:  { label: 'Partial',    color: 'bg-orange-100 text-orange-800 border-orange-200',    dot: 'bg-orange-500',  icon: AlertCircle },
  failed:          { label: 'Failed',     color: 'bg-red-100 text-red-800 border-red-200',             dot: 'bg-red-500',     icon: XCircle },
  expired:         { label: 'Expired',    color: 'bg-gray-100 text-gray-500 border-gray-200',          dot: 'bg-gray-300',    icon: Clock },
  refunded:        { label: 'Refunded',   color: 'bg-purple-100 text-purple-700 border-purple-200',    dot: 'bg-purple-400',  icon: RefreshCw },
};

const getExplorerUrl = (txHash) => {
  if (!txHash) return null;
  // Your app uses USDT TRC20 by default
  return `https://tronscan.org/#/transaction/${txHash}`;
};

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const shortHash = (h) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—';

const PAGE_SIZE = 25;

export default function NowPaymentsLogs() {
  const navigate = useNavigate();
  const [payments, setPayments]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [lastDoc, setLastDoc]       = useState(null);
  const [hasMore, setHasMore]       = useState(false);
  const [copied, setCopied]         = useState(null);
  const [expanded, setExpanded]     = useState(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, failed: 0, totalRevenue: 0, totalVAT: 0 });

  // Live listener — refresh stats on new payment
  useEffect(() => {
    const ref = collection(db, 'crypto_payments');
    const unsub = onSnapshot(query(ref, orderBy('createdAt', 'desc'), limit(1)), () => loadStats());
    loadStats();
    return () => unsub();
  }, []);

  const loadStats = async () => {
    try {
      const ref = collection(db, 'crypto_payments');
      const [totalSnap, completedSnap, pendingSnap, failedSnap] = await Promise.all([
        getCountFromServer(ref),
        getCountFromServer(query(ref, where('status', 'in', ['completed', 'confirmed']))),
        getCountFromServer(query(ref, where('status', 'in', ['pending_payment', 'confirming']))),
        getCountFromServer(query(ref, where('status', 'in', ['failed', 'expired']))),
      ]);
      const revDocs = await getDocs(query(ref, where('status', 'in', ['completed', 'confirmed'])));
      let totalRevenue = 0, totalVAT = 0;
      revDocs.forEach(doc => {
        const d = doc.data();
        totalRevenue += parseFloat(d.baseAmount || d.amount || 0);
        totalVAT     += parseFloat(d.vatAmount  || 0);
      });
      setStats({ total: totalSnap.data().count, completed: completedSnap.data().count, pending: pendingSnap.data().count, failed: failedSnap.data().count, totalRevenue, totalVAT });
    } catch (e) { console.error('Stats error:', e); }
  };

  const loadPayments = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    try {
      const ref = collection(db, 'crypto_payments');
      const filterMap = {
        completed: ['completed', 'confirmed'],
        pending:   ['pending_payment', 'confirming'],
        failed:    ['failed', 'expired'],
      };
      let q = filter !== 'all'
        ? query(ref, where('status', 'in', filterMap[filter]), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
        : query(ref, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

      if (append && lastDoc) q = query(ref, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setPayments(prev => append ? [...prev, ...docs] : docs);
    } catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, lastDoc]);

  useEffect(() => { setLastDoc(null); loadPayments(false); }, [filter]);

  const handleRefresh = () => { setRefreshing(true); setLastDoc(null); loadStats(); loadPayments(false); };

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  const filtered = payments.filter(p => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return [p.reference, p.userEmail, p.userName, p.userId, p.contentType, p.txHash, p.nowPaymentsPaymentId?.toString()]
      .some(v => v?.toLowerCase().includes(s));
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-5 transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <Bitcoin className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Payment Logs</h1>
                <p className="text-gray-500 text-sm mt-0.5">NowPayments · USDT TRC20 · Live updates</p>
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-sm font-medium text-gray-700 shadow-sm transition">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `$${stats.totalVAT.toFixed(2)} VAT collected`, icon: DollarSign, bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
            { label: 'Successful',    value: stats.completed,  sub: `of ${stats.total} total`,                   icon: CheckCircle, bg: 'bg-green-50',  iconBg: 'bg-green-100',  iconColor: 'text-green-600' },
            { label: 'Pending',       value: stats.pending,    sub: 'awaiting confirmation',                      icon: Clock,       bg: 'bg-yellow-50', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', alert: stats.pending > 0 },
            { label: 'Failed',        value: stats.failed,     sub: 'failed or expired',                         icon: XCircle,     bg: 'bg-red-50',    iconBg: 'bg-red-100',    iconColor: 'text-red-500' },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
              className={`${s.bg} rounded-2xl border border-white p-5 shadow-sm relative`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${s.iconBg} rounded-xl flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.iconColor}`} />
                </div>
                {s.alert && (
                  <span className="flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500" />
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters + Search */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: 'all',       label: 'All',        count: stats.total     },
              { value: 'completed', label: 'Successful', count: stats.completed },
              { value: 'pending',   label: 'Pending',    count: stats.pending   },
              { value: 'failed',    label: 'Failed',     count: stats.failed    },
            ].map(opt => (
              <button key={opt.value} onClick={() => setFilter(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${filter === opt.value ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search reference, email, user ID…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-gray-500 text-sm">Loading payment logs…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 py-20 text-center">
            <Bitcoin className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No payments found</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? 'Try a different search' : filter !== 'all' ? 'Try switching filter' : 'Payments appear once NowPayments sends a webhook'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((p, i) => {
                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG['pending_payment'];
                const Icon = cfg.icon;
                const explorerUrl = getExplorerUrl(p.txHash);
                const isExpanded = expanded === p.id;

                return (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.025, 0.3) }}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">

                    <div className="p-5 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : p.id)}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">

                        {/* Status + ref */}
                        <div className="flex items-center gap-3 min-w-[160px]">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          <div>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${cfg.color}`}>
                              <Icon className="w-3 h-3" />{cfg.label}
                            </span>
                            <p className="text-xs text-gray-400 mt-1 font-mono truncate max-w-[150px]" title={p.reference}>
                              {p.reference}
                            </p>
                          </div>
                        </div>

                        {/* User */}
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-rose-600">{(p.userName || 'U').charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{p.userName || '—'}</p>
                            <p className="text-xs text-gray-400">{p.userEmail || '—'}</p>
                          </div>
                        </div>

                        {/* Content type */}
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm font-medium text-gray-600 capitalize">{p.contentType || '—'}</span>
                        </div>

                        {/* Amount */}
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">
                            ${parseFloat(p.amount || 0).toFixed(2)}<span className="text-xs font-medium text-gray-400 ml-1">USD</span>
                          </p>
                          {parseFloat(p.vatAmount || 0) > 0 && (
                            <p className="text-xs text-gray-400">+${parseFloat(p.vatAmount).toFixed(2)} VAT</p>
                          )}
                        </div>

                        {/* TX Hash */}
                        <div className="flex items-center gap-1.5">
                          {p.txHash ? (
                            <>
                              <span className="font-mono text-xs text-gray-500">{shortHash(p.txHash)}</span>
                              <button onClick={e => { e.stopPropagation(); copy(p.txHash, p.id + '_h'); }} className="p-1 hover:bg-gray-100 rounded">
                                {copied === p.id + '_h' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                              </button>
                              {explorerUrl && (
                                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 hover:bg-blue-50 rounded">
                                  <ExternalLink className="w-3 h-3 text-blue-500" />
                                </a>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 italic">no tx hash yet</span>
                          )}
                        </div>

                        {/* Date + expand toggle */}
                        <div className="flex items-center gap-2 ml-auto">
                          <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-gray-100">
                          <div className="px-5 py-5">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                              {[
                                { label: 'User ID',          value: p.userId,                         mono: true, copyKey: p.id+'_uid', copyVal: p.userId },
                                { label: 'Reference',        value: p.reference,                      mono: true, copyKey: p.id+'_ref', copyVal: p.reference },
                                { label: 'NowPayments ID',   value: p.nowPaymentsPaymentId || '—',    mono: true },
                                { label: 'Content Type',     value: p.contentType || '—' },
                                { label: 'Creator ID',       value: p.creatorId || '—',               mono: true },
                                { label: 'Content ID',       value: p.contentId || '—',               mono: true },
                                { label: 'Base Amount',      value: p.baseAmount  ? `$${parseFloat(p.baseAmount).toFixed(4)}`  : '—' },
                                { label: 'VAT',              value: p.vatAmount   ? `$${parseFloat(p.vatAmount).toFixed(4)} (${p.vatPercentage}%)` : 'None' },
                                { label: 'Crypto',           value: (p.cryptoCurrency || 'USDT TRC20').toUpperCase() },
                                { label: 'Actually Paid',    value: p.actuallypaid ? `${p.actuallypaid} USDT` : '—' },
                                { label: 'Country',          value: p.userCountry || p.metadata?.userCountry || '—' },
                                { label: 'NP Raw Status',    value: p.nowPaymentsStatus || '—',       mono: true },
                              ].map((f, fi) => (
                                <div key={fi}>
                                  <p className="text-xs text-gray-400 mb-1">{f.label}</p>
                                  <div className="flex items-center gap-1">
                                    <p className={`text-sm font-medium text-gray-800 truncate ${f.mono ? 'font-mono text-xs' : ''}`}>{f.value}</p>
                                    {f.copyVal && (
                                      <button onClick={() => copy(f.copyVal, f.copyKey)} className="p-0.5 hover:bg-gray-100 rounded">
                                        {copied === f.copyKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Full TX Hash */}
                            {p.txHash && (
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-3">
                                <p className="text-xs text-gray-400 mb-1.5">Full Transaction Hash (TRC20)</p>
                                <div className="flex items-center gap-2">
                                  <p className="font-mono text-xs text-gray-700 break-all flex-1">{p.txHash}</p>
                                  <button onClick={() => copy(p.txHash, p.id+'_full')} className="flex-shrink-0 p-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition">
                                    {copied === p.id+'_full' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                                  </button>
                                  {explorerUrl && (
                                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition">
                                      <ExternalLink className="w-3.5 h-3.5" /> TronScan
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* NowPayments invoice link */}
                            {p.nowPaymentsUrl && (
                              <a href={p.nowPaymentsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium mb-3">
                                <Zap className="w-3.5 h-3.5" /> View NowPayments Invoice
                              </a>
                            )}

                            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                              <span>Created: {formatDate(p.createdAt)}</span>
                              {p.updatedAt  && <span>· Updated: {formatDate(p.updatedAt)}</span>}
                              {p.expiresAt  && <span>· Expires: {formatDate(p.expiresAt)}</span>}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {hasMore && (
              <div className="text-center pt-2">
                <button onClick={() => loadPayments(true)} className="px-6 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-sm font-medium shadow-sm transition">
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}