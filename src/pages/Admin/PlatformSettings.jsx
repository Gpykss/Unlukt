// src/pages/Admin/PlatformSettings.jsx
// Admin page to manage platform-wide settings (NGN rate, buffer, etc.)

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

const SETTINGS_DOC = 'settings/ngn_rate'; // Firestore path

export default function PlatformSettings() {
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  const [rate, setRate]     = useState('');
  const [buffer, setBuffer] = useState('25');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveRate, setLiveRate]     = useState(null);

  // Load current settings from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'ngn_rate'));
        if (snap.exists()) {
          const d = snap.data();
          setRate(String(d.rate || 1550));
          setBuffer(String(d.buffer ?? 25));
          setLastUpdated(d.updatedAt?.toDate?.() || null);
        } else {
          setRate('1550');
          setBuffer('25');
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
        setRate('1550');
        setBuffer('25');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch live rate from Binance for reference
  const fetchLiveRate = async () => {
    setFetchingLive(true);
    try {
      const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTNGN');
      const data = await res.json();
      const r    = parseFloat(data.price);
      if (!isNaN(r) && r > 0) {
        setLiveRate(r);
      } else {
        setError('Could not parse Binance rate.');
      }
    } catch (e) {
      setError('Failed to fetch Binance rate. Check your connection.');
    } finally {
      setFetchingLive(false);
    }
  };

  const useLiveRate = () => {
    if (liveRate) setRate(String(Math.ceil(liveRate)));
  };

  const handleSave = async () => {
    const rateNum   = parseFloat(rate);
    const bufferNum = parseFloat(buffer);

    if (isNaN(rateNum) || rateNum <= 0) {
      setError('Enter a valid NGN rate.');
      return;
    }
    if (isNaN(bufferNum) || bufferNum < 0) {
      setError('Buffer must be 0 or more.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await setDoc(doc(db, 'settings', 'ngn_rate'), {
        rate:      rateNum,
        buffer:    bufferNum,
        effective: rateNum + bufferNum,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setLastUpdated(new Date());
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Save failed:', e);
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const effectivePreview = (parseFloat(rate) || 0) + (parseFloat(buffer) || 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-gray-200 rounded-xl transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
            <p className="text-sm text-gray-500">Manage NGN exchange rate and payment config</p>
          </div>
        </div>

        {/* NGN Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200 p-6 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">NGN Exchange Rate</h2>
              <p className="text-sm text-gray-500">Used when Nigerian users pay via bank transfer</p>
            </div>
          </div>

          {/* Live rate helper */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Binance Market Rate (reference)</p>
              <button
                onClick={fetchLiveRate}
                disabled={fetchingLive}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                {fetchingLive
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />
                }
                {fetchingLive ? 'Fetching...' : 'Fetch live'}
              </button>
            </div>

            {liveRate ? (
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-gray-900">₦{liveRate.toLocaleString('en-NG', { maximumFractionDigits: 2 })}/$</p>
                <button
                  onClick={useLiveRate}
                  className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                >
                  Use this rate
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Click "Fetch live" to see current market rate</p>
            )}
          </div>

          {/* Rate input */}
          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Base Rate (₦ per $1 USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
                <input
                  type="number"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  placeholder="1550"
                  className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 font-semibold text-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Buffer (₦ added on top for fees/margin)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
                <input
                  type="number"
                  value={buffer}
                  onChange={e => setBuffer(e.target.value)}
                  placeholder="25"
                  className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 font-semibold text-lg"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">This covers transfer fees and gives you a small margin</p>
            </div>
          </div>

          {/* Effective rate preview */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-5">
            <p className="text-sm text-green-700 font-semibold mb-1">Effective rate users will see:</p>
            <p className="text-3xl font-bold text-green-800">
              ₦{effectivePreview > 0 ? effectivePreview.toLocaleString() : '—'}/$
            </p>
            <p className="text-xs text-green-600 mt-1">
              {parseFloat(rate) || 0} base + ₦{parseFloat(buffer) || 0} buffer
            </p>
            <p className="text-xs text-green-500 mt-2">
              Example: $12 top-up = ₦{(effectivePreview * 12).toLocaleString()}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {lastUpdated && (
            <p className="text-xs text-gray-400 mb-4">
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-gray-900 hover:bg-black text-white disabled:opacity-60'
            }`}
          >
            {saving ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle className="w-5 h-5" /> Saved!</>
            ) : (
              <><Save className="w-5 h-5" /> Save Rate</>
            )}
          </button>
        </motion.div>

        <p className="text-xs text-center text-gray-400">
          Changes take effect immediately for all new NGN payment requests.
        </p>
      </div>
    </div>
  );
}
