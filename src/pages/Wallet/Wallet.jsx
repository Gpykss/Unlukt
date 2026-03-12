// src/pages/Wallet/Wallet.jsx - $12 minimum top-up, wallet-first system

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Wallet as WalletIcon, TrendingUp, X, MapPin, Loader2, Info } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';

import PaymentModal from '../../components/Payment/PaymentModal';
import SubscribeModal from '../../components/Payment/SubscribeModal';
import { COUNTRIES, getCountryByCode, formatMoney } from '../../utils/currencySupport';

const MIN_TOPUP = 12;

export default function Wallet() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);
  const [balance, setBalance] = useState({ available: 0, total: 0 });
  const [showAmountInput, setShowAmountInput] = useState(false);
  const [topUpAmountUSD, setTopUpAmountUSD] = useState('');
  const [userLocation, setUserLocation] = useState({ countryCode: null, countryName: null, currency: 'USD' });
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState('NG');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // ✅ Subscribe modal state
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subscribeCreator, setSubscribeCreator] = useState(null);

  const user = auth.currentUser;

  // ✅ Handle subscribe action from navigation state
  useEffect(() => {
    const state = location.state;
    if (state?.action === 'subscribe' && state?.creatorId) {
      // Load creator data and show subscribe modal
      const loadCreatorForSubscribe = async () => {
        try {
          const creatorDoc = await getDoc(doc(db, 'users', state.creatorId));
          if (creatorDoc.exists()) {
            const creatorData = creatorDoc.data();
            setSubscribeCreator({
              uid: state.creatorId,
              name: state.creatorName || creatorData.displayName || 'Creator',
              avatar: creatorData.avatar || creatorData.profilePicture,
              subscriptionPrice: state.monthlyPrice || creatorData.subscriptionPrice || 9.99,
            });
            setShowSubscribeModal(true);
          }
        } catch (e) {
          console.error('Error loading creator for subscribe:', e);
        }
      };
      loadCreatorForSubscribe();
      
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchUserBalance(), fetchUserLocation()]);
      setLoading(false);
    };
    init();
  }, []);

  const fetchUserBalance = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;
      const balanceDoc = await getDoc(doc(db, 'user_balances', u.uid));
      if (balanceDoc.exists()) {
        const v = Number(balanceDoc.data().balance || 0);
        setBalance({ available: v, total: v });
      } else {
        setBalance({ available: 0, total: 0 });
      }
    } catch (e) {
      console.error('Error fetching balance:', e);
      setBalance({ available: 0, total: 0 });
    }
  };

  const fetchUserLocation = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      if (!userDoc.exists()) return;
      const loc = userDoc.data().location || null;
      if (loc?.countryCode && loc?.currency) {
        setUserLocation({ countryCode: loc.countryCode, countryName: loc.countryName || null, currency: String(loc.currency).toUpperCase() });
        setSelectedCountryCode(loc.countryCode);
      } else {
        setShowLocationModal(true);
      }
    } catch (e) {
      setShowLocationModal(true);
    }
  };

  const saveLocation = async () => {
    try {
      if (!user) return;
      setSavingLocation(true);
      const selected = getCountryByCode(selectedCountryCode);
      if (!selected) { alert('Invalid country selection'); return; }
      await updateDoc(doc(db, 'users', user.uid), {
        location: { countryCode: selected.code, countryName: selected.name, currency: selected.currency, updatedAt: new Date() },
      });
      setUserLocation({ countryCode: selected.code, countryName: selected.name, currency: selected.currency });
      setShowLocationModal(false);
    } catch (e) {
      alert('Failed to save location. Try again.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleAddFunds = () => {
    if (!userLocation?.countryCode) { setShowLocationModal(true); return; }
    setTopUpAmountUSD('');
    setShowAmountInput(true);
  };

  const amountUSDNum = useMemo(() => Number(topUpAmountUSD || 0), [topUpAmountUSD]);

  const proceedToPay = () => {
    if (!amountUSDNum || amountUSDNum <= 0) return;
    if (amountUSDNum < MIN_TOPUP) {
      alert(`Minimum top-up is $${MIN_TOPUP}.00`);
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
      {/* Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Wallet</h1>
          <button onClick={() => setShowLocationModal(true)} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <MapPin className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

        {/* ✅ How it works banner */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">How your wallet works</p>
            <p className="text-xs text-blue-700 mt-1">
              Fund your wallet (minimum <b>${MIN_TOPUP}</b>) and use your balance for all services — PPV messages, video calls, voice calls, subscriptions, and tips. All payments are instant with no waiting.
            </p>
          </div>
        </div>

        {/* Location card */}
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5 flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">Location</p>
            <p className="text-lg font-bold text-gray-900">{userLocation?.countryName || 'Not set'}</p>
            <p className="text-sm text-gray-600">Currency: <b>{userLocation?.currency || 'USD'}</b></p>
          </div>
          <button onClick={() => setShowLocationModal(true)} className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold text-sm">Change</button>
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
              <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold">Available</span>
            </div>
            <p className="text-white/80 text-sm mb-2">Available Balance</p>
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
              {balance.total > 0 ? 'Ready to spend on services' : `Add min $${MIN_TOPUP} to get started`}
            </p>
          </motion.div>
        </div>

        {/* Services pricing guide */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-gray-800 mb-3">💸 Service Prices (deducted from wallet)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: 'PPV Message', price: 'From $1' },
              { label: 'Voice Call', price: 'From $3' },
              { label: 'Video Call', price: 'From $5' },
              { label: 'Subscription', price: 'Creator set' },
            ].map(({ label, price }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-bold text-gray-900 text-sm mt-1">{price}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Amount input modal */}
      <AnimatePresence>
        {showAmountInput && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setShowAmountInput(false)}>
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Add Funds</h2>
                <button onClick={() => setShowAmountInput(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Min top-up notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex items-start space-x-2">
                <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Minimum top-up is <b>${MIN_TOPUP}.00</b>. Your balance is used for all platform services instantly.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <label className="block text-sm font-semibold text-gray-700">Amount (USD)</label>
                <input
                  type="number"
                  value={topUpAmountUSD}
                  onChange={(e) => setTopUpAmountUSD(e.target.value)}
                  placeholder={`${MIN_TOPUP}.00`}
                  min={MIN_TOPUP}
                  step="1"
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-lg font-semibold"
                />

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {[12, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmountUSD(String(amt))}
                      className={`py-2 rounded-xl text-sm font-semibold border transition ${Number(topUpAmountUSD) === amt ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-gray-500">
                  Paid via crypto (USDT TRC20). Balance reflects in USD.
                </p>
              </div>

              <div className="flex space-x-3">
                <button onClick={() => setShowAmountInput(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition">Cancel</button>
                <button
                  onClick={proceedToPay}
                  disabled={!amountUSDNum || amountUSDNum < MIN_TOPUP}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Continue ${amountUSDNum > 0 ? amountUSDNum.toFixed(2) : '0.00'}
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
        userCountryName={userLocation?.countryName || null}
        userCurrency={userLocation?.currency || 'USD'}
        onSuccess={() => {
          setShowPaymentModal(false);
          setTopUpAmountUSD('');
          fetchUserBalance();
        }}
      />

      {/* ✅ Subscribe Modal */}
      {subscribeCreator && (
        <SubscribeModal
          isOpen={showSubscribeModal}
          onClose={() => {
            setShowSubscribeModal(false);
            setSubscribeCreator(null);
          }}
          creator={subscribeCreator}
          onSuccess={(duration) => {
            setShowSubscribeModal(false);
            setSubscribeCreator(null);
            fetchUserBalance(); // Refresh balance
            alert(`Successfully subscribed! You now have ${duration} access.`);
          }}
        />
      )}

      {/* Location modal */}
      <AnimatePresence>
        {showLocationModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowLocationModal(false)}>
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">Select your location</h2>
                <button onClick={() => setShowLocationModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-600" /></button>
              </div>
              <p className="text-sm text-gray-600 mb-4">We use this to show local payment options when available.</p>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
              <select value={selectedCountryCode} onChange={(e) => setSelectedCountryCode(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500">
                {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.name} ({c.currency})</option>))}
              </select>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowLocationModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition">Cancel</button>
                <button onClick={saveLocation} disabled={savingLocation} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:opacity-60">
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