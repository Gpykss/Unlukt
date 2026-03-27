// src/components/Modals/TipModal.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Wallet, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { doc, updateDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';

const QUICK_AMOUNTS = [1, 2, 5, 10, 20, 50];

const GIFTS = [
  { id: 'heart',   emoji: '❤️',  name: 'Heart',   price: 1  },
  { id: 'fire',    emoji: '🔥',  name: 'Fire',    price: 2  },
  { id: 'rose',    emoji: '🌹',  name: 'Rose',    price: 5  },
  { id: 'crown',   emoji: '👑',  name: 'Crown',   price: 10 },
  { id: 'diamond', emoji: '💎',  name: 'Diamond', price: 20 },
  { id: 'rocket',  emoji: '🚀',  name: 'Rocket',  price: 50 },
];

export default function TipModal({ isOpen, onClose, creator }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [tab, setTab] = useState('gifts');
  const [selectedGift, setSelectedGift] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      getWalletBalance(currentUser.uid).then(setBalance);
    } else if (!isOpen) {
      setBalance(null);
      setSuccess(false);
      setError('');
      setSelectedGift(null);
      setSelectedAmount(null);
      setCustomAmount('');
      setMessage('');
      setTab('gifts');
    }
  }, [isOpen, currentUser]);

  const getTipAmount = () => {
    if (tab === 'gifts' && selectedGift) return selectedGift.price;
    if (tab === 'custom' && selectedAmount) return selectedAmount;
    if (tab === 'custom' && customAmount) return parseFloat(customAmount);
    return 0;
  };

  const tipAmount = getTipAmount();
  const creatorEarns = tipAmount * 0.8;

  const handleSend = async () => {
    if (!currentUser) { navigate('/login'); return; }
    if (!tipAmount || tipAmount <= 0) { setError('Please select a tip amount'); return; }
    if (tipAmount < 1) { setError('Minimum tip is $1.00'); return; }
    setError('');
    try {
      setSending(true);
      await deductFromWallet(
        currentUser.uid,
        tipAmount,
        `Tip to ${creator?.name || 'creator'}${selectedGift ? ` (${selectedGift.emoji} ${selectedGift.name})` : ''}`,
        { contentType: 'tip', creatorId: creator?.uid, giftId: selectedGift?.id || null, tipMessage: message || null }
      );
      const earning = tipAmount * 0.8;
      const creatorBalRef = doc(db, 'creator_balances', creator.uid);
      try {
        await updateDoc(creatorBalRef, { pendingBalance: increment(earning), totalEarnings: increment(earning), updatedAt: serverTimestamp() });
      } catch {
        await setDoc(creatorBalRef, { creatorId: creator.uid, availableBalance: 0, pendingBalance: earning, totalEarnings: earning, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      await setDoc(doc(db, 'tips', `${currentUser.uid}_${creator.uid}_${Date.now()}`), {
        fromUserId: currentUser.uid, toCreatorId: creator.uid, amount: tipAmount,
        creatorEarning: earning, platformFee: tipAmount * 0.2,
        giftId: selectedGift?.id || null, giftEmoji: selectedGift?.emoji || null,
        giftName: selectedGift?.name || null, message: message || null, createdAt: serverTimestamp(),
      });
      setSuccess(true);
      setBalance(prev => prev - tipAmount);
    } catch (e) {
      setError(e.message || 'Failed to send tip');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSuccess(false); setError(''); setSelectedGift(null);
    setSelectedAmount(null); setCustomAmount(''); setMessage('');
    setTab('gifts'); onClose();
  };

  if (!isOpen || !creator) return null;

  return (
    <AnimatePresence>
      {/* ✅ FIXED: always centered on screen, above bottom nav */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
          style={{ maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto' }}
        >
          {success ? (
            <div className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                {selectedGift
                  ? <span className="text-4xl">{selectedGift.emoji}</span>
                  : <CheckCircle className="w-10 h-10 text-green-500" />}
              </motion.div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedGift ? `${selectedGift.emoji} Sent!` : 'Tip Sent!'}
              </h3>
              <p className="text-gray-600 mb-1">
                You sent <span className="font-bold text-rose-600">${tipAmount.toFixed(2)}</span> to{' '}
                <span className="font-bold">{creator.name}</span>
              </p>
              <p className="text-sm text-gray-400 mb-6">They'll receive ${creatorEarns.toFixed(2)} after platform fee</p>
              <button onClick={handleClose} className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center text-lg flex-shrink-0">
                    {creator.avatar
                      ? <img src={creator.avatar} alt="" className="w-full h-full object-cover" />
                      : '👤'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Send a gift</p>
                    <p className="text-xs text-gray-500">to {creator.name}</p>
                  </div>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Balance */}
              <div className={`mx-5 mb-4 px-4 py-2.5 rounded-xl flex items-center justify-between text-sm ${
                balance !== null && balance < 1 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 font-medium">
                    Balance: <span className="text-gray-900 font-bold">${balance !== null ? balance.toFixed(2) : '...'}</span>
                  </span>
                </div>
                {balance !== null && balance < 1 && (
                  <button onClick={() => { handleClose(); navigate('/wallet'); }} className="text-xs font-bold text-rose-600 underline">
                    Add Funds
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex mx-5 mb-4 bg-gray-100 rounded-xl p-1">
                {[{ id: 'gifts', label: '🎁 Gifts' }, { id: 'custom', label: '💵 Custom' }].map(t => (
                  <button key={t.id} onClick={() => { setTab(t.id); setSelectedGift(null); setSelectedAmount(null); setCustomAmount(''); }}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="px-5 pb-5">
                {/* Gifts grid */}
                {tab === 'gifts' && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {GIFTS.map(gift => (
                      <button key={gift.id} onClick={() => setSelectedGift(gift)}
                        className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition ${
                          selectedGift?.id === gift.id ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}>
                        <span className="text-3xl mb-1">{gift.emoji}</span>
                        <span className="text-xs font-semibold text-gray-700">{gift.name}</span>
                        <span className="text-xs font-bold text-rose-600 mt-0.5">${gift.price}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom amount */}
                {tab === 'custom' && (
                  <div className="mb-4">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {QUICK_AMOUNTS.map(amt => (
                        <button key={amt} onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                          className={`py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                            selectedAmount === amt ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}>
                          ${amt}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input type="number" value={customAmount} onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                        placeholder="Enter custom amount" min="1" step="0.01"
                        className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-semibold" />
                    </div>
                  </div>
                )}

                {/* Message */}
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder={`Leave a message for ${creator.name}... (optional)`}
                  rows={2} maxLength={200}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm resize-none mb-4" />

                {/* Error */}
                {error && (
                  <div className="flex items-center space-x-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 flex-1">{error}</p>
                    {error.includes('Insufficient') && (
                      <button onClick={() => { handleClose(); navigate('/wallet'); }} className="text-xs font-bold text-rose-600 underline whitespace-nowrap">Top up</button>
                    )}
                  </div>
                )}

                {/* Send button */}
                <button onClick={handleSend} disabled={sending || !tipAmount || tipAmount < 1}
                  className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold transition flex items-center justify-center space-x-2">
                  {sending
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : tipAmount >= 1
                      ? <><Zap className="w-5 h-5" /><span>Send {selectedGift ? `${selectedGift.emoji} ` : ''}${tipAmount.toFixed(2)}</span></>
                      : <span>Select an amount</span>}
                </button>
                {tipAmount >= 1 && (
                  <p className="text-center text-xs text-gray-400 mt-2">
                    {creator.name} receives ${creatorEarns.toFixed(2)} (80%)
                  </p>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}