// src/pages/Legal/PrivacyPolicy.jsx - UNLUKT VERSION

import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
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
              <div className="p-3 bg-blue-50 rounded-xl">
                <Shield className="w-6 h-6 text-blue-500" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                Privacy & Cookie Policy
              </h1>
            </div>
            <p className="text-gray-600">
              Your privacy is important to us. This policy explains how unlukt collects, uses, and protects your information.
            </p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            
            {/* Data Usage */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Usage</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use your data to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Process Payouts:</strong> Facilitate secure payments to Creators</li>
                <li><strong>Verify Your Age:</strong> Ensure all users are 18+ via KYC/biometric ID checks</li>
                <li><strong>Secure Your Account:</strong> Protect against fraud and unauthorized access</li>
              </ul>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>We never sell your personal contact information.</strong> Your privacy and trust are our top priority.
                </p>
              </div>
            </section>

            {/* Cookie Policy */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Cookies</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use functional cookies for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Login Security:</strong> Keep you securely logged into your account</li>
                <li><strong>Session Management:</strong> Maintain your active session</li>
                <li><strong>"Show Adult Content" Toggle:</strong> Remember your preference for viewing NSFW content</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                You can control cookies through your browser settings. Disabling essential cookies may affect platform functionality.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Account Information:</strong> Name, email, username, password</li>
                <li><strong>Profile Information:</strong> Bio, avatar, banner</li>
                <li><strong>KYC Information:</strong> Government ID, biometric verification (for Creators and NSFW access)</li>
                <li><strong>Payment Information:</strong> Bank details, cryptocurrency wallets</li>
                <li><strong>Content:</strong> Posts, images, videos, comments, messages</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Device Information:</strong> IP address, browser type, device type</li>
                <li><strong>Usage Data:</strong> Pages viewed, time spent, features used</li>
                <li><strong>Content Preferences:</strong> SFW/NSFW toggle settings</li>
              </ul>
            </section>

            {/* Data Security */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Security</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We implement industry-standard security measures to protect your data:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Encryption:</strong> All data transmitted using SSL/TLS encryption</li>
                <li><strong>Secure Storage:</strong> KYC records are encrypted and stored securely</li>
                <li><strong>Access Controls:</strong> Limited employee access to sensitive data</li>
                <li><strong>24-Hour Fraud Hold:</strong> Prevents fraudulent withdrawals</li>
              </ul>
            </section>

            {/* Information Sharing */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Information Sharing</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">When We Share</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We may share your information with:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Other Users:</strong> Your public profile information and content (as per your settings)</li>
                <li><strong>Payment Processors:</strong> For processing transactions</li>
                <li><strong>Service Providers:</strong> Firebase, Cloudinary (for infrastructure)</li>
                <li><strong>Legal Authorities:</strong> When required by law or to prevent harm</li>
                <li><strong>Compliance:</strong> USC 2257 record keeping requirements</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">What We Don't Share</h3>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-sm text-rose-800">
                  <strong>We never sell your personal contact information to third parties.</strong> Your data is yours.
                </p>
              </div>
            </section>

            {/* Your Rights */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your account and data</li>
                <li><strong>Export:</strong> Download your data in a portable format</li>
                <li><strong>Control NSFW Visibility:</strong> Toggle "Show Adult Content" in settings</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                To exercise these rights, contact us at <a href="mailto:support@unlukt.com" className="text-blue-500 hover:text-blue-600">support@unlukt.com</a>
              </p>
            </section>

            {/* Children's Privacy */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                unlukt is not intended for users under 18 years of age. We do not knowingly collect information from minors.
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                If we discover that a user is under 18, we will immediately terminate their account and delete all associated data.
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-sm text-rose-800">
                  <strong>Parents:</strong> If you believe your child has created an account, please contact us immediately at <a href="mailto:compliance@unlukt.com" className="text-rose-600 hover:text-rose-700">compliance@unlukt.com</a>
                </p>
              </div>
            </section>

            {/* Policy Changes */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Policy Changes</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.
              </p>
              <p className="text-gray-700 leading-relaxed">
                For significant changes, we will notify you via email or prominent notice on the platform.
              </p>
            </section>

          </div>

          {/* Contact Information */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Contact Us</h3>
            <p className="text-gray-700 mb-4">
              For privacy-related questions or concerns:
            </p>
            <div className="bg-gray-50 rounded-lg p-6 space-y-2">
              <p className="text-gray-700">
                <strong>General Support:</strong> <a href="mailto:support@unlukt.com" className="text-blue-500 hover:text-blue-600">support@unlukt.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Legal Inquiries:</strong> <a href="mailto:legal@unlukt.com" className="text-blue-500 hover:text-blue-600">legal@unlukt.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Compliance:</strong> <a href="mailto:compliance@unlukt.com" className="text-blue-500 hover:text-blue-600">compliance@unlukt.com</a>
              </p>

            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              By using unlukt, you acknowledge that you have read and understood this Privacy & Cookie Policy.
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
