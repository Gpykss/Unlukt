// src/pages/Admin/Analytics.jsx - ADMIN ANALYTICS (not creator dashboard)
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Crown,
  Loader2, Calendar, ChevronDown, Eye, Heart, MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, getCountFromServer,
  orderBy, limit
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function Analytics() {
  const navigate = useNavigate();

  const [range, setRange] = useState(RANGES[1]);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalUsers: 0,
    totalCreators: 0,
    totalSubscriptions: 0,
    totalPosts: 0,
    totalLikes: 0,
  });

  useEffect(() => {
    loadStats();
  }, [range]);

  const since = () => {
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    return d;
  };

  const loadStats = async () => {
    try {
      setLoading(true);

      // Total revenue from completed payments
      const paymentsRef = collection(db, 'crypto_payments');
      const finishedQuery = query(paymentsRef, where('status', 'in', ['finished', 'completed', 'confirmed']));
      const paymentsSnap = await getDocs(finishedQuery);
      
      let totalRevenue = 0;
      paymentsSnap.forEach(doc => {
        totalRevenue += Number(doc.data().amount || 0);
      });

      // Total users
      const usersCount = await getCountFromServer(collection(db, 'users'));

      // Total creators
      const creatorsQuery = query(collection(db, 'users'), where('isCreator', '==', true));
      const creatorsCount = await getCountFromServer(creatorsQuery);

      // Total active subscriptions
      const subsQuery = query(collection(db, 'subscriptions'), where('status', '==', 'active'));
      const subsCount = await getCountFromServer(subsQuery);

      // Total posts
      const postsCount = await getCountFromServer(collection(db, 'posts'));

      // Total likes across all posts
      const postsSnap = await getDocs(collection(db, 'posts'));
      let totalLikes = 0;
      postsSnap.forEach(doc => {
        totalLikes += Number(doc.data().likes || 0);
      });

      setStats({
        totalRevenue,
        totalUsers: usersCount.data().count,
        totalCreators: creatorsCount.data().count,
        totalSubscriptions: subsCount.data().count,
        totalPosts: postsCount.data().count,
        totalLikes,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Platform Analytics</h1>
          </div>

          {/* Range picker */}
          <div className="relative">
            <button
              onClick={() => setShowRangeMenu(v => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold text-gray-700 transition"
            >
              <Calendar className="w-4 h-4" />
              {range.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showRangeMenu && (
              <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[120px]">
                {RANGES.map(r => (
                  <button key={r.label} onClick={() => { setRange(r); setShowRangeMenu(false); }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-50 font-medium ${range.label === r.label ? 'text-rose-600' : 'text-gray-700'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Revenue',     value: fmt(stats.totalRevenue),      icon: DollarSign, color: 'text-green-500',  bg: 'bg-green-50'  },
            { label: 'Total Users',       value: stats.totalUsers,             icon: Users,      color: 'text-blue-500',   bg: 'bg-blue-50'   },
            { label: 'Active Creators',   value: stats.totalCreators,          icon: Crown,      color: 'text-purple-500', bg: 'bg-purple-50' },
            { label: 'Active Subs',       value: stats.totalSubscriptions,     icon: TrendingUp, color: 'text-rose-500',   bg: 'bg-rose-50'   },
            { label: 'Total Posts',       value: stats.totalPosts,             icon: Eye,        color: 'text-gray-600',   bg: 'bg-gray-50'   },
            { label: 'Total Likes',       value: stats.totalLikes,             icon: Heart,      color: 'text-red-500',    bg: 'bg-red-50'    },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </motion.div>
          ))}
        </div>

        {/* More analytics sections can be added here */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-900 mb-4">Platform Overview</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Revenue per User</span>
              <span className="font-bold text-gray-900">
                {stats.totalUsers > 0 ? fmt(stats.totalRevenue / stats.totalUsers) : '$0.00'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Posts per Creator</span>
              <span className="font-bold text-gray-900">
                {stats.totalCreators > 0 ? Math.round(stats.totalPosts / stats.totalCreators) : 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Avg Likes per Post</span>
              <span className="font-bold text-gray-900">
                {stats.totalPosts > 0 ? Math.round(stats.totalLikes / stats.totalPosts) : 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}