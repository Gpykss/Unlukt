// src/pages/Landing/Landing.jsx - UNLUKT FINAL VERSION

import { motion } from 'framer-motion';
import { TrendingUp, ArrowRight, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  // Mock data for trending creators
  const trendingCreators = [
    { id: 1, name: 'Sarah', avatar: '👩', role: 'Model' },
    { id: 2, name: 'Alex', avatar: '👨', role: 'Fitness' },
    { id: 3, name: 'Emma', avatar: '👱‍♀️', role: 'Artist' },
    { id: 4, name: 'Mike', avatar: '🧔', role: 'Chef' },
    { id: 5, name: 'Lisa', avatar: '👩‍🦰', role: 'Dancer' },
    { id: 6, name: 'Chris', avatar: '👨‍🦱', role: 'Musician' },
  ];

  // Mock data for featured creators
  const featuredCreators = [
    { 
      id: 1, 
      name: 'Sophia Styles', 
      username: '@sophia.styles', 
      price: '$9.99', 
      subscribers: '2.5K',
      posts: 145,
      image: '🎨',
      verified: true
    },
    { 
      id: 2, 
      name: 'Noah Grant', 
      username: '@noah.grant', 
      price: '$14.99', 
      subscribers: '5.2K',
      posts: 289,
      image: '📸',
      verified: true
    },
    { 
      id: 3, 
      name: 'Olivia Pierce', 
      username: '@liv.pierce', 
      price: '$12.99', 
      subscribers: '3.8K',
      posts: 198,
      image: '💃',
      verified: true
    },
    { 
      id: 4, 
      name: 'Liam Hart', 
      username: '@liam.hart', 
      price: '$19.99', 
      subscribers: '8.1K',
      posts: 367,
      image: '🎵',
      verified: true
    },
  ];

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-rose-50">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center cursor-pointer"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <span className="text-2xl font-black text-gray-900 flex items-center tracking-tight" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
                Unl
                <LockKeyhole className="w-6 h-6 text-red-600 mx-0.5" strokeWidth={1.8} fill="none" />
                kt
              </span>
            </motion.div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center space-x-10">
              <button 
                onClick={() => scrollToSection('featured')}
                className="text-gray-700 hover:text-rose-500 font-medium transition-colors"
              >
                Features
              </button>
              <button 
                onClick={() => scrollToSection('trending')}
                className="text-gray-700 hover:text-rose-500 font-medium transition-colors"
              >
                Creators
              </button>
            </div>

            {/* Auth Buttons */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-4"
            >
              <button 
                onClick={() => navigate('/login')}
                className="text-gray-700 hover:text-gray-900 font-semibold transition-colors px-4"
              >
                Login
              </button>
              <button 
                onClick={() => navigate('/register')}
                className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-rose-200 hover:shadow-xl"
              >
                Sign Up
              </button>
            </motion.div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
          <div className="text-center">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center space-x-2 bg-rose-50 border border-rose-200 text-rose-600 px-4 sm:px-5 py-2 rounded-full mb-6 sm:mb-8"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-semibold">JOIN 100,000+ CREATORS</span>
            </motion.div>

            {/* Main Heading - ✅ CENTERED WITH LOCK */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 sm:mb-6 leading-tight px-4"
              style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
            >
              <div className="flex items-center justify-center mb-2">
                <span className="text-gray-900 tracking-tight">Unl</span>
                <LockKeyhole 
                  className="w-12 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 text-red-600 mx-1 sm:mx-2" 
                  strokeWidth={1.8} 
                  fill="none" 
                />
                <span className="text-gray-900 tracking-tight">kt</span>
              </div>
              <span className="block text-red-600 font-bold tracking-tight">
                Unlock. Connect. Own your earnings.
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed"
            >
              The ultimate platform for creators to monetize exclusive content.
              Connect with your fans. Keep 80% of your earnings. Uncensored.
            </motion.p>

            {/* CTA Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col items-center space-y-6 mb-12"
            >
              {/* Checkbox */}
              <div className="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="age-confirm" 
                  className="w-5 h-5 text-rose-500 border-gray-300 rounded focus:ring-rose-500 focus:ring-2"
                />
                <label htmlFor="age-confirm" className="text-gray-700 font-medium">
                  I am 18 years or older
                </label>
              </div>

              {/* Main CTA Button */}
              <button 
                onClick={() => navigate('/register')}
                className="group bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white px-10 py-5 rounded-2xl text-lg font-bold transition-all shadow-2xl shadow-rose-300 hover:shadow-rose-400 hover:scale-105"
              >
                <span className="flex items-center space-x-2">
                  <span>Get Started</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex items-center justify-center space-x-12"
            >
              <div className="text-center">
                <p className="text-4xl font-bold bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">2.5M+</p>
                <p className="text-sm text-gray-600 font-medium mt-1">Active Creators</p>
              </div>
              <div className="w-px h-12 bg-gray-300"></div>
              <div className="text-center">
                <p className="text-4xl font-bold bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">$50M+</p>
                <p className="text-sm text-gray-600 font-medium mt-1">Paid to Creators</p>
              </div>
              <div className="w-px h-12 bg-gray-300"></div>
              <div className="text-center">
                <p className="text-4xl font-bold bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">150+</p>
                <p className="text-sm text-gray-600 font-medium mt-1">Countries</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trending Now Section */}
      <section id="trending" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Trending Now</h2>
              <p className="text-gray-600">Top creators everyone is talking about</p>
            </div>
            <button className="text-rose-500 hover:text-rose-600 font-semibold flex items-center space-x-1 group">
              <span>View All</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
            {trendingCreators.map((creator, index) => (
              <motion.div
                key={creator.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="group cursor-pointer"
              >
                <div className="bg-gradient-to-br from-gray-50 to-rose-50 rounded-2xl p-6 border-2 border-gray-100 hover:border-rose-300 hover:shadow-xl transition-all">
                  <div className="text-6xl mb-4 text-center group-hover:scale-110 transition-transform">{creator.avatar}</div>
                  <h3 className="font-bold text-gray-900 text-center mb-1">{creator.name}</h3>
                  <p className="text-sm text-gray-500 text-center">{creator.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Creators */}
      <section id="featured" className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-3">Featured Creators</h2>
            <p className="text-lg text-gray-600">Discover top-rated exclusive content</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {featuredCreators.map((creator, index) => (
              <motion.div
                key={creator.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group bg-white rounded-3xl overflow-hidden border-2 border-gray-100 hover:border-rose-300 hover:shadow-2xl transition-all cursor-pointer"
              >
                {/* Creator Image */}
                <div className="relative aspect-square bg-gradient-to-br from-rose-100 via-pink-50 to-orange-50 flex items-center justify-center overflow-hidden">
                  <span className="text-9xl group-hover:scale-110 transition-transform duration-300">{creator.image}</span>
                  
                  {/* Price Badge */}
                  <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-gray-100">
                    <p className="text-sm font-bold text-rose-500">{creator.price}/mo</p>
                  </div>

                  {/* Verified Badge */}
                  {creator.verified && (
                    <div className="absolute top-4 right-4 bg-blue-500 text-white p-2 rounded-full shadow-lg">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Creator Info */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900 mb-1">{creator.name}</h3>
                      <p className="text-sm text-gray-500">{creator.username}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Posts</p>
                      <p className="text-lg font-bold text-gray-900">{creator.posts}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fans</p>
                      <p className="text-lg font-bold text-gray-900">{creator.subscribers}</p>
                    </div>
                  </div>

                  {/* Subscribe Button */}
                  <button className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white py-3.5 rounded-xl font-semibold transition-all shadow-lg shadow-rose-200 hover:shadow-xl group-hover:scale-105">
                    Subscribe Now
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              {/* Footer Logo */}
              <div className="flex items-center mb-4">
                <span className="text-2xl font-black text-gray-900 flex items-center tracking-tight" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
                  unl
                  <LockKeyhole className="w-6 h-6 text-red-600 mx-0.5" strokeWidth={1.8} fill="none" />
                  kt
                </span>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Premium content platform empowering creators worldwide.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-rose-500 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-rose-500 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-rose-500 transition-colors">Press Kit</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-4">Support And Legal</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="/help" className="hover:text-rose-500 transition-colors">Help Center</a></li>
                <li><a href="/legal/privacy" className="hover:text-rose-500 transition-colors">Privacy Policy</a></li>
                <li><a href="/legal/terms" className="hover:text-rose-500 transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8">
            <p className="text-center text-sm text-gray-600">
              © 2025 unlukt. All rights reserved. Made with ❤️ for creators.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}