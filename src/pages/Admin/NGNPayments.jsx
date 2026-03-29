// src/pages/Admin/NGNPayments.jsx
// Admin tab to review NGN bank transfer proofs and credit wallets

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertCircle,
  DollarSign, User, Calendar, Image as ImageIcon, Loader2, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  getCountFromServer, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { addToWallet } from '../../services/walletService';

// ── helpers ──────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100  text-green-800',
  rejected: 'bg-red-100    text-red-800',
};

export default function NGNPayments() {
  const navigate = useNavigate();
  const [filter, setFilter]               = useState('pending');
  const [payments, setPayments]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [acting, setActing]               = useState(null);   // paymentId being processed
  const [proofModal, setProofModal]       = useState(null);   // payment to show proof for
  const [rejectNote, setRejectNote]       = useState('');
  const [showRejectBox, setShowRejectBox] = useState(null);   // paymentId
  const [stats, setStats]                 = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  useEffect(() => { loadAll(); }, [filter]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadStats(), loadPayments()]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const ref = collection(db, 'ngn_payments');
    const [pendingS, approvedS, rejectedS, totalS] = await Promise.all([
      getCountFromServer(query(ref, where('status', '==', 'pending'))),
      getCountFromServer(query(ref, where('status', '==', 'approved'))),
      getCountFromServer(query(ref, where('status', '==', 'rejected'))),
      getCountFromServer(ref),
    ]);
    setStats({
      pending:  pendingS.data().count,
      approved: approvedS.data().count,
      rejected: rejectedS.data().count,
      total:    totalS.data().count,
    });
  };

  const loadPayments = async () => {
    try {
      const ref = collection(db, 'ngn_payments');
      // ✅ FIX: Remove orderBy from status-filtered queries — avoid composite
      // index requirement. Sort client-side instead.
      const q = filter === 'all'
        ? query(ref, orderBy('createdAt', 'desc'))
        : query(ref, where('status', '==', filter));  // no orderBy here

      const snap = await getDocs(q);
      const docs = snap.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
          createdAt:  d.data().createdAt?.toDate?.(),
          reviewedAt: d.data().reviewedAt?.toDate?.(),
        }))
        // sort newest first client-side
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setPayments(docs);
    } catch (e) {
      console.error('NGN payments load error:', e);
    }
  };

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (payment) => {
    if (!window.confirm(`Approve ₦${payment.amountNGN?.toLocaleString()} (≈ $${payment.amountUSD?.toFixed(2)}) for ${payment.userEmail}?`)) return;
    setActing(payment.id);
    try {
      // 1. Credit user wallet
      await addToWallet(payment.userId, payment.amountUSD, payment.id);

      // 2. Mark payment approved
      await updateDoc(doc(db, 'ngn_payments', payment.id), {
        status:     'approved',
        reviewedBy: auth.currentUser?.uid,
        reviewedAt: serverTimestamp(),
      });

      await loadAll();
      setProofModal(null);
    } catch (e) {
      console.error('Approve error:', e);
      alert('Failed to approve: ' + e.message);
    } finally {
      setActing(null);
    }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async (payment) => {
    setActing(payment.id);
    try {
      await updateDoc(doc(db, 'ngn_payments', payment.id), {
        status:     'rejected',
        adminNote:  rejectNote.trim() || 'Payment could not be verified.',
        reviewedBy: auth.currentUser?.uid,
        reviewedAt: serverTimestamp(),
      });
      setShowRejectBox(null);
      setRejectNote('');
      await loadAll();
      setProofModal(null);
    } catch (e) {
      console.error('Reject error:', e);
      alert('Failed to reject: ' + e.message);
    } finally {
      setActing(null);
    }
  };

  const FILTERS = [
    { value: 'pending',  label: 'Pending',  count: stats.pending  },
    { value: 'approved', label: 'Approved', count: stats.approved },
    { value: 'rejected', label: 'Rejected', count: stats.rejected },
    { value: 'all',      label: 'All',      count: stats.total    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 font-semibold">
            <ArrowLeft className="w-5 h-5" /> Back to Admin
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">NGN Bank Transfer Payments</h1>
              <p className="text-gray-500 text-sm">Review proofs and credit user wallets</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Pending',  value: stats.pending,  icon: Clock,        bg: 'bg-yellow-50', text: 'text-yellow-600', attention: stats.pending > 0 },
            { label: 'Approved', value: stats.approved, icon: CheckCircle,  bg: 'bg-green-50',  text: 'text-green-600'  },
            { label: 'Rejected', value: stats.rejected, icon: XCircle,      bg: 'bg-red-50',    text: 'text-red-600'   },
            { label: 'Total',    value: stats.total,    icon: DollarSign,   bg: 'bg-blue-50',   text: 'text-blue-600'  },
          ].map(({ label, value, icon: Icon, bg, text, attention }) => (
            <motion.div key={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 relative">
              {attention && (
                <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                </span>
              )}
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${text}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 bg-white border border-gray-200 rounded-xl p-2 mb-6 overflow-x-auto">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                filter === f.value ? 'bg-rose-50 text-rose-600' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No {filter === 'all' ? '' : filter} payments found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map(p => (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
                className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Status + reference */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[p.status]}`}>
                        {p.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{p.reference}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">User</p>
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <p className="text-sm font-semibold text-gray-900 truncate">{p.userEmail}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Amount (NGN)</p>
                        <p className="text-sm font-bold text-green-600">₦{p.amountNGN?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">USD Value</p>
                        <p className="text-sm font-bold text-gray-900">${p.amountUSD?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Submitted</p>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <p className="text-sm text-gray-700">{p.createdAt?.toLocaleDateString() || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {p.adminNote && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                        Admin note: {p.adminNote}
                      </p>
                    )}

                    {/* Proof button */}
                    {p.proofUrl && (
                      <button onClick={() => setProofModal(p)}
                        className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-semibold mt-2">
                        <ImageIcon className="w-4 h-4" /> View Proof Screenshot
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  {p.status === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => handleApprove(p)} disabled={acting === p.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition">
                        {acting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </button>
                      <button onClick={() => setShowRejectBox(p.id)} disabled={acting === p.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition">
                        <XCircle className="w-4 h-4" /> Reject
                      </button>

                      {/* Inline reject note box */}
                      <AnimatePresence>
                        {showRejectBox === p.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden">
                            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2}
                              placeholder="Reason (optional)"
                              className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-rose-500 resize-none mt-1" />
                            <button onClick={() => handleReject(p)} disabled={acting === p.id}
                              className="w-full text-xs py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold mt-1 transition">
                              Confirm Reject
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Proof image modal */}
      <AnimatePresence>
        {proofModal && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setProofModal(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-900">Payment Proof</h3>
                  <p className="text-xs text-gray-400 font-mono">{proofModal.reference}</p>
                </div>
                <button onClick={() => setProofModal(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">NGN Amount</p>
                    <p className="font-bold text-gray-900">₦{proofModal.amountNGN?.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">USD Value</p>
                    <p className="font-bold text-gray-900">${proofModal.amountUSD?.toFixed(2)}</p>
                  </div>
                </div>
                <img src={proofModal.proofUrl} alt="Proof" className="w-full rounded-xl mb-5 border border-gray-200" />
                {proofModal.status === 'pending' && (
                  <div className="flex gap-3">
                    <button onClick={() => handleApprove(proofModal)} disabled={acting === proofModal.id}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition disabled:opacity-50">
                      {acting === proofModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve & Credit Wallet
                    </button>
                    <button onClick={() => { setProofModal(null); setShowRejectBox(proofModal.id); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
