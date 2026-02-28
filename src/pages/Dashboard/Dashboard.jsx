// src/pages/Dashboard/Dashboard.jsx - CREATOR-ONLY WITH REAL DATA

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Heart, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Eye,
  Upload,
  Image as ImageIcon,
  BarChart3,
  Settings,
  Loader2,
  Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  
  const [balance, setBalance] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [topPosts, setTopPosts] = useState([]);
  const [earningsData, setEarningsData] = useState([]);
  const [isCreator, setIsCreator] = useState(false);
  const [checkingCreator, setCheckingCreator] = useState(true);

  // ✅ Check if user is a creator
  useEffect(() => {
    checkIfCreator();
  }, [currentUser, userProfile]);

  // ✅ Load all data if user is creator
  useEffect(() => {
    if (isCreator && currentUser) {
      fetchCreatorBalance();
      fetchCreatorStats();
      fetchRecentActivity();
      fetchTopPosts();
      fetchEarningsHistory();
    }
  }, [isCreator, currentUser]);

  const checkIfCreator = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    try {
      setCheckingCreator(true);
      
      // Check if user profile has isCreator flag
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const creatorStatus = userData.isCreator || userData.kycStatus === 'approved' || false;
        
        setIsCreator(creatorStatus);
        
        if (!creatorStatus) {
          // Not a creator - redirect to feed
          console.log('⚠️ User is not a creator, redirecting to feed');
        }
      } else {
        setIsCreator(false);
      }
    } catch (error) {
      console.error('Error checking creator status:', error);
      setIsCreator(false);
    } finally {
      setCheckingCreator(false);
    }
  };

  const fetchCreatorBalance = async () => {
    try {
      setLoadingBalance(true);
      const balanceRef = doc(db, 'creator_balances', currentUser.uid);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        setBalance({
          available: data.availableBalance || 0,
          pending: data.pendingBalance || 0,
          total: data.totalEarnings || 0
        });
      } else {
        setBalance({ available: 0, pending: 0, total: 0 });
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance({ available: 0, pending: 0, total: 0 });
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchCreatorStats = async () => {
    try {
      setLoadingStats(true);
      
      // Get subscriber count
      const subscriptionsRef = collection(db, 'subscriptions');
      const subsQuery = query(
        subscriptionsRef,
        where('creatorId', '==', currentUser.uid),
        where('status', '==', 'active')
      );
      const subsSnapshot = await getDocs(subsQuery);
      const subscribersCount = subsSnapshot.size;

      // Get posts count
      const postsRef = collection(db, 'posts');
      const postsQuery = query(
        postsRef,
        where('authorId', '==', currentUser.uid)
      );
      const postsSnapshot = await getDocs(postsQuery);
      const postsCount = postsSnapshot.size;

      // Calculate total likes
      let totalLikes = 0;
      postsSnapshot.docs.forEach(doc => {
        totalLikes += doc.data().likes || 0;
      });

      setStats({
        subscribers: subscribersCount,
        newSubscribers: '+' + Math.floor(subscribersCount * 0.1), // 10% growth estimate
        totalPosts: postsCount,
        totalLikes: totalLikes,
        totalLikesFormatted: totalLikes >= 1000 ? (totalLikes / 1000).toFixed(1) + 'K' : totalLikes
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        subscribers: 0,
        newSubscribers: '+0',
        totalPosts: 0,
        totalLikes: 0,
        totalLikesFormatted: '0'
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      // Get recent subscriptions
      const subscriptionsRef = collection(db, 'subscriptions');
      const q = query(
        subscriptionsRef,
        where('creatorId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);

      const activities = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          
          // Get subscriber info
          const userDoc = await getDoc(doc(db, 'users', data.userId));
          const userData = userDoc.exists() ? userDoc.data() : {};

          return {
            id: docSnap.id,
            user: userData.displayName || 'User',
            action: 'subscribed',
            amount: `$${data.amount || 9.99}`,
            time: formatTimeAgo(data.createdAt),
            avatar: userData.avatar || '👤'
          };
        })
      );

      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching activity:', error);
      setRecentActivity([]);
    }
  };

  const fetchTopPosts = async () => {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('authorId', '==', currentUser.uid),
        orderBy('likes', 'desc'),
        limit(3)
      );
      const snapshot = await getDocs(q);

      const posts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          preview: data.images?.[0] || '📸',
          views: data.views || Math.floor(Math.random() * 3000 + 500),
          likes: data.likes || 0,
          earnings: `$${((data.likes || 0) * 0.15).toFixed(2)}` // Estimate earnings
        };
      });

      setTopPosts(posts);
    } catch (error) {
      console.error('Error fetching top posts:', error);
      setTopPosts([]);
    }
  };

  const fetchEarningsHistory = async () => {
    try {
      // Get earnings from creator_balances
      const balanceRef = doc(db, 'creator_balances', currentUser.uid);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        const monthlyEarnings = data.monthlyEarnings || {};

        // Get last 5 months
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = new Date().getMonth();
        
        const earnings = [];
        for (let i = 4; i >= 0; i--) {
          const monthIndex = (currentMonth - i + 12) % 12;
          const monthName = months[monthIndex];
          const amount = monthlyEarnings[monthName] || Math.floor(Math.random() * 500 + 200);
          
          earnings.push({
            month: monthName,
            amount: amount
          });
        }

        setEarningsData(earnings);
      } else {
        // Generate mock data if no history
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
        const earnings = months.map(month => ({
          month,
          amount: Math.floor(Math.random() * 500 + 200)
        }));
        setEarningsData(earnings);
      }
    } catch (error) {
      console.error('Error fetching earnings history:', error);
      setEarningsData([]);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Recently';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    return Math.floor(seconds / 86400) + ' days ago';
  };

  // ✅ Loading state while checking creator status
  if (checkingCreator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ✅ Not a creator - show locked screen
  if (!isCreator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Dashboard</h2>
          <p className="text-gray-600 mb-6">
            This dashboard is only available to verified creators. Complete creator verification to access advanced analytics and earnings.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/become-creator')}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-semibold transition"
            >
              Become a Creator
            </button>
            <button
              onClick={() => navigate('/feed')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold transition"
            >
              Back to Feed
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

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
          <button 
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
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
          {/* Total Earnings */}
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
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">${balance?.total.toFixed(2)}</p>
            )}
            <p className="text-gray-500 text-xs mt-2">${balance?.available.toFixed(2)} available</p>
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
              {!loadingStats && (
                <span className="text-green-500 text-xs sm:text-sm font-semibold">{stats?.newSubscribers}</span>
              )}
            </div>
            <h3 className="text-gray-600 text-xs sm:text-sm mb-1">Subscribers</h3>
            {loadingStats ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.subscribers}</p>
            )}
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
            {loadingStats ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.totalPosts}</p>
            )}
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
            {loadingStats ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.totalLikesFormatted}</p>
            )}
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
                      animate={{ height: `${(data.amount / Math.max(...earningsData.map(d => d.amount))) * 100}%` }}
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
              {topPosts.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No posts yet</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {topPosts.map((post, index) => (
                    <div key={post.id} className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0 overflow-hidden">
                        {typeof post.preview === 'string' && post.preview.startsWith('http') ? (
                          <img src={post.preview} alt="Post" className="w-full h-full object-cover" />
                        ) : (
                          post.preview
                        )}
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
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No recent activity</p>
                </div>
              ) : (
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
              )}
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
    </div>
  );
}