// src/pages/Admin/CryptoPayments.jsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  User,
  DollarSign,
  Calendar,
  Image as ImageIcon,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, getDocs, updateDoc, doc, 
  serverTimestamp, increment 
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';

export default function CryptoPayments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
    verified: 0,
    rejected: 0,
    total: 0
  });

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const paymentsRef = collection(db, 'crypto_payments');
      const snapshot = await getDocs(paymentsRef);
      
      const paymentsData = snapshot.docs.map(d => {
        const data = d.data();
        const rawStatus = (data.verificationStatus || data.status || 'pending').toLowerCase();
        
        // Normalize status to standard categories
        let normalizedStatus = 'pending_review';
        if (['finished', 'completed', 'confirmed', 'verified'].includes(rawStatus)) {
          normalizedStatus = 'verified';
        } else if (['failed', 'rejected', 'expired'].includes(rawStatus)) {
          normalizedStatus = 'rejected';
        } else {
          normalizedStatus = 'pending_review';
        }

        let parsedDate = null;
        if (data.createdAt?.toDate) {
          parsedDate = data.createdAt.toDate();
        } else if (data.createdAt?.seconds) {
          parsedDate = new Date(data.createdAt.seconds * 1000);
        } else if (data.createdAt) {
          parsedDate = new Date(data.createdAt);
        }

        return {
          id: d.id,
          ...data,
          rawStatus,
          normalizedStatus,
          createdAtDate: parsedDate,
          amountDisplay: Number(data.cryptoAmount || data.amount || data.price_amount || 0),
          currencyDisplay: data.cryptoCurrency || data.pay_currency || 'USDT',
        };
      });

      // Sort locally descending by date to avoid requiring a composite Firestore index
      paymentsData.sort((a, b) => {
        const timeA = a.createdAtDate ? a.createdAtDate.getTime() : 0;
        const timeB = b.createdAtDate ? b.createdAtDate.getTime() : 0;
        return timeB - timeA;
      });

      // Calculate stats
      let pCount = 0;
      let vCount = 0;
      let rCount = 0;

      paymentsData.forEach(p => {
        if (p.normalizedStatus === 'verified') vCount++;
        else if (p.normalizedStatus === 'rejected') rCount++;
        else pCount++;
      });

      setStats({
        pending: pCount,
        verified: vCount,
        rejected: rCount,
        total: paymentsData.length
      });

      setPayments(paymentsData);
    } catch (error) {
      console.error('❌ Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (payment, approved) => {
    const action = approved ? 'APPROVE' : 'REJECT';
    const notes = approved ? '' : prompt('Rejection reason (optional):') || '';
    
    if (!confirm(`Are you sure you want to ${action} this payment of ${payment.amountDisplay} ${payment.currencyDisplay}?`)) {
      return;
    }

    setVerifying(true);
    try {
      const paymentRef = doc(db, 'crypto_payments', payment.id);
      const newStatus = approved ? 'completed' : 'rejected';
      const newVerifStatus = approved ? 'verified' : 'rejected';

      await updateDoc(paymentRef, {
        status: newStatus,
        verificationStatus: newVerifStatus,
        verifiedAt: serverTimestamp(),
        verifiedBy: auth.currentUser?.uid || 'admin',
        adminNotes: notes,
        updatedAt: serverTimestamp()
      });

      // If approved, credit user balance
      if (approved && payment.userId) {
        try {
          const userBalRef = doc(db, 'user_balances', payment.userId);
          await updateDoc(userBalRef, {
            balance: increment(payment.amountDisplay),
            updatedAt: serverTimestamp()
          });
        } catch (_) {
          // Fallback to wallets doc
          try {
            const walletRef = doc(db, 'wallets', payment.userId);
            await updateDoc(walletRef, {
              balanceMinor: increment(Math.round(payment.amountDisplay * 100)),
              updatedAt: serverTimestamp()
            });
          } catch (wErr) {
            console.warn('Could not increment balance directly:', wErr);
          }
        }
      }

      alert(`Payment ${approved ? 'approved' : 'rejected'} successfully!`);
      setSelectedPayment(null);
      await loadPayments();
    } catch (error) {
      console.error('Error verifying payment:', error);
      alert(error.message || 'Failed to verify payment');
    } finally {
      setVerifying(false);
    }
  };

  const getStatusBadge = (p) => {
    const s = p.normalizedStatus;
    if (s === 'verified') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">APPROVED</span>;
    }
    if (s === 'rejected') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">REJECTED</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">PENDING REVIEW</span>;
  };

  const filteredPayments = payments.filter(p => {
    if (filter !== 'all' && p.normalizedStatus !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchEmail = (p.userEmail || '').toLowerCase().includes(q);
      const matchName = (p.userName || '').toLowerCase().includes(q);
      const matchRef = (p.reference || p.id || '').toLowerCase().includes(q);
      const matchHash = (p.transactionHash || p.txHash || '').toLowerCase().includes(q);
      return matchEmail || matchName || matchRef || matchHash;
    }
    return true;
  });

  const filterOptions = [
    { value: 'all', label: 'All Payments', count: stats.total },
    { value: 'pending_review', label: 'Pending Review', count: stats.pending },
    { value: 'verified', label: 'Approved', count: stats.verified },
    { value: 'rejected', label: 'Rejected', count: stats.rejected }
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-sm">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Crypto Payments</h1>
              <p className="text-sm text-gray-500">Review USDT (TRC20) deposits & verification queue</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/payment-logs')}
              className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
              <span>NowPayments API Logs</span>
            </button>
            <button
              onClick={loadPayments}
              disabled={loading}
              className="px-3.5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pending Review</p>
            <h3 className="text-2xl font-bold text-amber-600">{stats.pending}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Approved</p>
            <h3 className="text-2xl font-bold text-emerald-600">{stats.verified}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Rejected</p>
            <h3 className="text-2xl font-bold text-rose-600">{stats.rejected}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Payments</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3>
          </div>
        </div>

        {/* Filter bar & Search */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
                  filter === opt.value
                    ? 'bg-rose-500 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, email, txHash..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:border-rose-500"
            />
          </div>
        </div>

        {/* Payments List */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-2xs">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500 mx-auto"></div>
            <p className="text-gray-500 text-xs mt-3">Loading crypto payments...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-2xs">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-600 text-sm font-semibold">No crypto payments found</p>
            <p className="text-gray-400 text-xs mt-1">Payments submitted by users will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPayments.map((payment) => (
              <div
                key={payment.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition shadow-2xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(payment)}
                      <span className="text-xs font-mono text-gray-500">
                        #{payment.reference || payment.id.slice(0, 10)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      {/* User */}
                      <div>
                        <p className="text-gray-400 font-medium mb-0.5">User</p>
                        <p className="font-semibold text-gray-900 truncate">{payment.userName || 'User'}</p>
                        <p className="text-gray-500 truncate">{payment.userEmail || payment.userId || 'N/A'}</p>
                      </div>

                      {/* Amount */}
                      <div>
                        <p className="text-gray-400 font-medium mb-0.5">Amount</p>
                        <p className="font-bold text-base text-emerald-600">
                          ${payment.amountDisplay.toFixed(2)} <span className="text-xs text-gray-500">{payment.currencyDisplay}</span>
                        </p>
                      </div>

                      {/* Submitted Date */}
                      <div>
                        <p className="text-gray-400 font-medium mb-0.5">Date</p>
                        <p className="font-semibold text-gray-700">
                          {payment.createdAtDate ? payment.createdAtDate.toLocaleDateString() : 'Recent'}
                        </p>
                      </div>

                      {/* TX Hash */}
                      <div>
                        <p className="text-gray-400 font-medium mb-0.5">TX Hash</p>
                        {payment.transactionHash || payment.txHash ? (
                          <a
                            href={`https://tronscan.org/#/transaction/${payment.transactionHash || payment.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-mono text-xs"
                          >
                            <span className="truncate max-w-[120px]">
                              {payment.transactionHash || payment.txHash}
                            </span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-gray-400">Not provided</span>
                        )}
                      </div>
                    </div>

                    {payment.userProofUrl && (
                      <div className="pt-2">
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>View Uploaded Proof</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions for Pending Review */}
                  {payment.normalizedStatus === 'pending_review' && (
                    <div className="flex sm:flex-col gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                      <button
                        onClick={() => handleVerify(payment, true)}
                        disabled={verifying}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => handleVerify(payment, false)}
                        disabled={verifying}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Proof Modal */}
        {selectedPayment && (
          <div 
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPayment(null)}
          >
            <div 
              className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Payment Proof</h3>
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-xl">
                <p><span className="font-semibold">Reference:</span> #{selectedPayment.reference || selectedPayment.id}</p>
                <p><span className="font-semibold">Amount:</span> ${selectedPayment.amountDisplay.toFixed(2)} {selectedPayment.currencyDisplay}</p>
                <p><span className="font-semibold">User:</span> {selectedPayment.userName} ({selectedPayment.userEmail})</p>
              </div>

              {selectedPayment.userProofUrl && (
                <img 
                  src={selectedPayment.userProofUrl} 
                  alt="Payment Proof" 
                  className="w-full max-h-96 object-contain rounded-xl border border-gray-200"
                />
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs"
                >
                  Close
                </button>
                {selectedPayment.normalizedStatus === 'pending_review' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedPayment, true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs"
                    >
                      Approve & Credit
                    </button>
                    <button
                      onClick={() => handleVerify(selectedPayment, false)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
