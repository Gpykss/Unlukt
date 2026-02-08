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
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, getCountFromServer } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import cryptoService from '../../services/crypto.service';

export default function CryptoPayments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending_review');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
    verified: 0,
    rejected: 0,
    total: 0
  });

  useEffect(() => {
    loadStats();
    loadPayments();
  }, [filter]);

  const loadStats = async () => {
    try {
      const paymentsRef = collection(db, 'crypto_payments');
      
      const pendingQuery = query(paymentsRef, where('verificationStatus', '==', 'pending_review'));
      const pendingSnap = await getCountFromServer(pendingQuery);
      
      const verifiedQuery = query(paymentsRef, where('verificationStatus', '==', 'verified'));
      const verifiedSnap = await getCountFromServer(verifiedQuery);
      
      const rejectedQuery = query(paymentsRef, where('verificationStatus', '==', 'rejected'));
      const rejectedSnap = await getCountFromServer(rejectedQuery);
      
      const totalSnap = await getCountFromServer(paymentsRef);
      
      setStats({
        pending: pendingSnap.data().count,
        verified: verifiedSnap.data().count,
        rejected: rejectedSnap.data().count,
        total: totalSnap.data().count
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      const paymentsRef = collection(db, 'crypto_payments');
      let q;

      if (filter === 'all') {
        q = query(paymentsRef, orderBy('createdAt', 'desc'));
      } else {
        q = query(
          paymentsRef,
          where('verificationStatus', '==', filter),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const paymentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        proofSubmittedAt: doc.data().proofSubmittedAt?.toDate(),
        verifiedAt: doc.data().verifiedAt?.toDate()
      }));

      setPayments(paymentsData);
      console.log(`✅ Loaded ${paymentsData.length} payments`);
    } catch (error) {
      console.error('❌ Error loading payments:', error);
      alert('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (paymentId, approved) => {
    const action = approved ? 'APPROVE' : 'REJECT';
    const notes = approved ? '' : prompt('Rejection reason (optional):') || '';
    
    if (!confirm(`Are you sure you want to ${action} this payment?`)) {
      return;
    }

    setVerifying(true);
    try {
      await cryptoService.verifyPayment(paymentId, auth.currentUser.uid, approved, notes);
      alert(`Payment ${approved ? 'approved' : 'rejected'} successfully!`);
      loadPayments();
      loadStats();
      setSelectedPayment(null);
    } catch (error) {
      console.error('Error verifying payment:', error);
      alert(error.message || 'Failed to verify payment');
    } finally {
      setVerifying(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'verified': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending_review': return 'bg-yellow-100 text-yellow-800';
      case 'pending_payment': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filterOptions = [
    { value: 'pending_review', label: 'Pending Review', count: stats.pending },
    { value: 'all', label: 'All Payments', count: stats.total },
    { value: 'verified', label: 'Approved', count: stats.verified },
    { value: 'rejected', label: 'Rejected', count: stats.rejected }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back to Admin Dashboard</span>
          </button>

          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Crypto Payments</h1>
              <p className="text-gray-600">Review and verify USDT payments</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              {stats.pending > 0 && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">
                  Action Needed
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.pending}</h3>
            <p className="text-gray-600 text-sm">Pending Review</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.verified}</h3>
            <p className="text-gray-600 text-sm">Approved</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.rejected}</h3>
            <p className="text-gray-600 text-sm">Rejected</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.total}</h3>
            <p className="text-gray-600 text-sm">Total Payments</p>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center space-x-3 overflow-x-auto">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition whitespace-nowrap ${
                  filter === option.value
                    ? 'bg-rose-50 text-rose-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>
        </div>

        {/* Payments List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading payments...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No payments found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(payment.verificationStatus)}`}>
                        {payment.verificationStatus.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">#{payment.reference}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* User Info */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">User</p>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="font-semibold text-sm">{payment.userName}</p>
                            <p className="text-xs text-gray-500">{payment.userEmail}</p>
                          </div>
                        </div>
                      </div>

                      {/* Amount */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Amount</p>
                        <div className="flex items-center space-x-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <p className="font-bold text-lg text-green-600">
                            {payment.cryptoAmount} {payment.cryptoCurrency}
                          </p>
                        </div>
                      </div>

                      {/* Submitted Date */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Submitted</p>
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <p className="text-sm">
                            {payment.proofSubmittedAt ? payment.proofSubmittedAt.toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Transaction Hash */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">TX Hash</p>
                        {payment.transactionHash ? (
                          <a
                            href={`https://tronscan.org/#/transaction/${payment.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 text-xs"
                          >
                            <span className="truncate max-w-[100px]">{payment.transactionHash}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">Not provided</p>
                        )}
                      </div>
                    </div>

                    {/* Proof Image */}
                    {payment.userProofUrl && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2">Proof of Payment</p>
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 text-sm font-semibold"
                        >
                          <ImageIcon className="w-4 h-4" />
                          <span>View Proof</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {payment.verificationStatus === 'pending_review' && (
                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        onClick={() => handleVerify(payment.id, true)}
                        disabled={verifying}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold text-sm transition flex items-center space-x-2 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => handleVerify(payment.id, false)}
                        disabled={verifying}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm transition flex items-center space-x-2 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Proof Modal */}
        {selectedPayment && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPayment(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-2xl font-bold mb-4">Payment Proof</h3>
                <div className="mb-4">
                  <p className="text-sm text-gray-600">Reference: {selectedPayment.reference}</p>
                  <p className="text-sm text-gray-600">Amount: {selectedPayment.cryptoAmount} USDT</p>
                  <p className="text-sm text-gray-600">User: {selectedPayment.userName}</p>
                </div>
                <img 
                  src={selectedPayment.userProofUrl} 
                  alt="Payment Proof" 
                  className="w-full rounded-lg mb-6"
                />
                <div className="flex space-x-3">
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold"
                  >
                    Close
                  </button>
                  {selectedPayment.verificationStatus === 'pending_review' && (
                    <>
                      <button
                        onClick={() => {
                          handleVerify(selectedPayment.id, true);
                        }}
                        className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          handleVerify(selectedPayment.id, false);
                        }}
                        className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
