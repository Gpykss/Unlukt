// src/pages/CreatorProfile/BecomeCreator.jsx
// Implements PRD Section 15.4: Adaptive Onboarding
// - 15-second Day 0: username, avatar, category. Creator enters dashboard immediately.
// - KYC is progressive: only required for payouts ($50+), never blocking Day 0 content creation.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Check, ArrowRight, Loader2, Shield,
  AlertCircle, Sparkles, X, Camera, Zap, Upload
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { updateUserProfile, submitKYCApplication } from '../../services/firestoreService';
import { uploadToBunny } from '../../services/bunnyUpload.service';

const CATEGORIES = [
  { id: 'glamour', label: 'Glamour & Modeling', icon: '✨' },
  { id: 'fitness', label: 'Fitness & Health', icon: '💪' },
  { id: 'lifestyle', label: 'Lifestyle & Vlogs', icon: '🌴' },
  { id: 'cosplay', label: 'Cosplay & Gaming', icon: '🎮' },
  { id: 'art', label: 'Art & Photography', icon: '🎨' },
  { id: 'music', label: 'Music & Dance', icon: '🎵' },
];

export default function BecomeCreator() {
  const navigate = useNavigate();
  const { currentUser, fetchUserProfile } = useAuth();
  const { profile } = useUserProfile();

  const isAlreadyCreator = profile?.isCreator === true;
  const kycStatus = profile?.kycStatus || 'none';

  // Mode: 'quick_start' (Day 0 15s entry) vs 'kyc_verify' (for payouts)
  const [activeTab, setActiveTab] = useState(isAlreadyCreator ? 'kyc' : 'day0');

  // Day 0 Quick Start Form
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [category, setCategory] = useState(profile?.creatorCategory || 'glamour');
  const [bio, setBio] = useState(profile?.bio || '');
  const [isEighteen, setIsEighteen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [quickError, setQuickError] = useState('');

  // KYC Form for Payouts
  const [isSubmittingKYC, setIsSubmittingKYC] = useState(false);
  const [kycForm, setKycForm] = useState({
    fullName: '',
    dateOfBirth: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    idType: 'drivers_license',
    idNumber: '',
    phoneNumber: profile?.phoneNumber || '',
  });

  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [uploadingImg, setUploadingImg] = useState({ front: false, back: false, selfie: false });
  const [imgError, setImgError] = useState('');
  const [kycSubmitted, setKycSubmitted] = useState(false);

  // 15-Second Day 0 Activation
  const handleInstantActivation = async (e) => {
    e.preventDefault();
    if (!currentUser?.uid) return;
    if (!displayName.trim()) {
      setQuickError('Please enter a display name');
      return;
    }
    if (!isEighteen) {
      setQuickError('You must confirm that you are at least 18 years old to become a creator.');
      return;
    }
    if (!agreedToTerms) {
      setQuickError('Please agree to the creator terms to continue.');
      return;
    }

    setQuickError('');
    setIsActivating(true);

    try {
      await updateUserProfile(currentUser.uid, {
        isCreator: true,
        role: 'creator',
        displayName: displayName.trim(),
        username: username.trim().toLowerCase().replace('@', ''),
        creatorCategory: category,
        bio: bio.trim(),
        isAdultConfirmed: true,
        subscriptionPrice: profile?.subscriptionPrice || 9.99,
        creatorOnboardedAt: new Date(),
      });

      await fetchUserProfile(currentUser.uid);
      navigate('/dashboard', {
        state: { welcomed: true, message: 'Welcome to your Creator Studio!' }
      });
    } catch (err) {
      console.error('Creator activation error:', err);
      setQuickError(err.message || 'Failed to activate creator account. Please try again.');
    } finally {
      setIsActivating(false);
    }
  };

  // Upload ID images for KYC
  const handleImageUpload = async (e, slot) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setImgError('Image must be under 10MB'); return; }
    if (!file.type.startsWith('image/')) { setImgError('Please upload an image file'); return; }
    setImgError('');
    const preview = URL.createObjectURL(file);
    setUploadingImg((p) => ({ ...p, [slot]: true }));
    try {
      const result = await uploadToBunny(file, { folder: `kyc/${currentUser.uid}`, contentType: 'media' });
      const payload = { preview, url: result.cdnUrl };
      if (slot === 'front') setIdFront(payload);
      if (slot === 'back') setIdBack(payload);
      if (slot === 'selfie') setSelfie(payload);
    } catch {
      setImgError('Upload failed — please try again');
    } finally {
      setUploadingImg((p) => ({ ...p, [slot]: false }));
    }
  };

  const handleSubmitKYC = async (e) => {
    e.preventDefault();
    if (!kycForm.fullName || !kycForm.dateOfBirth || !kycForm.address ||
        !kycForm.city || !kycForm.country || !kycForm.idNumber || !kycForm.phoneNumber) {
      alert('Please fill in all required fields');
      return;
    }
    if (!idFront?.url || !idBack?.url || !selfie?.url) {
      alert('Please upload all three ID images (front, back, and selfie)');
      return;
    }
    const birthDate = new Date(kycForm.dateOfBirth);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    if (age < 18) {
      alert('You must be 18 or older to complete verification');
      return;
    }

    try {
      setIsSubmittingKYC(true);
      await submitKYCApplication(currentUser.uid, {
        ...kycForm,
        idFrontUrl: idFront.url,
        idBackUrl: idBack.url,
        selfieUrl: selfie.url,
      });
      await fetchUserProfile(currentUser.uid);
      setKycSubmitted(true);
    } catch (error) {
      console.error('Error submitting KYC:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setIsSubmittingKYC(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Navigation / Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-rose-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-white">
            <Crown className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {isAlreadyCreator ? 'Creator Studio & Verification' : 'Become a Creator'}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            {isAlreadyCreator
              ? 'Manage your creator profile and complete identity verification for withdrawals'
              : 'Launch your creator studio in 15 seconds and start monetizing immediately'}
          </p>

          {/* Switch tabs if already creator */}
          {isAlreadyCreator && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setActiveTab('day0')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'day0'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Profile & Category
              </button>
              <button
                onClick={() => setActiveTab('kyc')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'kyc'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Identity Verification (KYC)
              </button>
            </div>
          )}
        </div>

        {/* ── DAY 0: 15-SECOND QUICK START ──────────────────────────────── */}
        {activeTab === 'day0' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {isAlreadyCreator ? 'Edit Creator Settings' : '15-Second Quick Setup'}
                </h2>
                <p className="text-xs text-gray-500">
                  No paperwork needed to start posting and building your audience
                </p>
              </div>
            </div>

            {quickError && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{quickError}</span>
              </div>
            )}

            <form onSubmit={handleInstantActivation} className="space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maya Rose"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm font-medium"
                  required
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                    @
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm font-medium"
                    required
                  />
                </div>
              </div>

              {/* Category Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                  Primary Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col items-start gap-1 ${
                        category === cat.id
                          ? 'bg-rose-50/70 border-rose-400 text-rose-900 shadow-xs ring-1 ring-rose-400'
                          : 'bg-gray-50/50 border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="text-xl">{cat.icon}</span>
                      <span className="text-xs font-bold leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Short Bio */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your fans a little about yourself and what you post..."
                  rows="3"
                  maxLength={300}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm font-medium resize-none"
                />
              </div>

              {/* Mandatory 18+ Age & Legal Verification */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-extrabold text-xs tracking-wider">
                    18+ REQUIRED
                  </span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Age & Compliance Confirmation
                  </h4>
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isEighteen}
                    onChange={(e) => setIsEighteen(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-rose-500 rounded border-gray-300 focus:ring-rose-400"
                    required
                  />
                  <span className="text-xs text-gray-800 leading-relaxed font-semibold">
                    I confirm that I am at least 18 years of age and legally allowed to publish content.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none pt-2 border-t border-amber-200/60">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-rose-500 rounded border-gray-300 focus:ring-rose-400"
                    required
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    I agree to the <span className="text-rose-600 font-semibold underline">Creator Terms of Service</span> and understand that age misrepresentation results in instant account termination.
                  </span>
                </label>
              </div>

              {/* Primary Action Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isActivating || !isEighteen || !agreedToTerms}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 disabled:opacity-50 text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Setting up studio...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>{isAlreadyCreator ? 'Save Changes' : 'Start Creating (Instant Access)'}</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Progressive Notice */}
            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>🔒 Identity & payout KYC needed only when withdrawing earnings</span>
              <button
                type="button"
                onClick={() => setActiveTab('kyc')}
                className="text-rose-600 font-semibold hover:underline"
              >
                Verify KYC Now →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── KYC VERIFICATION FORM (FOR PAYOUTS) ───────────────────────── */}
        {activeTab === 'kyc' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8"
          >
            {kycSubmitted || kycStatus === 'pending' ? (
              <div className="py-8 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">KYC Verification Under Review</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                  Your identity documents have been submitted and are under review. You can continue creating and earning while we verify.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-6 px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-bold transition"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : kycStatus === 'approved' ? (
              <div className="py-8 text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Identity Verified</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Your account is verified. You can request USDT payouts at any time from your dashboard.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-6 px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Identity Verification (KYC)</h2>
                    <p className="text-xs text-gray-500">
                      Required for payouts over $50 to prevent fraud and protect creator earnings
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('day0')}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-900"
                  >
                    ← Back
                  </button>
                </div>

                {imgError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                    {imgError}
                  </div>
                )}

                <form onSubmit={handleSubmitKYC} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      value={kycForm.fullName}
                      onChange={(e) => setKycForm({ ...kycForm, fullName: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                      placeholder="As shown on government ID"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={kycForm.dateOfBirth}
                        onChange={(e) => setKycForm({ ...kycForm, dateOfBirth: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        value={kycForm.country}
                        onChange={(e) => setKycForm({ ...kycForm, country: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                        placeholder="e.g. United States"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        ID Type
                      </label>
                      <select
                        value={kycForm.idType}
                        onChange={(e) => setKycForm({ ...kycForm, idType: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                      >
                        <option value="drivers_license">Driver's License</option>
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        ID Number
                      </label>
                      <input
                        type="text"
                        value={kycForm.idNumber}
                        onChange={(e) => setKycForm({ ...kycForm, idNumber: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={kycForm.address}
                      onChange={(e) => setKycForm({ ...kycForm, address: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={kycForm.city}
                        onChange={(e) => setKycForm({ ...kycForm, city: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={kycForm.state}
                        onChange={(e) => setKycForm({ ...kycForm, state: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={kycForm.phoneNumber}
                        onChange={(e) => setKycForm({ ...kycForm, phoneNumber: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm"
                        required
                      />
                    </div>
                  </div>

                  {/* ID Upload Slots */}
                  <div className="pt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                      Upload Identification Documents
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { slot: 'front', label: 'ID Front', state: idFront },
                        { slot: 'back', label: 'ID Back', state: idBack },
                        { slot: 'selfie', label: 'Selfie with ID', state: selfie },
                      ].map(({ slot, label, state }) => (
                        <div key={slot} className="border border-gray-200 rounded-2xl p-3 text-center bg-gray-50">
                          <p className="text-xs font-bold text-gray-700 mb-2">{label}</p>
                          {state ? (
                            <div className="relative">
                              <img src={state.preview} alt="" className="w-full h-24 object-cover rounded-xl" />
                              <button
                                type="button"
                                onClick={() => {
                                  if (slot === 'front') setIdFront(null);
                                  if (slot === 'back') setIdBack(null);
                                  if (slot === 'selfie') setSelfie(null);
                                }}
                                className="mt-1.5 text-[11px] text-red-600 hover:underline"
                              >
                                Replace
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer block border border-dashed border-gray-300 rounded-xl py-5 hover:bg-white transition">
                              <Camera className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                              <span className="text-[11px] font-semibold text-gray-600">
                                {uploadingImg[slot] ? 'Uploading...' : 'Choose File'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(e, slot)}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmittingKYC}
                      className="w-full py-3.5 px-6 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold text-sm shadow transition flex items-center justify-center gap-2"
                    >
                      {isSubmittingKYC ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting documents...</span>
                        </>
                      ) : (
                        <span>Submit for Verification</span>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
