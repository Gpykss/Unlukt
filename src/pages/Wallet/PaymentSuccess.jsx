// src/pages/Wallet/PaymentSuccess.jsx

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Loader2, Wallet, ExternalLink, Clock, ArrowRight } from 'lucide-react';

export default function PaymentSuccess() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refParam = searchParams.get('ref');

  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser?.uid) {
      return;
    }
    if (!refParam) {
      setError('Missing payment reference parameter.');
      setLoading(false);
      return;
    }

    console.log('🔗 Listening to payment reference:', refParam);
    const q = query(
      collection(db, 'crypto_payments'),
      where('reference', '==', refParam),
      where('userId', '==', currentUser.uid),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoading(false);
        if (snapshot.empty) {
          setError('Payment record not found.');
          return;
        }

        const paymentData = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
        };
        setPayment(paymentData);
        setError('');
      },
      (err) => {
        console.error('Error fetching payment state:', err);
        setError('Error subscribing to payment updates.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [refParam, currentUser]);

  // Determine status color/icon
  const getStatusConfig = (status) => {
    switch (status) {
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-16 h-16 text-emerald-500" />,
          title: 'Payment Successful!',
          subtitle: 'Your wallet has been credited successfully.',
          colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'expired':
        return {
          icon: <Clock className="w-16 h-16 text-amber-500" />,
          title: 'Payment Invoice Expired',
          subtitle: 'The 1-hour window to complete this payment has passed.',
          colorClass: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'failed':
        return {
          icon: <AlertTriangle className="w-16 h-16 text-red-500" />,
          title: 'Payment Failed',
          subtitle: 'There was an issue processing your transaction.',
          colorClass: 'bg-red-50 text-red-800 border-red-200',
        };
      case 'confirming':
        return {
          icon: <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />,
          title: 'Confirming Transaction...',
          subtitle: 'We detected your payment on the blockchain and are awaiting confirmations.',
          colorClass: 'bg-blue-50 text-blue-800 border-blue-200',
        };
      default: // pending_payment, waiting
        return {
          icon: <Loader2 className="w-16 h-16 text-rose-500 animate-spin" />,
          title: 'Awaiting Confirmation...',
          subtitle: 'Please wait while we verify your blockchain payment.',
          colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Retrieving payment details...</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 max-w-md mx-auto text-center">
        <div className="p-4 bg-red-50 border border-red-200 rounded-full text-red-600 mb-5">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something Went Wrong</h1>
        <p className="text-gray-600 mb-6">{error || 'Could not load your transaction.'}</p>
        <button
          onClick={() => navigate('/wallet')}
          className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-2xl hover:bg-black transition w-full"
        >
          Return to Wallet
        </button>
      </div>
    );
  }

  const { icon, title, subtitle, colorClass } = getStatusConfig(payment.status);

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 sm:p-6 bg-gray-50/50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden"
      >
        {/* Top visual section */}
        <div className="p-8 flex flex-col items-center text-center border-b border-gray-100">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="mb-4"
          >
            {icon}
          </motion.div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 max-w-sm">
            {subtitle}
          </p>

          {payment.status !== 'completed' && payment.status !== 'failed' && payment.status !== 'expired' && (
            <p className="text-xs text-rose-500 font-semibold bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 mt-4 animate-pulse">
              ⏱ Live updates enabled — do not refresh
            </p>
          )}
        </div>

        {/* Breakdown Card */}
        <div className="p-6 sm:p-8 bg-gray-50/30 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200/60 p-5 space-y-3.5 shadow-sm">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Transaction Details
            </h2>

            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Reference:</span>
              <span className="font-mono font-medium text-gray-900 break-all select-all ml-4 text-right">
                {payment.reference}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Credited Amount:</span>
              <span className="font-bold text-gray-900">
                ${Number(payment.baseAmount || payment.amount || 0).toFixed(2)} USD
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Crypto Fee (1.5%):</span>
              <span className="font-medium text-gray-900">
                ${Number(payment.vatAmount || 0).toFixed(2)} USD
              </span>
            </div>

            <div className="border-t border-dashed border-gray-200 my-2 pt-3.5 flex justify-between items-center">
              <span className="font-semibold text-gray-800">Total Paid:</span>
              <span className="text-lg font-extrabold text-rose-600">
                ${Number(payment.amount || 0).toFixed(2)} USD
              </span>
            </div>

            <div className="flex justify-between items-center text-sm pt-1">
              <span className="text-gray-500">Payment Currency:</span>
              <span className="font-semibold text-gray-800 uppercase">
                {payment.payCurrency || payment.cryptoCurrency || 'Crypto'}
              </span>
            </div>
          </div>

          {/* Explanation notice */}
          {payment.status === 'completed' ? (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
              <Wallet className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Wallet Updated</p>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  Your balance has been updated. You can now use your wallet for subscriptions, PPV contents, messages, and calls!
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-900">Blockchain Confirmation</p>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Crypto deposits require network confirmations. You can safely close this window. Your wallet balance will update automatically when confirmed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 sm:p-8 bg-white border-t border-gray-100 flex flex-col sm:flex-row gap-3">
          {payment.nowPaymentsUrl && payment.status !== 'completed' && (
            <a
              href={payment.nowPaymentsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              <span>View Invoice</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => navigate('/wallet')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-rose-500/10 hover:shadow-rose-500/20 transition"
          >
            <span>Go to Wallet</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
