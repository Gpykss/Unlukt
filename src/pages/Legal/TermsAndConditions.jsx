// src/pages/Legal/TermsAndConditions.jsx - UNLUKT VERSION

import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsAndConditions() {
  const navigate = useNavigate();
  
  const lastUpdated = "February 2, 2026";

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold">Back</span>
            </button>
            
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>Updated {lastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 sm:p-12"
        >
          {/* Title */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-rose-50 rounded-xl">
                <FileText className="w-6 h-6 text-rose-500" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                Terms and Conditions
              </h1>
            </div>
            <p className="text-gray-600">
              Please read these terms carefully before using unlukt platform.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-gray-50 rounded-xl p-6 mb-8">
            <h2 className="font-bold text-gray-900 mb-3">Table of Contents</h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="#general" className="hover:text-rose-500">1. General Terms & Conditions</a></li>
              <li><a href="#aup" className="hover:text-rose-500">2. Acceptable Use Policy & Content Policies</a></li>
              <li><a href="#age-verification" className="hover:text-rose-500">3. Age Verification Policy</a></li>
              <li><a href="#usc2257" className="hover:text-rose-500">4. USC 2257 Disclosure Statement</a></li>
              <li><a href="#anti-slavery" className="hover:text-rose-500">5. Anti-Slavery & Anti-Trafficking Statement</a></li>
              <li><a href="#dmca" className="hover:text-rose-500">6. DMCA & Intellectual Property Policy</a></li>
              <li><a href="#community" className="hover:text-rose-500">7. Community Guidelines</a></li>
              <li><a href="#privacy" className="hover:text-rose-500">8. Privacy & Cookie Policy</a></li>
              <li><a href="#api" className="hover:text-rose-500">9. Website & API Policies</a></li>
              <li><a href="#complaints" className="hover:text-rose-500">10. Complaints & Help Center</a></li>
            </ul>
          </div>

          {/* Sections */}
          <div className="prose prose-gray max-w-none">
            
            {/* Section 1 - General Terms */}
            <section id="general" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. General Terms & Conditions</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">The Service</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                unlukt is a content monetization platform connecting Creators and Fans. By using unlukt, you agree to be bound by these Terms and Conditions.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Eligibility</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                All users must be 18+ years of age. Identity verification (KYC) is mandatory for all Creators.
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-rose-800">
                  <strong>Important:</strong> You must be at least 18 years old to use unlukt. No exceptions.
                </p>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Fees & Revenue Split</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Creators receive <strong>80% of gross revenue</strong> from subscriptions, tips, and pay-per-view (PPV) content. unlukt retains <strong>20%</strong> for platform operations, security, and infrastructure.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Revenue Breakdown:</strong>
                </p>
                <ul className="text-sm text-blue-800 space-y-1 ml-4">
                  <li>• Creator earnings: 80%</li>
                  <li>• Platform fee: 20%</li>
                </ul>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Referral Program</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Referrers earn <strong>5% of a referred Creator's gross earnings</strong> for the <strong>first 4 months</strong> after the Creator joins the platform.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Payments</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Payouts are made via:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Naira Bank Transfer:</strong> Instant verification via Nigerian banks</li>
                <li><strong>Cryptocurrency (USDT TRC20):</strong> Manual verification within 24-72 hours</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Fraud Hold</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                All earnings are subject to a <strong>24-hour verification hold</strong> before becoming available for withdrawal. This prevents fraudulent transactions and chargebacks.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Security Notice:</strong> The 24-hour hold protects both Creators and the platform from fraud. Funds are released automatically after verification.
                </p>
              </div>
            </section>

            {/* Section 2 - AUP */}
            <section id="aup" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Acceptable Use Policy & Content Policies</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Content Tagging</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Creators must manually tag every upload as either:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>SFW (Safe For Work):</strong> Lifestyle, Fitness, Educational content</li>
                <li><strong>NSFW (Not Safe For Work):</strong> Explicit, Adult content</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">The "Clean Feed" Rule</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                NSFW content is <strong>blurred by default</strong> across all discovery feeds. Users must toggle <strong>"Show Adult Content"</strong> in settings to view explicit material.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Prohibited Content</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We strictly prohibit:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li>Non-consensual content</li>
                <li>Extreme violence or gore</li>
                <li>Any depiction of minors</li>
                <li>Content promoting illegal activities</li>
                <li>Hate speech or discrimination</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Misclassification</h3>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-sm text-rose-800">
                  <strong>Warning:</strong> Intentionally tagging NSFW content as SFW will result in an immediate shadow-ban or account termination.
                </p>
              </div>
            </section>

            {/* Section 3 - Age Verification */}
            <section id="age-verification" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Age Verification Policy</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Verification Requirement</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                All users wishing to access NSFW content or earn as a Creator must pass a <strong>biometric ID check</strong>.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Record Keeping</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We maintain secure, encrypted records of all verified identities in compliance with global safety standards.
              </p>
            </section>

            {/* Section 4 - USC 2257 */}
            <section id="usc2257" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. USC 2257 Disclosure Statement</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Compliance</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Pursuant to 18 U.S.C. § 2257 and § 2257A, unlukt maintains all required records of performers and creators.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Custodian of Records</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Records are maintained by the unlukt Compliance Department. Inquiries can be sent to:
              </p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700">
                  <strong>Email:</strong> <a href="mailto:compliance@unlukt.com" className="text-rose-500 hover:text-rose-600">compliance@unlukt.com</a>
                </p>
              </div>
            </section>

            {/* Section 5 - Anti-Slavery */}
            <section id="anti-slavery" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Anti-Slavery & Anti-Trafficking Statement</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Zero Tolerance Policy</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                unlukt is committed to preventing human trafficking and forced labor. All content must be created by the account holder <strong>voluntarily</strong>.
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                Any suspicious activity is reported immediately to relevant international authorities.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Report Concerns:</strong> If you suspect human trafficking or forced labor, contact us immediately at <a href="mailto:compliance@unlukt.com" className="text-blue-600 hover:text-blue-700">compliance@unlukt.com</a>
                </p>
              </div>
            </section>

            {/* Section 6 - DMCA */}
            <section id="dmca" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. DMCA & Intellectual Property Policy</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Takedown Process</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We respond to valid copyright claims within <strong>48 hours</strong>. Report infringements to:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-gray-700">
                  <strong>Email:</strong> <a href="mailto:legal@unlukt.com" className="text-rose-500 hover:text-rose-600">legal@unlukt.com</a>
                </p>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Repeat Infringers</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We enforce a <strong>"Three-Strike" policy</strong> for users who upload content they do not own.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li>Strike 1: Warning + content removal</li>
                <li>Strike 2: Temporary suspension (7 days)</li>
                <li>Strike 3: Permanent account termination</li>
              </ul>
            </section>

            {/* Section 7 - Community Guidelines */}
            <section id="community" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Community Guidelines</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Respect</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                No bullying, harassment, or doxxing. Treat all community members with respect.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Quality</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                No bot-generated spam or "follow-for-follow" schemes. Focus on creating genuine connections with your audience.
              </p>
            </section>

            {/* Section 8 - Privacy */}
            <section id="privacy" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Privacy & Cookie Policy</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Data Usage</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use your data to process payouts, verify your age, and secure your account. <strong>We never sell your personal contact information.</strong>
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Cookies</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use functional cookies for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li>Login security and session management</li>
                <li>Remembering your "Adult Content" toggle preference</li>
              </ul>
            </section>

            {/* Section 9 - API */}
            <section id="api" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Website & API Policies</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">API Usage</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Access to unlukt APIs is for <strong>authorized developers only</strong>. Data scraping or unauthorized content extraction is strictly prohibited.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Marketing Policy</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Creators must not use misleading "clickbait" or false advertising to promote their profiles on external social media.
              </p>
            </section>

            {/* Section 10 - Complaints */}
            <section id="complaints" className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Complaints & Help Center</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Resolution Process</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Users may file formal complaints via:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-gray-700">
                  <strong>Email:</strong> <a href="mailto:support@unlukt.com" className="text-rose-500 hover:text-rose-600">support@unlukt.com</a>
                </p>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Help Center</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                A self-service portal is provided for common issues regarding payouts, blurring settings, and account recovery.
              </p>
            </section>

          </div>

          {/* Contact Information */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Contact Us</h3>
            <div className="bg-gray-50 rounded-lg p-6 space-y-2">
              <p className="text-gray-700">
                <strong>General Support:</strong> <a href="mailto:support@unlukt.com" className="text-rose-500 hover:text-rose-600">support@unlukt.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Legal Inquiries:</strong> <a href="mailto:legal@unlukt.com" className="text-rose-500 hover:text-rose-600">legal@unlukt.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Compliance:</strong> <a href="mailto:compliance@unlukt.com" className="text-rose-500 hover:text-rose-600">compliance@unlukt.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Address:</strong> Port Harcourt, Rivers State, Nigeria
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              By using unlukt, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
            </p>
            <p className="text-sm text-gray-500 text-center mt-2">
              Last updated: {lastUpdated}
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}