// src/components/Payment/SubscribeModal.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Zap, Clock, Calendar, Wallet, Loader2,
  CheckCircle, AlertCircle, Crown, Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getWalletBalance } from '../../services/walletService';
import {
  subscribeToCreator,
  getPriceForDuration,
  getCreatorDiscount,
  DURATIONS
} from '../../services/subscriptionService';

const DURATION_ICONS = {
  daily:   <Zap className="w-5 h-5" />,
  weekly:  <Clock className="w-5 h-5" />,
  monthly: <Calendar className="w-5 h-5" />,
};

const DURATION_PERKS = {
  daily:   ['Full access for 24 hours', 'All subscriber posts', 'DM access'],
  weekly:  ['Full access for 7 days', 'All subscriber posts', 'DM access', 'Save vs daily'],
  monthly: ['Full access for 30 days', 'All subscriber posts', 'DM access', 'Best value'],
};

export default function SubscribeModal({ isOpen, onClose, creator, onSuccess }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [selectedDuration, setSelectedDuration] = useState('monthly');
  const [balance, setBalance] = useState(null);
  const [discount, setDiscount] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const monthlyPrice = Number(creator?.subscriptionPrice || creator?.price || 9.99);

  useEffect(() => {
    if (!isOpen) {
      setSuccess(false);
      setError('');
      setSelectedDuration('monthly');
      return;
    }
    if (currentUser) {
      getWalletBalance(currentUser.uid).then(setBalance);
    }
    if (creator?.uid) {
      getCreatorDiscount(creator.uid).then(data => {
        if (!data) return;
        const active =
          (data.limited_time?.active && data.limited_time) ||
          (data.first_month?.active && data.first_month) ||
          (data.bundle?.active && data.bundle) ||
          null;
        setDiscount(active);
      });
    }
  }, [isOpen, currentUser, creator?.uid]);

  const getPrice = (duration) => getPriceForDuration(monthlyPrice, duration, discount);
  const selectedPrice = getPrice(selectedDuration);
  const hasEnoughBalance = balance !== null && balance >= selectedPrice;

  const getSavings = (duration) => {
    if (duration === 'daily') return null;
    const dailyEquivalent = getPrice('daily') * DURATIONS[duration].days;
    const actual = getPrice(duration);
    const saved = dailyEquivalent - actual;
    if (saved <= 0.01) return null;
    return `Save $${saved.toFixed(2)}`;
  };

  const handleSubscribe = async () => {
    if (!currentUser) { navigate('/login'); return; }
    if (!hasEnoughBalance) {
      navigate('/wallet', { state: { returnTo: window.location.pathname } });
      onClose();
      return;
    }
    setError('');
    try {
      setSubscribing(true);
      await subscribeToCreator(currentUser.uid, creator.uid, selectedDuration, monthlyPrice, discount);
      setSuccess(true);
      if (onSuccess) onSuccess(selectedDuration);
    } catch (e) {
      setError(e.message || 'Failed to subscribe. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleClose = () => {
    if (subscribing) return;
    setSuccess(false);
    setError('');
    onClose();
  };

  if (!isOpen || !creator) return null;

  return (
    <AnimatePresence>
      {/* ✅ FIXED: always centered, paddingBottom clears mobile nav */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom) + 64px)' }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          // ✅ FIXED: max height with scroll so buttons always visible
          className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: 'calc(100dvh - 120px)' }}
        >
          {success ? (
            <div className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-10 h-10 text-rose-500" />
              </motion.div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Subscribed! 🎉</h3>
              <p className="text-gray-600 mb-1">
                You now have <span className="font-bold">{DURATIONS[selectedDuration].label}</span> access to{' '}
                <span className="font-bold">{creator.name || creator.displayName}</span>
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Valid for {DURATIONS[selectedDuration].days} day{DURATIONS[selectedDuration].days > 1 ? 's' : ''}
              </p>
              <button onClick={handleClose} className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition">
                Start Exploring
              </button>
            </div>
          ) : (
            <>
              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center text-xl flex-shrink-0">
                      {creator.avatar
                        ? <img src={creator.avatar} alt="" className="w-full h-full object-cover" />
                        : '👤'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-tight">
                        {creator.name || creator.displayName}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-rose-400" /> Subscribe for access
                      </p>
                    </div>
                  </div>
                  <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* Wallet balance */}
                <div className={`mx-5 mb-4 px-4 py-2.5 rounded-xl flex items-center justify-between text-sm ${
                  balance !== null && !hasEnoughBalance
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 font-medium">
                      Balance: <span className="text-gray-900 font-bold">
                        ${balance !== null ? balance.toFixed(2) : '...'}
                      </span>
                    </span>
                  </div>
                  {balance !== null && !hasEnoughBalance && (
                    <button onClick={() => { handleClose(); navigate('/wallet'); }}
                      className="text-xs font-bold text-rose-600 underline">
                      Add Funds
                    </button>
                  )}
                </div>

                {/* Discount banner */}
                {discount?.active && (
                  <div className="mx-5 mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-sm font-bold text-green-800">
                      🎉 {discount.percent}% off
                      {discount.type === 'first_month' ? ' your first month' : ''}
                      {discount.type === 'bundle' ? ` — ${discount.bundleMonths} months for ${discount.bundlePriceMonths}` : ''}
                      {discount.label ? ` · ${discount.label}` : ''}
                      {discount.type === 'limited_time' && discount.expiresAt
                        ? ` · Ends ${new Date(discount.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : ''}
                    </p>
                  </div>
                )}

                {/* Duration selector */}
                <div className="px-5 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Choose duration</p>
                  <div className="space-y-2">
                    {Object.entries(DURATIONS).map(([key, dur]) => {
                      const price = getPrice(key);
                      const savings = getSavings(key);
                      const isSelected = selectedDuration === key;
                      return (
                        <button key={key} onClick={() => setSelectedDuration(key)}
                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition ${
                            isSelected ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}>
                          <div className="flex items-center space-x-3">
                            <div className={isSelected ? 'text-rose-500' : 'text-gray-400'}>
                              {DURATION_ICONS[key]}
                            </div>
                            <div className="text-left">
                              <p className={`font-bold text-sm ${isSelected ? 'text-rose-700' : 'text-gray-800'}`}>
                                {dur.label}
                              </p>
                              <p className="text-xs text-gray-500">{dur.badge}</p>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            {savings && (
                              <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                {savings}
                              </span>
                            )}
                            <p className={`font-bold text-base ${isSelected ? 'text-rose-600' : 'text-gray-900'}`}>
                              ${price.toFixed(2)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Perks */}
                <div className="mx-5 mb-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">What you get:</p>
                  <div className="space-y-1">
                    {DURATION_PERKS[selectedDuration].map(perk => (
                      <div key={perk} className="flex items-center space-x-2">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <p className="text-xs text-gray-700">{perk}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="mx-5 mb-4 flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              {/* ✅ FIXED: CTA always pinned at bottom, never hidden */}
              <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                {!hasEnoughBalance && balance !== null ? (
                  <button
                    onClick={() => { handleClose(); navigate('/wallet'); }}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition flex items-center justify-center space-x-2"
                  >
                    <Wallet className="w-5 h-5" />
                    <span>Add Funds to Subscribe</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing || balance === null}
                    className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold transition flex items-center justify-center space-x-2"
                  >
                    {subscribing
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <><Lock className="w-5 h-5" /><span>Subscribe • ${selectedPrice.toFixed(2)}</span></>
                    }
                  </button>
                )}
                <p className="text-center text-xs text-gray-400 mt-2">
                  Deducted from your wallet instantly. Cancel anytime.
                </p>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}