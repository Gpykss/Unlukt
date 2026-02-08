// src/pages/Wallet/Wallet.jsx - FIXED FOR NGN (NIGERIA)

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft,
  DollarSign, 
  TrendingUp,
  Plus,
  Wallet as WalletIcon,
  AlertCircle,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PaymentModal from '../../components/Payment/PaymentModal';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';

// ✅ NGN to USD conversion rate
const NGN_TO_USD_RATE = 1600; // Update this regularly

export default function Wallet() {
  const navigate = useNavigate();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAmountInput, setShowAmountInput] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(''); // In NGN
  
  // Real balance from Firestore (stored in USD)
  const [balance, setBalance] = useState({ available: 0, total: 0 });
  const [loadingBalance, setLoadingBalance] = useState(true);
  
  // ✅ User's country
  const [userCountry, setUserCountry] = useState(null);

  useEffect(() => {
    fetchUserBalance();
    fetchUserCountry();
  }, []);

  const fetchUserBalance = async () => {
    try {
      setLoadingBalance(true);
      const user = auth.currentUser;
      
      if (!user) {
        console.log('⚠️ No user logged in');
        setLoadingBalance(false);
        return;
      }

      const balanceRef = doc(db, 'user_balances', user.uid);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        setBalance({
          available: data.balance || 0,
          total: data.balance || 0
        });
        console.log('✅ User balance loaded (USD):', data);
      } else {
        setBalance({ available: 0, total: 0 });
        console.log('⚠️ No user balance found');
      }
    } catch (error) {
      console.error('❌ Error fetching user balance:', error);
      setBalance({ available: 0, total: 0 });
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchUserCountry = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const country = userDoc.data().kycData?.country || 'Nigeria';
        setUserCountry(country);
        console.log('✅ User country:', country);
      }
    } catch (error) {
      console.error('❌ Error fetching country:', error);
      setUserCountry('Nigeria'); // Default
    }
  };

  const handleAddFunds = () => {
    setTopUpAmount('');
    setShowAmountInput(true);
  };

  const handleAmountConfirm = () => {
    const amountNGN = parseFloat(topUpAmount);
    
    if (!amountNGN || amountNGN <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    if (amountNGN < 1000) {
      alert('Minimum amount is ₦1,000');
      return;
    }
    
    setShowAmountInput(false);
    setShowPaymentModal(true);
  };

  // ✅ Convert NGN to USD for display
  const convertNGNtoUSD = (ngn) => {
    return ngn / NGN_TO_USD_RATE;
  };

  // ✅ Format currency based on user's country
  const formatCurrency = (amountUSD) => {
    if (userCountry === 'Nigeria') {
      const ngn = amountUSD * NGN_TO_USD_RATE;
      return `₦${ngn.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${amountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/feed')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Wallet</h1>
          <div className="w-9"></div>
        </div>
      </div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block max-w-7xl mx-auto px-6 pt-6">
        <button 
          onClick={() => navigate('/feed')}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Back to Feed</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        
        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          
          {/* Available Balance */}
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
            
            <p className="text-white/80 text-sm mb-2">Available Balance</p>
            
            {loadingBalance ? (
              <div className="h-12 bg-white/20 rounded-lg animate-pulse mb-4"></div>
            ) : (
              <p className="text-4xl font-bold mb-4">{formatCurrency(balance.available)}</p>
            )}
            
            <button
              onClick={handleAddFunds}
              disabled={loadingBalance}
              className="w-full bg-white text-rose-500 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              <span>Add Funds</span>
            </button>
          </motion.div>

          {/* Total Balance */}
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
              <span className="text-green-500 text-sm font-semibold">Balance</span>
            </div>
            
            <p className="text-gray-600 text-sm mb-2">Total Balance</p>
            
            {loadingBalance ? (
              <div className="h-10 bg-gray-200 rounded-lg animate-pulse mb-4"></div>
            ) : (
              <p className="text-3xl font-bold text-gray-900 mb-4">{formatCurrency(balance.total)}</p>
            )}
            
            <p className="text-sm text-gray-500">
              {balance.total > 0 ? 'Your current balance' : 'Add funds to get started'}
            </p>
          </motion.div>
        </div>

        {/* Info Cards */}
        <div className="space-y-4">
          
          {/* Nigeria Info */}
          {userCountry === 'Nigeria' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-start space-x-3">
                <span className="text-2xl">🇳🇬</span>
                <div>
                  <h3 className="font-bold text-green-900 mb-2">Nigeria Payment Methods</h3>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• <strong>Bank Transfer (NGN):</strong> Instant verification, no extra fees</li>
                    <li>• <strong>USDT (TRC20):</strong> 1.5% VAT applies, 24-72 hour verification</li>
                    <li>• All amounts shown in Naira (₦)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Payment Methods Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">Payment Methods</h3>
            <div className="space-y-4">
              
              <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">🏦</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Bank Transfer (NGN)</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {userCountry === 'Nigeria' 
                      ? 'Instant verification • Nigerian banks only' 
                      : 'Not available in your country'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-4 bg-orange-50 rounded-lg">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">₿</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">USDT (TRC20)</p>
                  <p className="text-sm text-gray-600 mt-1">Manual verification • 24-72 hours</p>
                  {userCountry === 'Nigeria' && (
                    <p className="text-sm text-orange-600 font-medium mt-1">+1.5% VAT added</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/discover')}
                className="p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition text-left"
              >
                <p className="font-semibold text-gray-900">Discover Creators</p>
                <p className="text-sm text-gray-600 mt-1">Find creators to support</p>
              </button>
              
              <button
                onClick={handleAddFunds}
                className="p-4 bg-rose-50 hover:bg-rose-100 rounded-xl transition text-left"
              >
                <p className="font-semibold text-rose-600">Add Funds</p>
                <p className="text-sm text-gray-600 mt-1">Top up your wallet</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ AMOUNT INPUT MODAL - IN NGN FOR NIGERIA */}
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
                <button 
                  onClick={() => setShowAmountInput(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {userCountry === 'Nigeria' ? 'Amount (NGN)' : 'Amount (USD)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-semibold text-lg">
                      {userCountry === 'Nigeria' ? '₦' : '$'}
                    </span>
                    <input
                      type="number"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      placeholder={userCountry === 'Nigeria' ? '0.00' : '0.00'}
                      min={userCountry === 'Nigeria' ? '1000' : '5'}
                      step={userCountry === 'Nigeria' ? '100' : '1'}
                      className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-lg font-semibold"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Minimum: {userCountry === 'Nigeria' ? '₦1,000' : '$5.00'}
                  </p>
                  {userCountry === 'Nigeria' && topUpAmount && (
                    <p className="text-xs text-blue-600 mt-1">
                      ≈ ${convertNGNtoUSD(parseFloat(topUpAmount)).toFixed(2)} USD
                    </p>
                  )}
                </div>

                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {userCountry === 'Nigeria' ? (
                    [1000, 5000, 10000, 20000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setTopUpAmount(amount.toString())}
                        className={`py-2 rounded-lg font-semibold text-xs transition ${
                          topUpAmount === amount.toString()
                            ? 'bg-rose-500 text-white'
                            : 'bg-gray-50 hover:bg-rose-50 border border-gray-200 hover:border-rose-500 text-gray-700'
                        }`}
                      >
                        ₦{(amount / 1000).toFixed(0)}k
                      </button>
                    ))
                  ) : (
                    [10, 25, 50, 100].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setTopUpAmount(amount.toString())}
                        className={`py-2 rounded-lg font-semibold text-sm transition ${
                          topUpAmount === amount.toString()
                            ? 'bg-rose-500 text-white'
                            : 'bg-gray-50 hover:bg-rose-50 border border-gray-200 hover:border-rose-500 text-gray-700'
                        }`}
                      >
                        ${amount}
                      </button>
                    ))
                  )}
                </div>

                {userCountry === 'Nigeria' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>🇳🇬 Nigeria:</strong> Crypto payments (USDT) include 1.5% VAT. Bank transfers have no extra fees.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowAmountInput(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAmountConfirm}
                  disabled={!topUpAmount || (userCountry === 'Nigeria' && parseFloat(topUpAmount) < 1000) || (userCountry !== 'Nigeria' && parseFloat(topUpAmount) < 5)}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ✅ PAYMENT MODAL - Pass NGN amount, converted inside */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setTopUpAmount('');
        }}
        amount={userCountry === 'Nigeria' ? convertNGNtoUSD(parseFloat(topUpAmount) || 0) : parseFloat(topUpAmount) || 0}
        contentType="topup"
        onSuccess={() => {
          setShowPaymentModal(false);
          setTopUpAmount('');
          fetchUserBalance();
        }}
      />
    </div>
  );
}
