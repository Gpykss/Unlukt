// src/components/Payment/PaymentModal.jsx - CRYPTO ONLY

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Copy, CheckCircle, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import cryptoService from '../../services/crypto.service';

export default function PaymentModal({
  isOpen,
  onClose,
  amountUSD = 0,
  contentType = 'subscription',
  contentId = null,
  creatorId = null,
  userCountryName = 'Unknown',
  onSuccess
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentData, setPaymentData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) {
      setPaymentData(null);
      setError('');
      setCopied(false);
    }
  }, [isOpen]);

  const initializeCryptoPayment = async () => {
    if (!currentUser?.uid) {
      setError('Please login to continue');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await cryptoService.initializeUSDTPayment({
        amount: Number(amountUSD),
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        contentId,
        contentType,
        creatorId,
        userCountry: userCountryName || 'Unknown'
      });

    // ✅ REDIRECT TO NOWPAYMENTS
    if (result.paymentUrl) {
      console.log('🔵 Redirecting to:', result.paymentUrl);
      window.location.href = result.paymentUrl;
    } else {
      setError('Payment URL not received');
    }
    
  } catch (err) {
    console.error('Payment initialization error:', err);
    setError(err.message || 'Failed to initialize payment');
  } finally {
    setLoading(false);
  }
};

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goToUploadProof = () => {
    if (paymentData?.paymentId) {
      navigate(`/upload-proof/${paymentData.paymentId}`);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-7"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {paymentData ? 'Payment Instructions' : 'Pay with Crypto'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Amount Display */}
          {(() => {
            const baseAmount = Number(amountUSD || 0);
            const feeAmount = Number((baseAmount * 0.015).toFixed(2));
            const totalAmount = Number((baseAmount + feeAmount).toFixed(2));
            return (
              <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 mb-5 text-white space-y-2 shadow-inner">
                <div className="flex justify-between items-center border-b border-white/20 pb-2">
                  <span className="text-sm opacity-90">Subtotal:</span>
                  <span className="font-semibold">${baseAmount.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/20 pb-2">
                  <span className="text-sm opacity-90">Crypto Fee (1.5%):</span>
                  <span className="font-semibold">${feeAmount.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm opacity-90 font-medium">Total to Pay:</span>
                  <span className="text-3xl font-bold">${totalAmount.toFixed(2)} USD</span>
                </div>
                <p className="text-xs opacity-75 mt-1 text-right">Select any supported cryptocurrency next</p>
              </div>
            );
          })()}

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          {!paymentData ? (
            // Step 1: Initialize Payment
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Payment Process:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Click "Initialize Payment" below</li>
                  <li>Select your preferred coin on the payment page</li>
                  <li>Send the exact crypto amount to the address shown</li>
                  <li>Your wallet will be credited automatically once confirmed</li>
                </ol>
              </div>

              <button
                onClick={initializeCryptoPayment}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Wallet className="w-5 h-5" />
                )}
                <span>{loading ? 'Initializing...' : 'Initialize Payment'}</span>
              </button>
            </div>
          ) : (
            // Step 2: Payment Details
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <CheckCircle className="w-5 h-5" />
                  <p className="font-semibold">Payment Initialized</p>
                </div>
                <p className="text-sm text-green-700">
                  Reference: <span className="font-mono">{paymentData.reference}</span>
                </p>
              </div>

              {/* Wallet Address */}
              <div className="border-2 border-gray-200 rounded-xl p-4">
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Send USDT to this address:
                </label>
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                  <code className="flex-1 text-sm font-mono break-all text-gray-900">
                    {paymentData.walletAddress}
                  </code>
                  <button
                    onClick={() => copyToClipboard(paymentData.walletAddress)}
                    className="flex-shrink-0 p-2 hover:bg-gray-200 rounded-lg transition"
                  >
                    {copied ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Important:</h3>
                <ul className="text-sm text-yellow-800 space-y-1.5">
                  <li>• Send exactly <strong>${paymentData.amount} USDT</strong></li>
                  <li>• Use <strong>TRC20 network</strong> only</li>
                  <li>• Wrong network = lost funds</li>
                  <li>• Payment expires in 1 hour</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <button
                onClick={goToUploadProof}
                className="w-full px-4 py-3.5 rounded-2xl font-semibold bg-gray-900 hover:bg-black text-white transition"
              >
                I've Sent Payment - Upload Proof
              </button>

              <p className="text-xs text-center text-gray-500">
                Admin will verify your payment within 24-72 hours
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
