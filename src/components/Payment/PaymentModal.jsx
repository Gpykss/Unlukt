// src/components/Payment/PaymentModal.jsx - UPDATED WITH VAT & COUNTRY DETECTION

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Building2, 
  Wallet,
  Copy,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  Globe,
  ExternalLink
} from 'lucide-react';
import korapayService from '../../services/korapay.service';
import cryptoService from '../../services/crypto.service';
import { uploadMedia } from '../../services/cloudinaryService';
import { auth, db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  amount, 
  contentType, 
  contentId, 
  creatorId,
  onSuccess 
}) {
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [loading, setLoading] = useState(false);
  const [bankTransferDetails, setBankTransferDetails] = useState(null);
  const [cryptoDetails, setCryptoDetails] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [proofUrl, setProofUrl] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  
  // ✅ NEW: Country detection
  const [userCountry, setUserCountry] = useState(null);
  const [loadingCountry, setLoadingCountry] = useState(true);
  const [showCountrySelect, setShowCountrySelect] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');

  const user = auth.currentUser;

  // ✅ NEW: Fetch user's country from Firestore
  useEffect(() => {
    if (user && isOpen) {
      fetchUserCountry();
    }
  }, [user, isOpen]);

  const fetchUserCountry = async () => {
    try {
      setLoadingCountry(true);
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const country = userData.kycData?.country || null;
        
        if (country) {
          setUserCountry(country);
          console.log('✅ User country:', country);
        } else {
          console.log('⚠️ No country in KYC data, will ask user');
          setShowCountrySelect(true);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching user country:', error);
    } finally {
      setLoadingCountry(false);
    }
  };

  // ✅ NEW: Calculate final amount with VAT for Nigeria users
  const calculateFinalAmount = (baseAmount) => {
    // VAT only applies to crypto payments for Nigeria users
    if (paymentMethod === 'crypto' && userCountry === 'Nigeria') {
      const vat = baseAmount * 0.015; // 1.5% VAT
      return {
        baseAmount,
        vat,
        total: baseAmount + vat,
        hasVAT: true
      };
    }
    
    return {
      baseAmount,
      vat: 0,
      total: baseAmount,
      hasVAT: false
    };
  };

  const finalAmount = calculateFinalAmount(amount);

  const paymentMethods = [
    { 
      id: 'bank', 
      name: 'Bank Transfer (NGN)', 
      icon: Building2, 
      description: 'Instant verification',
      time: 'Instant'
    },
    { 
      id: 'crypto', 
      name: 'USDT (TRC20)', 
      icon: Wallet, 
      description: 'Manual verification',
      time: '24-72 hours'
    }
  ];

  const countries = [
    'Nigeria',
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'Ghana',
    'South Africa',
    'Kenya',
    'Other'
  ];

  const handleInitiatePayment = async () => {
    if (!user) {
      alert('Please login to continue');
      return;
    }

    // If country not selected, prompt user
    if (showCountrySelect && !selectedCountry) {
      alert('Please select your country');
      return;
    }

    // Use selected country if user just selected it
    const countryToUse = selectedCountry || userCountry;

    setLoading(true);

    try {
      const paymentData = {
        amount: paymentMethod === 'crypto' ? finalAmount.total : amount,
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || 'User',
        contentId,
        contentType,
        creatorId,
        userCountry: countryToUse // ✅ NEW: Include country in payment data
      };

      if (paymentMethod === 'bank') {
        const result = await korapayService.initializeBankTransfer(paymentData);
        setBankTransferDetails(result);
        setPaymentId(result.paymentId);
      } else {
        const result = await cryptoService.initializeUSDTPayment(paymentData);
        setCryptoDetails(result);
        setPaymentId(result.paymentId);
      }
    } catch (error) {
      alert(error.message || 'Failed to initialize payment');
      console.error('Payment initialization error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied!');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setProofFile(file);
    setUploading(true);
    setUploadProgress(0);

    try {
      console.log('📤 Uploading payment proof to Cloudinary...');
      
      const result = await uploadMedia(
        file, 
        'payment-proofs',
        (progress) => {
          setUploadProgress(progress);
          console.log(`Upload progress: ${progress.toFixed(0)}%`);
        }
      );

      setProofUrl(result.url);
      console.log('✅ Payment proof uploaded:', result.url);
    } catch (error) {
      console.error('❌ Upload error:', error);
      alert('Failed to upload image. Please try again.');
      setProofFile(null);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSubmitProof = async () => {
    if (!proofUrl) {
      alert('Please upload proof of payment');
      return;
    }

    setSubmittingProof(true);

    try {
      await cryptoService.submitProofOfPayment(paymentId, proofUrl, txHash);
      alert('Proof submitted! Admin will verify within 24-72 hours.');
      onClose();
      if (onSuccess) onSuccess();
    } catch (error) {
      alert(error.message || 'Failed to submit proof');
    } finally {
      setSubmittingProof(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Complete Payment</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Base Amount: ${amount.toFixed(2)}
                  {finalAmount.hasVAT && (
                    <span className="ml-2 text-rose-600">
                      + ${finalAmount.vat.toFixed(2)} VAT (1.5%)
                    </span>
                  )}
                </p>
                {finalAmount.hasVAT && (
                  <p className="text-lg font-bold text-rose-600 mt-1">
                    Total: ${finalAmount.total.toFixed(2)}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* ✅ NEW: Country Selection (if needed) */}
            {showCountrySelect && !userCountry && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Globe className="w-4 h-4 inline mr-2" />
                  Select Your Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500"
                >
                  <option value="">Choose your country...</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-2">
                  🇳🇬 Nigeria users: 1.5% VAT applies to crypto payments
                </p>
              </div>
            )}

            {/* Payment Method Selection */}
            {!bankTransferDetails && !cryptoDetails && (
              <>
                <div className="space-y-3 mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Payment Method
                  </label>
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id)}
                        className={`w-full p-4 border-2 rounded-xl transition flex items-start justify-between ${
                          paymentMethod === method.id
                            ? 'border-rose-500 bg-rose-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-lg ${
                            paymentMethod === method.id ? 'bg-rose-100' : 'bg-gray-100'
                          }`}>
                            <Icon className={`w-5 h-5 ${
                              paymentMethod === method.id ? 'text-rose-600' : 'text-gray-600'
                            }`} />
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-gray-900">{method.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{method.description}</p>
                            <p className="text-xs text-gray-600 mt-1">Time: {method.time}</p>
                          </div>
                        </div>
                        {paymentMethod === method.id && (
                          <CheckCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleInitiatePayment}
                  disabled={loading || loadingCountry || (showCountrySelect && !selectedCountry)}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:bg-gray-300"
                >
                  {loading ? 'Initializing...' : loadingCountry ? 'Loading...' : 'Continue'}
                </button>
              </>
            )}

            {/* Bank Transfer Details - NO CHANGES */}
            {/* Bank Transfer Details */}
{bankTransferDetails && (
  <div className="space-y-4">
    {/* Test Mode - Show Checkout URL */}
    {bankTransferDetails.checkoutUrl ? (
      <>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">
              Test Mode - Complete Payment
            </p>
          </div>
          <p className="text-xs text-blue-700">
            Click the button below to complete your test payment
          </p>
        </div>

        <button
          onClick={() => window.open(bankTransferDetails.checkoutUrl, '_blank')}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white py-4 rounded-xl font-semibold text-lg transition flex items-center justify-center space-x-2"
        >
          <span>Complete Payment (Test Mode)</span>
          <ExternalLink className="w-5 h-5" />
        </button>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-2">
            <strong>Amount:</strong> ₦{bankTransferDetails.amount.toFixed(2)}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Reference:</strong> {bankTransferDetails.reference}
          </p>
        </div>
      </>
    ) : (
      /* Production Mode - Show Bank Account Details */
      <>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">
              Complete payment within 30 minutes
            </p>
          </div>
          <p className="text-xs text-blue-700">
            Payment will be automatically verified
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-600 font-semibold">Bank Name</label>
            <p className="font-bold text-gray-900">
              {bankTransferDetails.accountDetails.bankName}
            </p>
          </div>
          
          <div>
            <label className="text-xs text-gray-600 font-semibold">Account Number</label>
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900 text-lg">
                {bankTransferDetails.accountDetails.accountNumber}
              </p>
              <button
                onClick={() => handleCopyAddress(bankTransferDetails.accountDetails.accountNumber)}
                className="p-2 hover:bg-gray-200 rounded-lg"
              >
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-semibold">Account Name</label>
            <p className="font-bold text-gray-900">
              {bankTransferDetails.accountDetails.accountName}
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-semibold">Amount</label>
            <p className="font-bold text-rose-600 text-2xl">
              ₦{bankTransferDetails.amount.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-800 mb-2">Instructions:</p>
          <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside">
            <li>Transfer the exact amount to the account above</li>
            <li>Payment will be verified automatically</li>
            <li>Content will unlock after verification</li>
          </ol>
        </div>
      </>
    )}
  </div>
)}
            {/* Crypto Payment Details - UPDATED WITH VAT INFO */}
            {cryptoDetails && (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    <p className="text-sm font-semibold text-orange-800">
                      Manual Verification Required
                    </p>
                  </div>
                  <p className="text-xs text-orange-700">
                    Admin will verify within 24-72 hours
                  </p>
                </div>

                {/* ✅ NEW: VAT Breakdown for Nigeria users */}
                {finalAmount.hasVAT && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-blue-800 mb-2">
                      🇳🇬 Nigeria VAT Applied:
                    </p>
                    <div className="text-xs text-blue-700 space-y-1">
                      <div className="flex justify-between">
                        <span>Base Amount:</span>
                        <span className="font-semibold">${finalAmount.baseAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>VAT (1.5%):</span>
                        <span className="font-semibold">${finalAmount.vat.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-blue-300">
                        <span className="font-bold">Total to Pay:</span>
                        <span className="font-bold">${finalAmount.total.toFixed(2)} USDT</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-xs text-gray-600 font-semibold">Network</label>
                    <p className="font-bold text-gray-900">{cryptoDetails.network}</p>
                  </div>
                  
                  <div>
                    <label className="text-xs text-gray-600 font-semibold">Wallet Address</label>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs text-gray-900 break-all">
                        {cryptoDetails.walletAddress}
                      </p>
                      <button
                        onClick={() => handleCopyAddress(cryptoDetails.walletAddress)}
                        className="p-2 hover:bg-gray-200 rounded-lg ml-2"
                      >
                        <Copy className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 font-semibold">Amount to Send</label>
                    <p className="font-bold text-rose-600 text-2xl">
                      {cryptoDetails.amount} {cryptoDetails.currency}
                    </p>
                  </div>
                </div>

                {/* Upload Proof - NO CHANGES */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    Upload Proof of Payment
                  </label>
                  
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="proof-upload"
                      disabled={uploading}
                    />
                    <label htmlFor="proof-upload" className={uploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
                      {uploading ? (
                        <>
                          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          <p className="text-sm text-gray-700 font-semibold">
                            Uploading... {uploadProgress.toFixed(0)}%
                          </p>
                        </>
                      ) : proofFile ? (
                        <>
                          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-700 font-semibold">
                            {proofFile.name}
                          </p>
                          <p className="text-xs text-green-600 mt-1">✓ Uploaded successfully</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-700 font-semibold">
                            Click to upload screenshot
                          </p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG (Max 5MB)</p>
                        </>
                      )}
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Transaction Hash (Optional)
                    </label>
                    <input
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="Enter transaction hash"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSubmitProof}
                  disabled={!proofUrl || submittingProof || uploading}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {submittingProof ? 'Submitting...' : uploading ? 'Uploading...' : 'Submit Proof'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
