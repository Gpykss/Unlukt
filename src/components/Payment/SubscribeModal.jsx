// src/components/Payment/SubscribeModal.jsx
// Prices are set independently by creator per duration (daily/weekly/monthly)

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
  getSubscription,
  DURATIONS,
} from '../../services/subscriptionService';
import { getCreatorTiers, DEFAULT_TIERS, getTierBadge } from '../../services/tierService';
import { authUrl, herePath } from '../../utils/authRedirect';

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

export default function SubscribeModal({ isOpen, onClose, creator, initialTier = 'supporter', onSuccess }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [selectedTier, setSelectedTier] = useState(initialTier || 'supporter');
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [selectedDuration, setSelectedDuration] = useState('monthly');
  const [balance, setBalance] = useState(null);
  const [discount, setDiscount] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Fetch creator's configured tiers
  useEffect(() => {
    if (!isOpen || !creator?.uid) return;
    let active = true;
    getCreatorTiers(creator.uid).then(t => {
      if (active && t) {
        setTiers({
          supporter: { ...DEFAULT_TIERS.supporter, ...(t.supporter || {}) },
          vip: { ...DEFAULT_TIERS.vip, ...(t.vip || {}) },
          superfan: { ...DEFAULT_TIERS.superfan, ...(t.superfan || {}) },
        });
      }
    }).catch(err => console.error('Failed to load creator tiers in modal:', err));

    return () => { active = false; };
  }, [isOpen, creator?.uid]);

  useEffect(() => {
    if (initialTier && ['supporter', 'vip', 'superfan'].includes(initialTier)) {
      setSelectedTier(initialTier);
    }
  }, [initialTier, isOpen]);

  // Selected tier price & details
  const activeTierConfig = tiers[selectedTier] || DEFAULT_TIERS[selectedTier] || DEFAULT_TIERS.supporter;
  const tierMonthlyPrice = Number(activeTierConfig.price || 9.99);

  // Creator-set prices for each duration
  const creatorPrices = {
    monthly: tierMonthlyPrice,
    weekly:  creator?.subscriptionPriceWeekly  ?? null,
    daily:   creator?.subscriptionPriceDaily   ?? null,
  };
  const monthlyPrice = tierMonthlyPrice;

  // Only show durations the creator has set a price for (daily/weekly only if supporter tier)
  const availableDurations = Object.entries(DURATIONS).filter(([key]) => {
    if (key === 'monthly') return true; // always show monthly
    if (selectedTier !== 'supporter') return false; // VIP and Superfan are monthly memberships
    return creatorPrices[key] != null && Number(creatorPrices[key]) > 0;
  });

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
      Promise.all([
        getCreatorDiscount(creator.uid),
        currentUser ? getSubscription(currentUser.uid, creator.uid) : Promise.resolve(null),
      ]).then(([data, prevSub]) => {
        if (!data) return;
        // "First month" deals are for new subscribers only (same rule the server charges by)
        const active =
          (data.limited_time?.active && data.limited_time) ||
          (!prevSub && data.first_month?.active && data.first_month) ||
          (data.bundle?.active       && data.bundle)        ||
          null;
        setDiscount(active);
      });
    }
  }, [isOpen, currentUser, creator?.uid]);

  // Get price for a duration using creator-set prices directly
  const getPrice = (duration) => getPriceForDuration(monthlyPrice, duration, discount, creatorPrices);
  const getOriginalPrice = (duration) => getPriceForDuration(monthlyPrice, duration, null, creatorPrices);

  const selectedPrice = getPrice(selectedDuration);
  const hasEnoughBalance = balance !== null && balance >= selectedPrice;

  const getSavings = (duration) => {
    const original   = getOriginalPrice(duration);
    const discounted = getPrice(duration);
    const saved = parseFloat((original - discounted).toFixed(2));

    if (saved > 0.01) {
      return { label: `Save $${saved.toFixed(2)}`, original };
    }

    if (duration === 'daily' || !creatorPrices?.daily) return null;
    const dailyRate     = getOriginalPrice('daily');
    const daysEquiv     = dailyRate * DURATIONS[duration].days;
    const actualPrice   = getPrice(duration);
    const altSaved      = parseFloat((daysEquiv - actualPrice).toFixed(2));
    if (altSaved > 0.01) return { label: `Save $${altSaved.toFixed(2)}`, original: null };

    return null;
  };

  const handleSubscribe = async () => {
    if (!currentUser) { navigate(authUrl(herePath())); return; }
    if (!hasEnoughBalance) {
      navigate('/wallet', { state: { returnTo: window.location.pathname } });
      onClose();
      return;
    }
    setError('');
    try {
      setSubscribing(true);
      await subscribeToCreator(
        currentUser.uid,
        creator.uid,
        selectedDuration,
        monthlyPrice,
        discount,
        creatorPrices,
        selectedTier,
        selectedPrice
      );
      setSuccess(true);
      if (onSuccess) onSuccess(selectedDuration, selectedTier);
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
      {/* Overlay — always centered on all screen sizes */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: '92dvh' }}
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
              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 min-h-0">

                {/* Drag handle for mobile */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                  <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
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

                {/* 3-Tier Membership Selector (PRD 16.1 & 16.2) */}
                <div className="px-5 mb-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      Select Membership Tier
                    </p>
                    <span className="text-[11px] text-rose-500 font-semibold">Tiers & Badges</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'supporter', name: 'Supporter', icon: '🌱', badge: '🌱 Supporter', color: 'border-emerald-500 bg-emerald-50/50' },
                      { key: 'vip', name: 'VIP', icon: '⭐', badge: '⭐ VIP', color: 'border-purple-500 bg-purple-50/50' },
                      { key: 'superfan', name: 'Superfan', icon: '👑', badge: '👑 Superfan', color: 'border-amber-500 bg-amber-50/50' },
                    ].map(t => {
                      const tierData = tiers[t.key] || DEFAULT_TIERS[t.key];
                      const isSelected = selectedTier === t.key;
                      const price = Number(tierData?.price || (t.key === 'superfan' ? 49.99 : t.key === 'vip' ? 19.99 : 9.99));

                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => {
                            setSelectedTier(t.key);
                            setSelectedDuration('monthly');
                          }}
                          className={`relative p-2.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
                            isSelected
                              ? `${t.color} border-rose-500 shadow-xs ring-1 ring-rose-400/30`
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-base">{t.icon}</span>
                              {isSelected && (
                                <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">✓</span>
                              )}
                            </div>
                            <p className="font-bold text-xs text-gray-900 mt-1 leading-tight">{t.name}</p>
                          </div>
                          <p className="font-extrabold text-xs sm:text-sm text-gray-900 mt-2">
                            ${price.toFixed(2)}<span className="text-[10px] text-gray-500 font-normal">/mo</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration selector (only if available for supporter) */}
                {availableDurations.length > 1 && selectedTier === 'supporter' && (
                  <div className="px-5 mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                    <div className="space-y-2">
                      {availableDurations.map(([key, dur]) => {
                        const price    = getPrice(key);
                        const savings  = getSavings(key);
                        const isSelected = selectedDuration === key;
                        return (
                          <button key={key} onClick={() => setSelectedDuration(key)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 transition ${
                              isSelected ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}>
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <div className={`flex-shrink-0 ${isSelected ? 'text-rose-500' : 'text-gray-400'}`}>
                                {DURATION_ICONS[key]}
                              </div>
                              <div className="text-left min-w-0">
                                <p className={`font-bold text-xs ${isSelected ? 'text-rose-700' : 'text-gray-800'}`}>{dur.label}</p>
                                <p className="text-[10px] text-gray-500">{dur.badge}</p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2 flex-shrink-0">
                              {savings && (
                                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200 whitespace-nowrap">
                                  {savings.label}
                                </span>
                              )}
                              <p className={`font-bold text-sm ${isSelected ? 'text-rose-600' : 'text-gray-900'}`}>${price.toFixed(2)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tier Perks & Badge Included */}
                <div className="mx-5 mb-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700">Tier Benefits:</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white border border-gray-200 shadow-2xs">
                      Badge: {selectedTier === 'superfan' ? '👑 Superfan' : selectedTier === 'vip' ? '⭐ VIP' : '🌱 Supporter'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {(activeTierConfig.benefits && activeTierConfig.benefits.length > 0
                      ? activeTierConfig.benefits
                      : DURATION_PERKS[selectedDuration]
                    ).map((perk, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
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

              {/* CTA — always pinned at bottom */}
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