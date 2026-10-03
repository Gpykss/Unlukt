// src/components/feed/PostUnlockSheet.jsx
// Implements PRD Section 15.3: Inline checkout bottom sheet for feed post unlocks.
// Atomic double-entry ledger backend call (zero direct client writes).
// Styled in Unlukt's clean, light design system.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Lock, Wallet, CheckCircle, ArrowRight, 
  Crown, Sparkles, AlertCircle, Loader2, Plus 
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { functions } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { getWalletBalance } from '../../services/walletService';

export default function PostUnlockSheet({
  isOpen,
  onClose,
  post,
  creator,
  onUnlocked,
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);

  const price = Number(post?.price || 0);
  const postType = post?.type || 'paid';
  const isSubscribersOnly = postType === 'subscribers';
  const subPrice = Number(creator?.subscriptionPriceMonthly || creator?.subscriptionPrice || 9.99);

  useEffect(() => {
    if (isOpen && currentUser) {
      setError('');
      setSuccess(false);
      setShowTopUpPrompt(false);
      getWalletBalance(currentUser.uid)
        .then((bal) => setBalance(Number(bal || 0)))
        .catch(() => setBalance(0));
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !post) return null;

  const hasEnough = balance !== null && balance >= price;
  const balanceAfter = balance !== null ? Math.max(0, balance - price) : 0;
  const deficit = balance !== null ? Math.max(0, price - balance) : price;

  const handleConfirmUnlock = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (!hasEnough) {
      setShowTopUpPrompt(true);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const unlockCallable = httpsCallable(functions, 'unlock');
      const response = await unlockCallable({ postId: post.id });

      if (response?.data?.success || response?.data?.alreadyUnlocked) {
        setSuccess(true);
        setBalance(balanceAfter);
        setTimeout(() => {
          if (onUnlocked) onUnlocked();
          onClose();
        }, 1100);
      } else {
        throw new Error('Unlock confirmation failed.');
      }
    } catch (err) {
      console.error('Unlock error:', err);
      const code = err?.code || '';
      const msg = err?.message || 'Failed to unlock post.';
      if (msg.includes('INSUFFICIENT_FUNDS') || code.includes('failed-precondition')) {
        setError('Insufficient balance. Please top up your wallet.');
        setShowTopUpPrompt(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTopUpNavigate = () => {
    onClose();
    navigate('/wallet', {
      state: {
        returnPostId: post.id,
        suggestedAmount: Math.ceil(deficit > 0 ? deficit : 10),
      },
    });
  };

  const handleSubscribeNavigate = () => {
    onClose();
    navigate('/wallet', {
      state: {
        action: 'subscribe',
        creatorId: post?.userId,
        creatorName: creator?.displayName || 'this creator',
        monthlyPrice: subPrice,
      },
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Centered Modal Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl p-6 shadow-2xl z-10 text-gray-900 mx-auto my-auto max-h-[90vh] overflow-y-auto"
        >

          {/* Success View */}
          {success ? (
            <div className="py-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 220 }}
                className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-9 h-9" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900">Post Unlocked!</h3>
              <p className="text-sm text-gray-500 mt-1">Enjoy the exclusive content</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-rose-100 ring-2 ring-rose-200 flex-shrink-0 flex items-center justify-center text-lg font-bold text-rose-600">
                    {creator?.profilePicture || creator?.avatar ? (
                      <img
                        src={creator.profilePicture || creator.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{creator?.displayName?.charAt(0) || '👤'}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 leading-snug">
                      {isSubscribersOnly ? 'Subscriber Exclusive' : 'Unlock Paid Post'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      by {creator?.displayName || 'Creator'} (@{creator?.username || 'user'})
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Price Callout */}
              {!isSubscribersOnly && (
                <div className="my-5 p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50/50 border border-rose-100 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                    Unlock Price
                  </span>
                  <div className="text-3xl font-extrabold text-gray-900 mt-0.5">
                    ${price.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Instant, permanent access to this post
                  </p>
                </div>
              )}

              {/* Balance & Deduction summary */}
              {!isSubscribersOnly && (
                <div className="mb-4 p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-sm">
                  <div className="flex items-center justify-between text-gray-600">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-gray-500" />
                      <span>Wallet Balance</span>
                    </div>
                    <span className="font-bold text-gray-900">
                      ${balance !== null ? balance.toFixed(2) : '...'}
                    </span>
                  </div>

                  {hasEnough && (
                    <div className="mt-2 pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
                      <span>Balance after unlock:</span>
                      <span className="font-semibold text-emerald-600">
                        ${balanceAfter.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5">
                {!isSubscribersOnly && (
                  hasEnough ? (
                    <button
                      onClick={handleConfirmUnlock}
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-2xl font-bold bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white shadow-sm hover:shadow transition flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Unlocking...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Unlock Now • ${price.toFixed(2)}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleTopUpNavigate}
                      className="w-full py-3.5 px-4 rounded-2xl font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Top Up Wallet (+${deficit.toFixed(2)} needed)</span>
                    </button>
                  )
                )}

                {/* Subscription option: always offer subscribe to save */}
                <button
                  onClick={handleSubscribeNavigate}
                  className={`w-full py-3 px-4 rounded-2xl font-semibold border transition flex items-center justify-center gap-2 active:scale-[0.99] text-sm ${
                    isSubscribersOnly
                      ? 'bg-purple-600 hover:bg-purple-700 text-white border-transparent shadow-sm'
                      : 'bg-white hover:bg-gray-50 text-gray-800 border-gray-200'
                  }`}
                >
                  <Crown className="w-4 h-4 text-purple-400" />
                  <span>
                    Subscribe • ${subPrice.toFixed(2)}/mo for all posts
                  </span>
                </button>
              </div>

              {/* Micro guarantee footer */}
              <p className="text-[11px] text-gray-400 text-center mt-4">
                Secured via double-entry crypto ledger. No recurring charge on post unlocks.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
