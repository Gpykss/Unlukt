// src/pages/Legal/AboutUs.jsx - UNLUKT VERSION

import { motion } from 'framer-motion';
import { ArrowLeft, Users, Shield, Zap, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back</span>
          </button>
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
          <div className="mb-12 text-center">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
              About <span className="text-red-600">unlukt</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Empowering creators to monetize their passion securely, freely, and authentically.
            </p>
          </div>

          {/* The Vision */}
          <div className="prose prose-gray max-w-none mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Vision</h2>
            <p className="text-gray-700 leading-relaxed text-lg">
              We built <strong>unlukt</strong> because we believe creators deserve a safer, fairer, and more robust platform to build a business around their content.
              Whether you are a fitness coach sharing workout routines, an artist posting exclusive behind-the-scenes material, or an adult entertainer safely monetizing premium media,
              unlukt gives you the tools to take control of your financial freedom.
            </p>
          </div>

          {/* Key Principles grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Creator First (80% Payouts)</h3>
              <p className="text-gray-600">
                Creators do the hard work, so they keep the lion's share. We proudly offer an industry-leading 80% revenue split, ensuring your hard-earned money stays in your pocket.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Uncompromised Security</h3>
              <p className="text-gray-600">
                Safety isn't an afterthought. Every creator undergoes a mandatory biometric KYC check. Our 24-hour verification hold protects against chargebacks and fraud, ensuring a safe platform for all.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">The "Clean Feed" Rule</h3>
              <p className="text-gray-600">
                A safe experience for everyone. We strictly separate SFW and NSFW content. By default, all explicit content is blurred unless adult users explicitly opt-in via their settings.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Instant Global Payouts</h3>
              <p className="text-gray-600">
                Get paid your way. We support instant local bank transfers and global cryptocurrency withdrawals via USDT, giving creators worldwide access to their earnings.
              </p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Join the Movement</h2>
            <p className="text-gray-700 leading-relaxed text-lg">
              Today, unlukt empowers thousands of creators across over 150 countries to share their unique talents and securely connect with their biggest fans. 
              We're constantly expanding our features—from direct messaging tipping to full-suite video calls—so you have multiple avenues to grow your creator business.
            </p>
          </div>

          {/* Call to action */}
          <div className="mt-12 pt-8 border-t border-gray-200 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Ready to own your earnings?</h3>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <button 
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-200"
              >
                Become a Creator
              </button>
              <button 
                onClick={() => navigate('/discover')}
                className="w-full sm:w-auto bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-900 px-8 py-3 rounded-xl font-bold transition-all"
              >
                Explore the Platform
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
