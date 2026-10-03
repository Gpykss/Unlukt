// src/components/Dashboard/WithdrawModal.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, DollarSign, Loader2, CheckCircle,
  AlertCircle, Info, CreditCard, Clock
} from 'lucide-react';
import {
  doc, getDoc, updateDoc, addDoc, collection,
  query, where, orderBy, getDocs, serverTimestamp, increment
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

const MIN_WITHDRAW = 20;

const METHODS = [
  { id: 'usdt_trc20', label: 'USDT TRC20',    emoji: '₮', desc: 'Tether on Tron network' },
  { id: 'usdt_erc20', label: 'USDT ERC20',    emoji: '₮', desc: 'Tether on Ethereum network' },
  { id: 'btc',        label: 'Bitcoin (BTC)', emoji: '₿', desc: 'Bitcoin network' },
];

export default function WithdrawModal({ isOpen, onClose, initialTab = 'withdraw' }) {
  const { currentUser } = useAuth();

  const [balance, setBalance]     = useState({ available: 0 });
  const [amount, setAmount]       = useState('');
  const [method, setMethod]       = useState(METHODS[0].id);
  const [address, setAddress]     = useState('');
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  const [tab, setTab] = useState(initialTab); // 'withdraw' | 'history'
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setAmount(''); setAddress(''); setError('');
      setSuccess(false); setMethod(METHODS[0].id);
      return;
    }
    setTab(initialTab);
    if (currentUser) {
      loadBalance();
      loadHistory();
    }
  }, [isOpen, currentUser, initialTab]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const snap = await getDocs(
        query(
          collection(db, 'payout_requests'),
          where('creatorId', '==', currentUser.uid)
        )
      );
      
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort locally to avoid requiring composite index
      data.sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });
      
      setHistory(data);
    } catch (e) {
      console.error('History error:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadBalance = async () => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'creator_balances', currentUser.uid));
      let available = 0;
      if (snap.exists()) {
        const d = snap.data();
        available = (d.availableBalance || 0) + (d.pendingBalance || 0);
      }
      try {
        const wSnap = await getDoc(doc(db, 'wallets', currentUser.uid));
        if (wSnap.exists() && wSnap.data().balanceMinor !== undefined) {
          const wBal = wSnap.data().balanceMinor / 100;
          available = Math.max(available, wBal);
        }
      } catch (_) {}
      setBalance({ available });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const amountNum = parseFloat(amount || 0);
  const fee = parseFloat((amountNum * 0.02).toFixed(2)); // 2% withdrawal fee
  const youGet = parseFloat((amountNum - fee).toFixed(2));

  const handleSubmit = async () => {
    setError('');
    if (!amountNum || amountNum < MIN_WITHDRAW) {
      setError(`Minimum withdrawal is $${MIN_WITHDRAW}`);
      return;
    }
    if (amountNum > balance.available) {
      setError('Amount exceeds available balance');
      return;
    }
    if (!address.trim()) {
      setError('Please enter your wallet address');
      return;
    }

    try {
      setSubmitting(true);

      let submitted = false;
      try {
        // Call secure Cloud Function
        const requestPayoutFn = httpsCallable(functions, 'requestPayout');
        await requestPayoutFn({
          amountMinor: Math.round(amountNum * 100),
          payoutAddress: address.trim(),
          networkFeeMinor: Math.round(fee * 100),
        });
        submitted = true;
      } catch (cloudErr) {
        console.warn('Cloud function requestPayout failed, falling back to direct payout request:', cloudErr.message);

        // Fallback: direct reservation in creator_balances
        const creatorBalRef = doc(db, 'creator_balances', currentUser.uid);
        await updateDoc(creatorBalRef, {
          availableBalance: increment(-amountNum),
          pendingPayoutBalance: increment(amountNum),
          updatedAt: serverTimestamp(),
        });

        // Also decrement wallets if present
        try {
          const walletRef = doc(db, 'wallets', currentUser.uid);
          const wSnap = await getDoc(walletRef);
          if (wSnap.exists()) {
            await updateDoc(walletRef, {
              balanceMinor: increment(-Math.round(amountNum * 100)),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (_) {}

        // Create payout request doc
        await addDoc(collection(db, 'payout_requests'), {
          creatorId: currentUser.uid,
          userId: currentUser.uid,
          amount: amountNum,
          amountMinor: Math.round(amountNum * 100),
          fee,
          networkFeeMinor: Math.round(fee * 100),
          netAmount: youGet,
          method,
          walletAddress: address.trim(),
          payoutAddress: address.trim(),
          status: 'pending',
          createdAt: serverTimestamp(),
        });

        submitted = true;
      }

      if (submitted) {
        setSuccess(true);
        setBalance(prev => ({ ...prev, available: Math.max(0, prev.available - amountNum) }));
        if (tab === 'history') loadHistory();
      }
    } catch (e) {
      setError('Failed to submit withdrawal: ' + (e.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        >
          {success ? (
            <div className="p-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h3>
              <p className="text-gray-600 mb-2">
                Your withdrawal of <span className="font-bold">${amountNum.toFixed(2)}</span> is being processed.
              </p>
              <p className="text-sm text-gray-400 mb-6 flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" /> Usually instant
              </p>
              <button onClick={onClose}
                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button onClick={() => setTab('withdraw')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${tab === 'withdraw' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>New Payout</button>
                  <button onClick={() => setTab('history')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${tab === 'history' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>History</button>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {tab === 'history' ? (
                <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                  {loadingHistory ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                  ) : history.length === 0 ? (
                    <div className="text-center py-10">
                      <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm font-semibold">No withdrawal history found</p>
                      <p className="text-gray-400 text-xs mt-1">Payout requests and blockchain settlements will show here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {history.map(item => (
                        <div key={item.id} className="p-3.5 border border-gray-200/80 rounded-2xl bg-gray-50/80">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-extrabold text-gray-900 text-base">
                              ${item.amount ? Number(item.amount).toFixed(2) : '0.00'}
                            </span>
                            {item.status === 'pending' && (
                              <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                Pending Approval
                              </span>
                            )}
                            {(item.status === 'completed' || item.status === 'sent') && (
                              <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                Paid & Settled
                              </span>
                            )}
                            {item.status === 'rejected' && (
                              <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                Rejected & Refunded
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                            <span className="font-medium">{item.method || 'USDT TRC20'}</span>
                            <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 truncate font-mono">
                            To: {item.walletAddress || item.payoutAddress || 'Wallet'}
                          </div>
                          {item.txHash && (
                            <div className="mt-2 pt-2 border-t border-gray-200/60 flex items-center justify-between text-[11px]">
                              <span className="text-gray-500 font-medium">TX Hash:</span>
                              <a
                                href={`https://tronscan.org/#/transaction/${item.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700 font-mono flex items-center gap-1 font-semibold"
                              >
                                <span>{item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                {/* Balance display */}
                {loading ? (
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-green-600 font-semibold">Available</p>
                    <p className="text-xl font-bold text-green-700">${balance.available.toFixed(2)}</p>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder={`${MIN_WITHDRAW}.00`}
                      min={MIN_WITHDRAW}
                      max={balance.available}
                      step="0.01"
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-lg font-semibold"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[20, 50, 100].map(v => (
                      <button key={v} onClick={() => setAmount(String(Math.min(v, balance.available)))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                          parseFloat(amount) === v ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        ${v}
                      </button>
                    ))}
                    <button onClick={() => setAmount(balance.available.toFixed(2))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-gray-300 transition">
                      Max
                    </button>
                  </div>
                </div>

                {/* Method */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Payout Method</label>
                  <div className="space-y-2">
                    {METHODS.map(m => (
                      <button key={m.id} onClick={() => setMethod(m.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition ${
                          method === m.id ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <span className="text-xl font-bold">{m.emoji}</span>
                        <div className="text-left">
                          <p className={`font-bold text-sm ${method === m.id ? 'text-rose-700' : 'text-gray-800'}`}>{m.label}</p>
                          <p className="text-xs text-gray-500">{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wallet address */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Your Wallet Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Enter your wallet address"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-mono"
                  />
                </div>

                {/* Fee summary */}
                {amountNum >= MIN_WITHDRAW && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Withdrawal amount</span>
                      <span className="font-semibold">${amountNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Network fee (2%)</span>
                      <span>-${fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-900 font-bold border-t border-gray-200 pt-1 mt-1">
                      <span>You receive</span>
                      <span className="text-green-600">${youGet.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    Withdrawals are processed instantly. Minimum withdrawal is ${MIN_WITHDRAW}. Double-check your wallet address before submitting.
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              {/* Submit — fixed outside scroll area so it's always visible above mobile nav */}
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || loading || !amountNum || amountNum < MIN_WITHDRAW || !address.trim()}
                    className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold transition flex items-center justify-center gap-2"
                  >
                    {submitting
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <><CreditCard className="w-5 h-5" /><span>Request Withdrawal</span></>}
                  </button>
                </div>
              </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}