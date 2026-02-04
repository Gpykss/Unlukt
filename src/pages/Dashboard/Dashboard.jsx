// src/pages/Dashboard/Dashboard.jsx - UPDATED WITH REAL FIRESTORE BALANCE

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Heart, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Eye,
  Plus,
  Upload,
  Image as ImageIcon,
  Video,
  Calendar,
  BarChart3,
  Settings,
  Bell,
  MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';

export default function Dashboard() {
  const navigate = useNavigate();
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // ✅ NEW: Real balance from Firestore
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // ✅ NEW: Fetch real creator balance
  useEffect(() => {
    fetchCreatorBalance();
  }, []);

  const fetchCreatorBalance = async () => {
    try {
      setLoadingBalance(true);
      const user = auth.currentUser;
      
      if (!user) {
        console.log('⚠️ No user logged in');
        setLoadingBalance(false);
        return;
      }

      const balanceRef = doc(db, 'creator_balances', user.uid);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        setBalance({
          available: data.availableBalance || 0,
          pending: data.pendingBalance || 0,
          total: data.totalEarnings || 0
        });
        console.log('✅ Creator balance loaded:', data);
      } else {
        // No balance document yet - set to zero
        setBalance({
          available: 0,
          pending: 0,
          total: 0
        });
        console.log('⚠️ No creator balance found - showing $0');
      }
    } catch (error) {
      console.error('❌ Error fetching creator balance:', error);
      // Fallback to zero on error
      setBalance({
        available: 0,
        pending: 0,
        total: 0
      });
    } finally {
      setLoadingBalance(false);
    }
  };

  // ✅ UPDATED: Use real balance instead of mock data
  const stats = {
    totalEarnings: loadingBalance ? '...' : `$${balance?.total.toFixed(2) || '0.00'}`,
    monthlyEarnings: loadingBalance ? '...' : `$${balance?.available.toFixed(2) || '0.00'}`,
    subscribers: '2.5K', // Still mock - will be updated when subscription system is ready
    newSubscribers: '+145',
    totalPosts: 148,
    totalLikes: '45.2K'
  };

  const recentActivity = [
    { id: 1, user: 'Emma K.', action: 'subscribed', amount: '$9.99', time: '2 min ago', avatar: '👩' },
    { id: 2, user: 'Mike R.', action: 'tipped', amount: '$5.00', time: '15 min ago', avatar: '👨' },
    { id: 3, user: 'Lisa M.', action: 'subscribed', amount: '$9.99', time: '1 hour ago', avatar: '👩‍🦰' },
    { id: 4, user: 'Chris L.', action: 'unlocked post', amount: '$7.99', time: '2 hours ago', avatar: '🧔' }
  ];

  const topPosts = [
    { id: 1, preview: '🎨', views: 2450, likes: 892, earnings: '$156.00' },
    { id: 2, preview: '📸', views: 1890, likes: 654, earnings: '$112.00' },
    { id: 3, preview: '💃', views: 1650, likes: 567, earnings: '$98.00' }
  ];

  const earningsData = [
    { month: 'Jan', amount: 850 },
    { month: 'Feb', amount: 920 },
    { month: 'Mar', amount: 1100 },
    { month: 'Apr', amount: 980 },
    { month: 'May', amount: balance?.total || 1240 } // ✅ Use real total for current month
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/feed')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block max-w-7xl mx-auto px-6 pt-6">
        <button 
          onClick={() => navigate('/feed')}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Back to Feed</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Total Earnings - ✅ NOW REAL */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-rose-50 rounded-xl">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />
              </div>
              <span className="text-green-500 text-xs sm:text-sm font-semibold">+12.5%</span>
            </div>
            <h3 className="text-gray-600 text-xs sm:text-sm mb-1">Total Earnings</h3>
            {loadingBalance ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.totalEarnings}</p>
            )}
            <p className="text-gray-500 text-xs mt-2">{stats.monthlyEarnings} available</p>
          </motion.div>

          {/* Subscribers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-blue-50 rounded-xl">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
              </div>
              <span className="text-green-500 text-xs sm:text-sm font-semibold">{stats.newSubscribers}</span>
            </div>
            <h3 className="text-gray-600 text-xs sm:text-sm mb-1">Subscribers</h3>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.subscribers}</p>
            <p className="text-gray-500 text-xs mt-2">Active subscribers</p>
          </motion.div>

          {/* Total Posts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-purple-50 rounded-xl">
                <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500" />
              </div>
              <span className="text-green-500 text-xs sm:text-sm font-semibold">+8</span>
            </div>
            <h3 className="text-gray-600 text-xs sm:text-sm mb-1">Total Posts</h3>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.totalPosts}</p>
            <p className="text-gray-500 text-xs mt-2">Content published</p>
          </motion.div>

          {/* Total Likes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-pink-50 rounded-xl">
                <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-pink-500" />
              </div>
              <span className="text-green-500 text-xs sm:text-sm font-semibold">+2.3K</span>
            </div>
            <h3 className="text-gray-600 text-xs sm:text-sm mb-1">Total Likes</h3>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.totalLikes}</p>
            <p className="text-gray-500 text-xs mt-2">Across all posts</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Revenue Overview */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Revenue Overview</h2>
                <select className="text-xs sm:text-sm border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:border-rose-500">
                  <option>Last 6 months</option>
                  <option>Last 3 months</option>
                  <option>This year</option>
                </select>
              </div>

              {/* Simple Bar Chart */}
              <div className="flex items-end justify-between h-48 sm:h-64 space-x-2 sm:space-x-4">
                {earningsData.map((data, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(data.amount / 1300) * 100}%` }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="w-full bg-gradient-to-t from-rose-500 to-pink-500 rounded-t-lg"
                    />
                    <p className="text-xs text-gray-500 mt-2 sm:mt-3">{data.month}</p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-900">${data.amount}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Posts */}
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Top Posts (24h)</h2>
              <div className="space-y-3 sm:space-y-4">
                {topPosts.map((post, index) => (
                  <div key={post.id} className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0">
                      {post.preview}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 sm:space-x-4 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>{post.views}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>{post.likes}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm sm:text-base text-rose-500">{post.earnings}</p>
                      <p className="text-xs text-gray-500">Earned</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Recent Activity</h2>
              <div className="space-y-3 sm:space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-3 pb-3 sm:pb-4 border-b border-gray-100 last:border-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg sm:text-xl flex-shrink-0">
                      {activity.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{activity.user}</p>
                      <p className="text-xs text-gray-500">{activity.action}</p>
                      <p className="text-xs text-gray-400">{activity.time}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs sm:text-sm font-bold text-green-600">{activity.amount}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-3 sm:mt-4 text-rose-500 hover:text-rose-600 font-semibold text-xs sm:text-sm">
                View All Activity →
              </button>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Quick Actions</h2>
              <div className="space-y-2 sm:space-y-3">
                <button 
                  onClick={() => navigate('/new-post')}
                  className="w-full flex items-center space-x-3 p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition"
                >
                  <div className="p-2 bg-rose-100 rounded-lg">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                  </div>
                  <span className="font-semibold text-sm sm:text-base text-gray-900">Upload Content</span>
                </button>
                <button className="w-full flex items-center space-x-3 p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  </div>
                  <span className="font-semibold text-sm sm:text-base text-gray-900">View Analytics</span>
                </button>
                <button 
                  onClick={() => navigate('/wallet')}
                  className="w-full flex items-center space-x-3 p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition"
                >
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                  </div>
                  <span className="font-semibold text-sm sm:text-base text-gray-900">Withdraw Funds</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Upload New Content</h2>
            
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 sm:p-12 text-center mb-4 sm:mb-6 hover:border-rose-500 transition cursor-pointer">
              <div className="flex justify-center mb-4">
                <div className="p-3 sm:p-4 bg-gray-100 rounded-full">
                  <Upload className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400" />
                </div>
              </div>
              <p className="text-sm sm:text-base text-gray-700 font-semibold mb-2">Click to upload or drag and drop</p>
              <p className="text-xs sm:text-sm text-gray-500">JPG, PNG, GIF, MP4 up to 50MB</p>
            </div>

            <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Caption</label>
                <textarea
                  placeholder="Write a caption..."
                  className="w-full px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Price (Optional)</label>
                <input
                  type="number"
                  placeholder="$0.00"
                  className="w-full px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="w-full sm:flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 sm:py-3 rounded-lg font-semibold text-sm transition"
              >
                Cancel
              </button>
              <button className="w-full sm:flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 sm:py-3 rounded-lg font-semibold text-sm transition">
                Upload Post
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}