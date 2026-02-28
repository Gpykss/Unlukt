// src/pages/Wallet/Wallet.jsx

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Wallet as WalletIcon, TrendingUp, X, MapPin, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';

import PaymentModal from '../../components/Payment/PaymentModal';
import { COUNTRIES, getCountryByCode, formatMoney } from '../../utils/currencySupport';

export default function Wallet() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);

  const [balance, setBalance] = useState({ available: 0, total: 0 }); // stored in USD
  const [showAmountInput, setShowAmountInput] = useState(false);
  const [topUpAmountUSD, setTopUpAmountUSD] = useState('');

  // Location (country + currency)
  const [location, setLocation] = useState({
    countryCode: null,
    countryName: null,
    currency: 'USD',
  });

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState('NG');

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const user = auth.currentUser;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchUserBalance(), fetchUserLocation()]);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserBalance = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;

      const balanceRef = doc(db, 'user_balances', u.uid);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        const v = Number(data.balance || 0);
        setBalance({ available: v, total: v });
      } else {
        setBalance({ available: 0, total: 0 });
      }
    } catch (e) {
      console.error('❌ Error fetching user balance:', e);
      setBalance({ available: 0, total: 0 });
    }
  };

  const fetchUserLocation = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;

      const userDoc = await getDoc(doc(db, 'users', u.uid));
      if (!userDoc.exists()) return;

      const data = userDoc.data();
      const loc = data.location || null;

      if (loc?.countryCode && loc?.currency) {
        setLocation({
          countryCode: loc.countryCode,
          countryName: loc.countryName || getCountryByCode(loc.countryCode)?.name || null,
          currency: String(loc.currency || 'USD').toUpperCase(),
        });
        setSelectedCountryCode(loc.countryCode);
      } else {
        // force location selection (MVP)
        setShowLocationModal(true);
      }
    } catch (e) {
      console.error('❌ Error fetching user location:', e);
      setShowLocationModal(true);
    }
  };

  const saveLocation = async () => {
    try {
      if (!user) return;

      setSavingLocation(true);

      const selected = getCountryByCode(selectedCountryCode);
      if (!selected) {
        alert('Invalid country selection');
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        location: {
          countryCode: selected.code,
          countryName: selected.name,
          currency: selected.currency,
          updatedAt: new Date(),
        },
      });

      setLocation({
        countryCode: selected.code,
        countryName: selected.name,
        currency: selected.currency,
      });

      setShowLocationModal(false);
    } catch (e) {
      console.error('❌ Failed to save location:', e);
      alert('Failed to save location. Try again.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleAddFunds = () => {
    if (!location?.countryCode) {
      setShowLocationModal(true);
      return;
    }
    setTopUpAmountUSD('');
    setShowAmountInput(true);
  };

  const amountUSDNum = useMemo(() => Number(topUpAmountUSD || 0), [topUpAmountUSD]);

  const proceedToPay = () => {
    if (!amountUSDNum || amountUSDNum <= 0) return;
    if (amountUSDNum < 5) {
      alert('Minimum top up is $5.00');
      return;
    }
    setShowAmountInput(false);
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Wallet</h1>
          <button
            onClick={() => setShowLocationModal(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Change location"
          >
            <MapPin className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Location card */}
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5 flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">Location</p>
            <p className="text-lg font-bold text-gray-900">
              {location?.countryName || 'Not set'}
            </p>
            <p className="text-sm text-gray-600">
              Currency: <b>{location?.currency || 'USD'}</b>
            </p>
          </div>
          <button
            onClick={() => setShowLocationModal(true)}
            className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold text-sm"
          >
            Change
          </button>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <WalletIcon className="w-8 h-8" />
              <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold">
                Available
              </span>
            </div>

            <p className="text-white/80 text-sm mb-2">Available Balance (stored in USD)</p>
            <p className="text-4xl font-bold mb-4">{formatMoney(balance.available, 'USD')}</p>

            <button
              onClick={handleAddFunds}
              className="w-full bg-white text-rose-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Funds
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-50 rounded-xl">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <span className="text-green-600 text-sm font-semibold">Balance</span>
            </div>

            <p className="text-gray-600 text-sm mb-2">Total Balance</p>
            <p className="text-3xl font-bold text-gray-900 mb-4">{formatMoney(balance.total, 'USD')}</p>

            <p className="text-sm text-gray-500">
              {balance.total > 0 ? 'Your current balance' : 'Add funds to get started'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Amount input modal (USD base) */}
      <AnimatePresence>
        {showAmountInput && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
            onClick={() => setShowAmountInput(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Enter Amount</h2>
                <button onClick={() => setShowAmountInput(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <label className="block text-sm font-semibold text-gray-700">Amount (USD)</label>
                <input
                  type="number"
                  value={topUpAmountUSD}
                  onChange={(e) => setTopUpAmountUSD(e.target.value)}
                  placeholder="0.00"
                  min="5"
                  step="1"
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-lg font-semibold"
                />
                <p className="text-xs text-gray-500">
                  Minimum: $5.00 • We’ll convert to {location?.currency || 'USD'} via Korapay rate + your markup (if supported).
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowAmountInput(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedToPay}
                  disabled={!amountUSDNum || amountUSDNum < 5}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amountUSD={amountUSDNum}
        contentType="topup"
        // 👇 optional: helps PaymentModal default to user wallet location if you update it to use these
        userCountryName={location?.countryName || null}
        userCurrency={location?.currency || 'USD'}
        onSuccess={() => {
          setShowPaymentModal(false);
          setTopUpAmountUSD('');
          // optionally refresh balance after webhook confirms
          // fetchUserBalance();
        }}
      />

      {/* Location modal (required) */}
      <AnimatePresence>
        {showLocationModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowLocationModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">Select your location</h2>
                <button onClick={() => setShowLocationModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                We use this to show local payment options when available.
              </p>

              <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
              <select
                value={selectedCountryCode}
                onChange={(e) => setSelectedCountryCode(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveLocation}
                  disabled={savingLocation}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:opacity-60"
                >
                  {savingLocation ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
