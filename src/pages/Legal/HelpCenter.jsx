// src/pages/Legal/HelpCenter.jsx - UNLUKT VERSION

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Search, 
  HelpCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Shield,
  CreditCard,
  Users,
  Settings,
  MessageCircle,
  Mail,
  Eye,
  EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function HelpCenter() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedFaq, setExpandedFaq] = useState(null);

  const categories = [
    { id: 'all', name: 'All Topics', icon: HelpCircle },
    { id: 'getting-started', name: 'Getting Started', icon: Users },
    { id: 'payments', name: 'Payments & Earnings', icon: CreditCard },
    { id: 'content', name: 'Content & Safety', icon: Eye },
    { id: 'creator', name: 'For Creators', icon: Settings },
    { id: 'account', name: 'Account & Security', icon: Shield }
  ];

  const faqs = [
    // Getting Started
    {
      id: 1,
      category: 'getting-started',
      question: 'How do I create an account on unlukt?',
      answer: 'Click "Sign Up", enter your email and password, and verify your email. You must be at least 18 years old. To become a Creator or access NSFW content, you\'ll need to complete KYC verification with a government ID.'
    },
    {
      id: 2,
      category: 'getting-started',
      question: 'What is the age requirement?',
      answer: 'All users must be 18+ years of age. No exceptions. This is strictly enforced through biometric ID verification for Creators and anyone wishing to view NSFW content.'
    },
    {
      id: 3,
      category: 'getting-started',
      question: 'What is the difference between SFW and NSFW content?',
      answer: 'SFW (Safe For Work) includes lifestyle, fitness, and educational content. NSFW (Not Safe For Work) includes explicit adult content. All NSFW content is blurred by default in feeds unless you toggle "Show Adult Content" in your settings.'
    },

    // Payments & Earnings
    {
      id: 4,
      category: 'payments',
      question: 'How much do Creators earn?',
      answer: 'Creators receive 80% of gross revenue from subscriptions, tips, and pay-per-view content. unlukt retains 20% for platform operations and security.'
    },

    {
      id: 6,
      category: 'payments',
      question: 'What payment methods does unlukt accept?',
      answer: 'We accept Naira Bank Transfer (instant verification) and USDT (TRC20) cryptocurrency (24-72 hour verification). Nigeria users pay an additional 1.5% VAT on crypto payments.'
    },
    {
      id: 7,
      category: 'payments',
      question: 'Why is there a 24-hour hold on my earnings?',
      answer: 'All earnings are subject to a 24-hour fraud verification hold to prevent chargebacks and fraudulent transactions. This protects both Creators and the platform. Funds are released automatically after verification.'
    },
    {
      id: 8,
      category: 'payments',
      question: 'How do I withdraw my earnings?',
      answer: 'Once your earnings pass the 24-hour hold and become "available", you can withdraw them via Naira Bank Transfer or Cryptocurrency. Go to your Wallet and click "Withdraw Funds".'
    },
    {
      id: 9,
      category: 'payments',
      question: 'What is the minimum withdrawal amount?',
      answer: 'The minimum withdrawal amount is $10 USD equivalent. This helps reduce transaction fees for small amounts.'
    },

    // Content & Safety
    {
      id: 10,
      category: 'content',
      question: 'How do I tag my content as SFW or NSFW?',
      answer: 'When uploading content, you must manually select either "SFW" or "NSFW". This is mandatory. Intentionally tagging NSFW content as SFW will result in an immediate shadow-ban or account termination.'
    },
    {
      id: 11,
      category: 'content',
      question: 'What is the "Clean Feed" rule?',
      answer: 'NSFW content is automatically blurred across all discovery feeds. Users must manually toggle "Show Adult Content" in their settings to view explicit material. This keeps the default experience safe for all users.'
    },
    {
      id: 12,
      category: 'content',
      question: 'What content is prohibited on unlukt?',
      answer: 'We strictly prohibit: non-consensual content, extreme violence/gore, any depiction of minors, content promoting illegal activities, hate speech, and forced labor. Violations result in immediate account termination.'
    },
    {
      id: 13,
      category: 'content',
      question: 'How do I enable "Show Adult Content"?',
      answer: 'Go to Settings > Content Preferences > Toggle "Show Adult Content". You must be 18+ and verified to enable this feature. The platform will remember your preference via cookies.'
    },
    {
      id: 14,
      category: 'content',
      question: 'What happens if I mistag my content?',
      answer: 'Accidentally mistagging content will result in a warning and content removal. Intentionally tagging NSFW as SFW to bypass the blur is considered fraud and results in immediate shadow-ban or permanent termination.'
    },

    // For Creators
    {
      id: 15,
      category: 'creator',
      question: 'Do I need KYC verification to become a Creator?',
      answer: 'Yes. All Creators must complete KYC (Know Your Customer) verification with a government-issued ID and biometric check. This is mandatory for compliance with USC 2257 and anti-trafficking laws.'
    },
    {
      id: 16,
      category: 'creator',
      question: 'How do I set my subscription price?',
      answer: 'Go to your Creator Settings and set your monthly subscription price. You can change this at any time, but it won\'t affect existing subscribers until their next renewal.'
    },
    {
      id: 17,
      category: 'creator',
      question: 'Can I offer both free and paid content?',
      answer: 'Yes! You can mark individual posts as "Free" when uploading. Free posts are visible to everyone. This is a great way to attract new subscribers while keeping premium content for paying fans.'
    },
    {
      id: 18,
      category: 'creator',
      question: 'Where can I see my earnings?',
      answer: 'Go to your Dashboard to view total earnings, available balance, pending balance (in 24-hour hold), subscriber count, and post statistics. Everything updates in real-time.'
    },
    {
      id: 19,
      category: 'creator',
      question: 'What is the "Three-Strike" policy?',
      answer: 'If you upload content you don\'t own (copyright infringement): Strike 1 = Warning + removal, Strike 2 = 7-day suspension, Strike 3 = Permanent ban. Respect intellectual property rights.'
    },

    // Account & Security
    {
      id: 20,
      category: 'account',
      question: 'How do I verify my identity?',
      answer: 'Go to Settings > Verification > Upload Government ID (passport, driver\'s license, or national ID). Our system will perform a biometric check. Verification is mandatory for Creators and NSFW access.'
    },
    {
      id: 21,
      category: 'account',
      question: 'Is my payment information secure?',
      answer: 'Yes. We use SSL/TLS encryption for all transactions. Payment details are processed through secure third-party providers. We never store your full card numbers or crypto wallet private keys.'
    },
    {
      id: 22,
      category: 'account',
      question: 'How do I report suspicious activity?',
      answer: 'If you suspect human trafficking, forced labor, or minors, immediately contact compliance@unlukt.com. For other issues like harassment or copyright violations, use the "Report" button on the content or user profile.'
    },
    {
      id: 23,
      category: 'account',
      question: 'Can I delete my account?',
      answer: 'Yes. Go to Settings > Account > Delete Account. Warning: This is permanent and cannot be undone. All your content, earnings (if not withdrawn), and data will be permanently deleted.'
    },
    {
      id: 24,
      category: 'account',
      question: 'What if I forget my password?',
      answer: 'Click "Forgot Password" on the login page. We\'ll send a reset link to your registered email. For additional security, you may need to verify your identity before resetting.'
    }
  ];

  const filteredFaqs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFaq = (id) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold">Back</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-rose-500 to-pink-600 text-white py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-block p-4 bg-white/20 backdrop-blur-sm rounded-2xl mb-6">
              <HelpCircle className="w-12 h-12" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              How can we help you?
            </h1>
            <p className="text-xl text-white/90 mb-8">
              Find answers to common questions about unlukt
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for help..."
                  className="w-full pl-12 pr-4 py-4 text-gray-900 rounded-xl border-0 shadow-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Categories Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-24">
              <h3 className="font-bold text-gray-900 mb-4">Categories</h3>
              <div className="space-y-2">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg transition ${
                        activeCategory === category.id
                          ? 'bg-rose-50 text-rose-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm font-medium text-left">{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FAQs */}
          <div className="lg:col-span-3">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {searchQuery ? 'Search Results' : categories.find(c => c.id === activeCategory)?.name || 'All Topics'}
              </h2>
              <p className="text-gray-600">
                {filteredFaqs.length} {filteredFaqs.length === 1 ? 'article' : 'articles'} found
              </p>
            </div>

            {filteredFaqs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <HelpCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-600 mb-6">
                  Try different keywords or browse categories
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                  }}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
                >
                  View All Topics
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFaqs.map((faq) => (
                  <motion.div
                    key={faq.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleFaq(faq.id)}
                      className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-gray-50 transition"
                    >
                      <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                          expandedFaq === faq.id ? 'transform rotate-180' : ''
                        }`}
                      />
                    </button>
                    
                    <AnimatePresence>
                      {expandedFaq === faq.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-gray-200"
                        >
                          <div className="p-4 sm:p-6 bg-gray-50">
                            <p className="text-gray-700 leading-relaxed">{faq.answer}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div
            onClick={() => navigate('/legal/terms')}
            className="bg-white rounded-xl border border-gray-200 p-6 cursor-pointer hover:border-rose-500 hover:shadow-lg transition group"
          >
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-rose-50 rounded-xl group-hover:bg-rose-100 transition">
                <FileText className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Terms & Conditions</h3>
                <p className="text-sm text-gray-600">Read our full terms</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 ml-auto mt-4" />
          </div>

          <div
            onClick={() => navigate('/legal/privacy')}
            className="bg-white rounded-xl border border-gray-200 p-6 cursor-pointer hover:border-blue-500 hover:shadow-lg transition group"
          >
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition">
                <Shield className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Privacy Policy</h3>
                <p className="text-sm text-gray-600">How we protect your data</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 ml-auto mt-4" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-green-50 rounded-xl">
                <MessageCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Still need help?</h3>
                <p className="text-sm text-gray-600">Contact our support team</p>
              </div>
            </div>
            <a
              href="mailto:support@unlukt.com"
              className="flex items-center space-x-2 text-green-600 hover:text-green-700 font-semibold text-sm"
            >
              <Mail className="w-4 h-4" />
              <span>support@unlukt.com</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
