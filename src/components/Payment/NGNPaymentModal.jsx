// src/components/Payment/NGNPaymentModal.jsx
// In-app NGN bank transfer flow: show details → upload proof → admin approves

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Copy, CheckCircle, Upload, Loader2, AlertCircle, ArrowRight, ArrowLeft
} from 'lucide-react';
import { db, auth } from '../../config/firebase';
import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { uploadToBunny } from '../../services/bunnyUpload.service';

// ── Config ──────────────────────────────────────────────────────────────────
const BANK_NAME    = 'Coming-Soon';           // ← change to your bank
const ACCOUNT_NAME = 'Coming-Soon';     // ← change to your account name
const ACCOUNT_NO   = 'Coming-Soon';     // ← change to your account number
const NGN_BUFFER   = 25;              // ← default buffer (overridden by Firestore)
const NGN_FALLBACK = 1550;            // ← fallback base rate if Firestore not set

// Generate a unique reference like UNLUKT-uid6char-random4
function generateReference(userId) {
  const userPart   = (userId || 'user').slice(0, 6).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `UNLUKT-${userPart}-${randomPart}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function NGNPaymentModal({ isOpen, onClose, amountUSD = 0, onSuccess }) {
  const [step, setStep]           = useState(1); // 1 = details, 2 = upload, 3 = done
  const [copied, setCopied]       = useState('');
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const [ngnRate, setNgnRate]         = useState(null);   // base rate from Firestore
  const [adminBuffer, setAdminBuffer] = useState(NGN_BUFFER); // buffer from Firestore
  const [rateLoading, setRateLoading] = useState(false);
  const fileRef                       = useRef(null);

  const user      = auth.currentUser;
  const reference = useState(() => generateReference(user?.uid))[0];

  // Effective rate = admin-set base + admin-set buffer
  const effectiveRate = (ngnRate || NGN_FALLBACK) + adminBuffer;
  const amountNGN     = Math.ceil(amountUSD * effectiveRate);

  // Fetch rate from Firestore (set by admin in Platform Settings)
  useEffect(() => {
    if (!isOpen) return;
    const fetchRate = async () => {
      setRateLoading(true);
      try {
        const snap = await getDoc(doc(db, 'settings', 'ngn_rate'));
        if (snap.exists()) {
          const d = snap.data();
          setNgnRate(Number(d.rate || NGN_FALLBACK));
          // Use admin-set buffer if available
          if (d.buffer !== undefined) {
            setAdminBuffer(Number(d.buffer));
          }
        }
      } catch (e) {
        console.warn('Failed to load NGN rate from Firestore:', e);
      } finally {
        setRateLoading(false);
      }
    };
    fetchRate();
  }, [isOpen]);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select your payment proof screenshot.'); return; }
    if (!user)  { setError('You must be logged in.'); return; }

    try {
      setUploading(true);
      setError('');

      // 1. Upload proof to Bunny.net via Firebase Function proxy
      const uploadResult = await uploadToBunny(file, {
        folder:      'ngn_proofs',
        contentType: 'image',
      });
      const proofUrl = uploadResult.cdnUrl;

      // 2. Save payment request to Firestore for admin to review
      await addDoc(collection(db, 'ngn_payments'), {
        userId:      user.uid,
        userEmail:   user.email || '',
        amountUSD,
        amountNGN,
        reference,
        proofUrl,
        status:      'pending',   // admin changes to 'approved' / 'rejected'
        bankName:    BANK_NAME,
        accountNo:   ACCOUNT_NO,
        createdAt:   serverTimestamp(),
      });

      setStep(3);
    } catch (err) {
      console.error('NGN payment submit error:', err);
      setError('Failed to submit. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (step === 3 && onSuccess) onSuccess();
    onClose();
    // reset
    setTimeout(() => { setStep(1); setFile(null); setPreview(null); setError(''); }, 300);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl"
          style={{ maxHeight: '88vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              {step === 2 && (
                <button onClick={() => setStep(1)} className="p-1.5 hover:bg-gray-100 rounded-full mr-1">
                  <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>
              )}
              <h2 className="text-base font-bold text-gray-900">
                {step === 1 && 'Pay with Bank Transfer'}
                {step === 2 && 'Upload Payment Proof'}
                {step === 3 && 'Submitted!'}
              </h2>
            </div>
            <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-full">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

            {/* ── STEP 1: Bank Details ─────────────────────────────────────── */}
            {step === 1 && (
              <>
                {/* Amount banner - compact */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl px-4 py-3 text-white flex items-center justify-between">
                  <div>
                    <p className="text-xs opacity-75 mb-0.5">Amount to Pay</p>
                    {rateLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin opacity-80" />
                        <span className="text-sm opacity-80">Fetching rate...</span>
                      </div>
                    ) : (
                      <p className="text-2xl font-bold">₦{amountNGN.toLocaleString()}</p>
                    )}
                    <p className="text-xs opacity-60 mt-0.5">≈ ${amountUSD.toFixed(2)} · ₦{effectiveRate.toLocaleString()}/$</p>
                  </div>
                </div>

                {/* Bank details */}
                <div className="border-2 border-gray-100 rounded-2xl divide-y divide-gray-100">
                  {[
                    { label: 'Bank',           value: BANK_NAME,    key: 'bank' },
                    { label: 'Account Name',   value: ACCOUNT_NAME, key: 'name' },
                    { label: 'Account Number', value: ACCOUNT_NO,   key: 'acct' },
                    { label: 'Reference',      value: reference,    key: 'ref'  },
                  ].map(({ label, value, key }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="font-semibold text-gray-900 font-mono text-sm">{value}</p>
                      </div>
                      <button
                        onClick={() => copy(value, key)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                      >
                        {copied === key
                          ? <CheckCircle className="w-4 h-4 text-green-500" />
                          : <Copy className="w-4 h-4 text-gray-400" />
                        }
                      </button>
                    </div>
                  ))}
                </div>

                {/* Important note - compact */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-0.5">
                    <p className="font-semibold text-sm">Important</p>
                    <p>• Include the <strong>reference</strong> in your narration</p>
                    <p>• Pay the <strong>exact NGN amount</strong> shown</p>
                    <p>• Credited within <strong>1–3 hrs</strong> after approval</p>
                  </div>
                </div>
              </>
            )}

            {/* ── STEP 2: Upload Proof ─────────────────────────────────────── */}
            {step === 2 && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                  <p className="font-semibold mb-1">Upload your payment screenshot</p>
                  <p>We'll verify and credit your wallet within 1–3 hours.</p>
                </div>

                {/* Reference reminder */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                  <div>
                    <p className="text-xs text-gray-400">Your Reference</p>
                    <p className="font-mono font-semibold text-gray-900 text-sm">{reference}</p>
                  </div>
                  <button onClick={() => copy(reference, 'ref2')}>
                    {copied === 'ref2'
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <Copy className="w-4 h-4 text-gray-400" />
                    }
                  </button>
                </div>

                {/* File drop zone */}
                <input
                  type="file"
                  ref={fileRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 transition ${
                    preview ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-rose-400 hover:bg-rose-50'
                  }`}
                >
                  {preview ? (
                    <img src={preview} alt="proof" className="w-full max-h-48 object-contain rounded-xl" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 font-medium">Tap to upload screenshot</p>
                      <p className="text-xs text-gray-400">JPG, PNG or WEBP</p>
                    </>
                  )}
                </button>

                {error && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </p>
                )}
              </>
            )}

            {/* ── STEP 3: Done ─────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-9 h-9 text-green-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Payment submitted!</h3>
                  <p className="text-gray-500 text-sm mt-2">
                    We've received your proof and will credit your wallet within <strong>1–3 hours</strong>.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-xs text-gray-400 mb-1">Reference</p>
                  <p className="font-mono font-semibold text-gray-800">{reference}</p>
                </div>
                <p className="text-xs text-gray-400">Keep this reference in case you need support.</p>
                <button
                  onClick={handleClose}
                  className="w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-2xl font-semibold transition"
                >
                  Done
                </button>
              </div>
            )}

          </div>{/* end scrollable content */}

          {/* ── Sticky bottom CTA (Step 1 & 2) ─────────────────────────────── */}
          {step === 1 && (
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 bg-white">
              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-3.5 rounded-2xl font-semibold transition"
              >
                I've Paid — Upload Proof <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 bg-white">
              {error && (
                <p className="text-sm text-red-600 flex items-center gap-1.5 mb-3">
                  <AlertCircle className="w-4 h-4" /> {error}
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={uploading || !file}
                className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-semibold transition"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                {uploading ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
