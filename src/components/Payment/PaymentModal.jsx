// src/components/Payment/PaymentModal.jsx

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, MapPin, CreditCard, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

import korapayService from '../../services/korapay.service';
import {
  COUNTRIES,
  getCountryByCode,
  getCurrencyForCountry,
  isKorapayCurrencySupported,
  formatMoney
} from '../../utils/currencySupport';

export default function PaymentModal({
  isOpen,
  onClose,
  amountUSD = 0,
  contentType = 'topup',
  contentId = null,
  creatorId = null,
  onSuccess
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);

  // store selection as countryCode (matches your Wallet)
  const [countryCode, setCountryCode] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // FX preview
  const [fxLoading, setFxLoading] = useState(false);
  const [estimatedLocal, setEstimatedLocal] = useState(null);

  const selectedCountry = useMemo(
    () => (countryCode ? getCountryByCode(countryCode) : null),
    [countryCode]
  );

  const currency = useMemo(() => {
    if (!selectedCountry) return 'USD';
    // keep compatible with your old helper too
    return selectedCountry.currency || getCurrencyForCountry(selectedCountry.name) || 'USD';
  }, [selectedCountry]);

  const canUseKorapay = useMemo(() => isKorapayCurrencySupported(currency), [currency]);

  // Load saved location
  useEffect(() => {
    const load = async () => {
      if (!currentUser?.uid || !isOpen) return;

      setError('');
      setResult(null);
      setEstimatedLocal(null);

      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!snap.exists()) return;

        const data = snap.data();

        // ✅ prefer your Wallet structure
        const savedCode = data?.location?.countryCode;

        // fallback older patterns if you have them
        const savedName = data?.kycData?.country || data?.country || null;

        if (savedCode) {
          setCountryCode(String(savedCode).toUpperCase());
          return;
        }

        if (savedName) {
          const found = COUNTRIES.find((c) => c.name === savedName);
          if (found?.code) setCountryCode(found.code);
        }
      } catch (e) {
        console.warn('Failed to load user location:', e?.message);
      }
    };

    load();
  }, [currentUser?.uid, isOpen]);

  // Save selection into users/{uid}.location (same as Wallet)
  const saveLocationToProfile = async (code) => {
    if (!currentUser?.uid) return;

    const c = getCountryByCode(code);
    if (!c) return;

    const userRef = doc(db, 'users', currentUser.uid);

    const payload = {
      location: {
        countryCode: c.code,
        countryName: c.name,
        currency: c.currency,
        updatedAt: new Date()
      }
    };

    try {
      // updateDoc fails if doc doesn't exist
      await updateDoc(userRef, payload);
    } catch {
      await setDoc(userRef, payload, { merge: true });
    }
  };

  // FX preview: show user an estimate before starting payment
  useEffect(() => {
    const run = async () => {
      setEstimatedLocal(null);

      if (!isOpen) return;
      if (!countryCode) return;
      if (!selectedCountry) return;

      const usd = Number(amountUSD || 0);
      if (!usd || usd <= 0) return;

      // Only preview if Korapay bank transfer is possible
      if (!canUseKorapay) return;

      try {
        setFxLoading(true);
        const local = await korapayService.convertUsdToLocal(usd, currency);
        setEstimatedLocal(local);
      } catch (e) {
        console.warn('FX preview failed:', e?.message);
        setEstimatedLocal(null);
      } finally {
        setFxLoading(false);
      }
    };

    run();
  }, [isOpen, countryCode, selectedCountry, canUseKorapay, amountUSD, currency]);

  const startKorapay = async () => {
    if (!currentUser?.uid) {
      alert('Please login to continue');
      return;
    }

    if (!countryCode || countryCode === 'OTHER') {
      setError('Please select your country to continue.');
      return;
    }

    if (!canUseKorapay) {
      setError('Your local currency is not supported for bank transfer yet.');
      return;
    }

    setError('');
    setResult(null);

    try {
      setLoading(true);

      await saveLocationToProfile(countryCode);

      const res = await korapayService.initializeBankTransfer({
        amountUSD: Number(amountUSD) || 0,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.email?.split('@')?.[0] || 'User',
        contentId,
        contentType,
        creatorId,
        currency
      });

      setResult(res);

      if (res?.checkoutUrl) window.open(res.checkoutUrl, '_blank');

      if (onSuccess) onSuccess(res);
    } catch (e) {
      console.error('Payment init error:', e);
      setError(e?.message || 'Failed to start payment');
    } finally {
      setLoading(false);
    }
  };

  const goSupport = () => {
    onClose?.();
    navigate('/support');
  };

  const goCrypto = () => {
    // You said: USD via crypto for now -> route to support for manual handling (until you build crypto page)
    onClose?.();
    navigate('/support');
  };

  if (!isOpen) return null;

  const showUnsupported =
    countryCode === 'OTHER' || (!!countryCode && !canUseKorapay);

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-6 sm:p-7"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Complete Payment</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4">
            <p className="text-sm text-gray-600">Amount (USD)</p>
            <p className="text-2xl font-bold text-gray-900">
              ${Number(amountUSD || 0).toFixed(2)}
            </p>

            {canUseKorapay && countryCode && estimatedLocal != null && (
              <p className="text-xs text-gray-600 mt-2">
                Estimated you’ll pay:{" "}
                <b>
                  {fxLoading ? 'Calculating...' : formatMoney(estimatedLocal, currency)}
                </b>{" "}
                <span className="text-gray-500">(Korapay rate + 10 markup)</span>
              </p>
            )}

            <p className="text-xs text-gray-500 mt-1">
              If your currency is supported, you’ll pay in local currency. Otherwise you can use USD crypto or contact support.
            </p>
          </div>

          {/* Country selector */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <span className="inline-flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Your country
              </span>
            </label>

            <select
              value={countryCode}
              onChange={(e) => {
                setCountryCode(e.target.value);
                setError('');
              }}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500 bg-white"
            >
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </select>

            {!!countryCode && selectedCountry && (
              <p className="text-xs text-gray-500 mt-2">
                Currency: <b>{currency}</b> • Korapay bank transfer:{' '}
                <b className={canUseKorapay ? 'text-green-600' : 'text-yellow-700'}>
                  {canUseKorapay ? 'Supported' : 'Not supported'}
                </b>
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          {/* Unsupported */}
          {showUnsupported ? (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-yellow-700 mt-0.5" />
                <div>
                  <p className="font-bold text-yellow-900">Local currency not supported</p>
                  <p className="text-sm text-yellow-800 mt-1">
                    Korapay can’t process bank transfer for this currency yet.
                    Choose USD crypto or contact support for special help.
                  </p>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={goCrypto}
                      className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-gray-900 text-white hover:bg-black transition"
                    >
                      Pay with Crypto (USD)
                    </button>
                    <button
                      onClick={goSupport}
                      className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-white border border-yellow-300 text-yellow-900 hover:bg-yellow-100 transition"
                    >
                      Contact Support
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Korapay button */}
          <button
            onClick={startKorapay}
            disabled={loading || !countryCode || countryCode === 'OTHER' || !canUseKorapay}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-semibold bg-rose-500 hover:bg-rose-600 text-white transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
            <span>{loading ? 'Starting...' : `Pay with Bank Transfer (${currency})`}</span>
          </button>

          {result?.accountDetails && (
            <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-4">
              <p className="font-bold text-gray-900 mb-2">Bank Transfer Details</p>
              <div className="text-sm text-gray-700 space-y-1">
                <p><b>Bank:</b> {result.accountDetails.bankName}</p>
                <p><b>Account Name:</b> {result.accountDetails.accountName}</p>
                <p><b>Account Number:</b> {result.accountDetails.accountNumber}</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Transfer must be completed before the account expires.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4">
            FX uses Korapay rate + 10 markup. If you need help, use Support.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
