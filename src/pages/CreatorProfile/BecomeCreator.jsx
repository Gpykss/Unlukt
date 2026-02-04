import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Crown, 
  Check, 
  ArrowRight, 
  Loader2,
  Shield,
  AlertCircle,
  User,
  MapPin,
  Phone,
  CreditCard,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { submitKYCApplication } from '../../services/firestoreService';

export default function BecomeCreator() {
  const navigate = useNavigate();
  const { currentUser, fetchUserProfile } = useAuth();
  const { profile } = useUserProfile();
  const [step, setStep] = useState(1); // 1: intro, 2: kyc form, 3: pending
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
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
    documentLinks: '', // NEW: for Google Drive/Dropbox links
  });

  const benefits = [
    'Earn money from your content',
    'Build a loyal subscriber base',
    'Exclusive creator tools',
    'Direct messaging with fans',
    'Analytics and insights',
    'Premium content options',
  ];

  // Check if already has KYC status
  const kycStatus = profile?.kycStatus;
  
  const handleNextStep = () => {
    if (step === 1 && !agreedToTerms) {
      alert('Please agree to the Creator Terms');
      return;
    }
    setStep(step + 1);
  };

  const handleSubmitKYC = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!kycForm.fullName || !kycForm.dateOfBirth || !kycForm.address || 
        !kycForm.city || !kycForm.country || !kycForm.idNumber || !kycForm.phoneNumber) {
      alert('Please fill in all required fields');
      return;
    }

    // Age verification (must be 18+)
    const birthDate = new Date(kycForm.dateOfBirth);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    if (age < 18) {
      alert('You must be 18 or older to become a creator');
      return;
    }

    try {
      setIsSubmitting(true);
      
      await submitKYCApplication(currentUser.uid, kycForm);
      await fetchUserProfile(currentUser.uid);
      
      setStep(3);
    } catch (error) {
      console.error('Error submitting KYC:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show status if already applied
  if (kycStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center"
          >
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Under Review</h2>
            <p className="text-gray-600 mb-6">
              Your creator application is being reviewed by our team. This usually takes 24-48 hours.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>What's next?</strong><br />
                We're verifying your identity and documents. You'll receive an email once your application is approved or if we need additional information.
              </p>
            </div>
            <button
              onClick={() => navigate('/feed')}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition"
            >
              Back to Feed
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (kycStatus === 'rejected') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-red-200 p-8 text-center"
          >
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Not Approved</h2>
            <p className="text-gray-600 mb-4">
              Unfortunately, your creator application was not approved.
            </p>
            {profile?.kycRejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800">
                  <strong>Reason:</strong><br />
                  {profile.kycRejectionReason}
                </p>
              </div>
            )}
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => navigate('/feed')}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition"
              >
                Back to Feed
              </button>
              <button
                onClick={() => window.location.href = 'mailto:support@unlukt.com'}
                className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
              >
                Contact Support
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Step 1: Introduction */}
        {step === 1 && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-rose-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                <Crown className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Become a Creator</h1>
              <p className="text-xl text-gray-600">
                Share your content and earn money from your fans
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 mb-6"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Creator Benefits</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    className="flex items-center space-x-3"
                  >
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </motion.div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center space-x-2">
                  <Shield className="w-5 h-5" />
                  <span>Identity Verification Required</span>
                </h3>
                <p className="text-blue-800 text-sm mb-2">
                  To become a creator, you'll need to verify your identity. This helps us:
                </p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 text-sm">
                  <li>Ensure platform safety and authenticity</li>
                  <li>Comply with legal requirements</li>
                  <li>Process payments securely</li>
                  <li>Protect both creators and subscribers</li>
                </ul>
              </div>

              <div className="flex items-start space-x-3 mb-6">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="w-5 h-5 text-rose-500 border-gray-300 rounded focus:ring-rose-500 mt-0.5"
                />
                <label htmlFor="terms" className="text-sm text-gray-600">
                  I agree to the{' '}
                  <button className="text-rose-500 hover:text-rose-600 font-medium">
                    Creator Terms
                  </button>{' '}
                  and understand that I must be 18+ and comply with all platform guidelines.
                </label>
              </div>

              <button
                onClick={handleNextStep}
                disabled={!agreedToTerms}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white py-4 rounded-lg font-bold text-lg transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue to Verification</span>
                <ArrowRight className="w-6 h-6" />
              </button>
            </motion.div>
          </>
        )}

        {/* Step 2: KYC Form */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Identity Verification</h2>
            <p className="text-gray-600 mb-6">
              Please provide accurate information. All data is encrypted and secure.
            </p>

            <form onSubmit={handleSubmitKYC} className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <User className="w-5 h-5" />
                  <span>Personal Information</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Legal Name *
                    </label>
                    <input
                      type="text"
                      value={kycForm.fullName}
                      onChange={(e) => setKycForm({ ...kycForm, fullName: e.target.value })}
                      placeholder="As it appears on your ID"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date of Birth *
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="date"
                        value={kycForm.dateOfBirth}
                        onChange={(e) => setKycForm({ ...kycForm, dateOfBirth: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                        required
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">You must be 18 or older</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="tel"
                        value={kycForm.phoneNumber}
                        onChange={(e) => setKycForm({ ...kycForm, phoneNumber: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <MapPin className="w-5 h-5" />
                  <span>Address</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      value={kycForm.address}
                      onChange={(e) => setKycForm({ ...kycForm, address: e.target.value })}
                      placeholder="123 Main St, Apt 4B"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        City *
                      </label>
                      <input
                        type="text"
                        value={kycForm.city}
                        onChange={(e) => setKycForm({ ...kycForm, city: e.target.value })}
                        placeholder="New York"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        State/Province
                      </label>
                      <input
                        type="text"
                        value={kycForm.state}
                        onChange={(e) => setKycForm({ ...kycForm, state: e.target.value })}
                        placeholder="NY"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ZIP/Postal Code
                      </label>
                      <input
                        type="text"
                        value={kycForm.zipCode}
                        onChange={(e) => setKycForm({ ...kycForm, zipCode: e.target.value })}
                        placeholder="10001"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Country *
                      </label>
                      <input
                        type="text"
                        value={kycForm.country}
                        onChange={(e) => setKycForm({ ...kycForm, country: e.target.value })}
                        placeholder="United States"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ID Verification */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <span>ID Verification</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ID Type *
                    </label>
                    <select
                      value={kycForm.idType}
                      onChange={(e) => setKycForm({ ...kycForm, idType: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      required
                    >
                      <option value="drivers_license">Driver's License</option>
                      <option value="passport">Passport</option>
                      <option value="national_id">National ID Card</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ID Number *
                    </label>
                    <input
                      type="text"
                      value={kycForm.idNumber}
                      onChange={(e) => setKycForm({ ...kycForm, idNumber: e.target.value })}
                      placeholder="ID or passport number"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                      required
                    />
                  </div>

                  {/* Document Links (Optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Document Links (Optional)
                    </label>
                    <input
                      type="url"
                      value={kycForm.documentLinks}
                      onChange={(e) => setKycForm({ ...kycForm, documentLinks: e.target.value })}
                      placeholder="Google Drive, Dropbox, or other secure link to your ID"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Upload your ID to Google Drive or Dropbox and share the link here
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-semibold mb-1">Document Verification Process</p>
                        <p>
                          Our team will contact you via email within 24-48 hours to complete identity verification. 
                          You'll be asked to provide your ID documents securely through our verification partner.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg font-semibold transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Application</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Step 3: Pending */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center"
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted!</h2>
            <p className="text-gray-600 mb-6">
              Thank you for applying to become a creator. Your application is being reviewed.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>What happens next?</strong><br />
                Our team will review your application within 24-48 hours. You'll receive an email notification once your application is approved.
              </p>
            </div>
            <button
              onClick={() => navigate('/feed')}
              className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
            >
              Back to Feed
            </button>
          </motion.div>
        )}

        {/* Maybe Later */}
        {step !== 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <button
              onClick={() => navigate('/feed')}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              Maybe Later
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}