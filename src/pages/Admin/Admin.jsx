// src/pages/Admin/Admin.jsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Users, 
  FileCheck, 
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Wallet,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { db } from '../../config/firebase';
import NGNPayments from './NGNPayments';

export default function Admin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCreators: 0,
    pendingKYC: 0,
    approvedKYC: 0,
    rejectedKYC: 0,
    totalRevenue: 0,
    pendingPayments: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      
      const usersRef = collection(db, 'users');
      
      // Total users
      const totalUsersSnap = await getCountFromServer(usersRef);
      
      // Total creators
      const creatorsQuery = query(usersRef, where('isCreator', '==', true));
      const creatorsSnap = await getCountFromServer(creatorsQuery);
      
      // Pending KYC
      const pendingQuery = query(usersRef, where('kycStatus', '==', 'pending'));
      const pendingSnap = await getCountFromServer(pendingQuery);
      
      // Approved KYC
      const approvedQuery = query(usersRef, where('kycStatus', '==', 'approved'));
      const approvedSnap = await getCountFromServer(approvedQuery);
      
      // Rejected KYC
      const rejectedQuery = query(usersRef, where('kycStatus', '==', 'rejected'));
      const rejectedSnap = await getCountFromServer(rejectedQuery);

      // ✅ Revenue from crypto_payments (verified/finished)
      const cryptoSnap = await getDocs(
        query(collection(db, 'crypto_payments'),
          where('status', 'in', ['finished', 'completed', 'confirmed', 'verified']))
      );
      let totalRevenue = 0;
      cryptoSnap.forEach(doc => { totalRevenue += Number(doc.data().amount || 0); });

      // ✅ Revenue from approved NGN payments
      const ngnApprovedSnap = await getDocs(
        query(collection(db, 'ngn_payments'), where('status', '==', 'approved'))
      );
      ngnApprovedSnap.forEach(doc => { totalRevenue += Number(doc.data().amountUSD || 0); });

      // ✅ Pending payments (crypto waiting + NGN pending)
      const [cryptoPendingSnap, ngnPendingSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'crypto_payments'), where('status', 'in', ['waiting', 'confirming', 'pending_review']))),
        getCountFromServer(query(collection(db, 'ngn_payments'), where('status', '==', 'pending'))),
      ]);
      const pendingPaymentsSnap = { data: () => ({ count: cryptoPendingSnap.data().count + ngnPendingSnap.data().count }) };
      
      setStats({
        totalUsers: totalUsersSnap.data().count,
        totalCreators: creatorsSnap.data().count,
        pendingKYC: pendingSnap.data().count,
        approvedKYC: approvedSnap.data().count,
        rejectedKYC: rejectedSnap.data().count,
        totalRevenue,
        pendingPayments: pendingPaymentsSnap.data().count,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const adminSections = [
    {
      id: 'kyc',
      title: 'KYC Management',
      description: 'Review and approve creator applications',
      icon: FileCheck,
      color: 'rose',
      gradient: 'from-rose-500 to-pink-500',
      route: '/admin/kyc',
      stat: stats.pendingKYC,
      statLabel: 'Pending Applications',
      needsAttention: stats.pendingKYC > 0
    },
    {
      id: 'payments',
      title: 'Crypto Payments',
      description: 'Review NowPayments USDT transactions',
      icon: Wallet,
      color: 'green',
      gradient: 'from-green-500 to-emerald-500',
      route: '/admin/crypto-payments',
      stat: stats.pendingPayments,
      statLabel: 'Pending Verification',
      needsAttention: stats.pendingPayments > 0
    },
    {
      id: 'ngn',
      title: 'NGN Payments',
      description: 'Approve Nigerian bank transfer proofs',
      icon: DollarSign,
      color: 'emerald',
      gradient: 'from-emerald-500 to-teal-500',
      route: '/admin/ngn-payments',
      stat: stats.pendingPayments,
      statLabel: 'Pending Approval',
      needsAttention: stats.pendingPayments > 0
    },
    {
      id: 'users',
      title: 'User Management',
      description: 'Manage users and creators',
      icon: Users,
      color: 'blue',
      gradient: 'from-blue-500 to-indigo-500',
      route: '/admin/users',
      stat: stats.totalUsers,
      statLabel: 'Total Users'
    },
    {
      id: 'analytics',
      title: 'Analytics',
      description: 'View platform statistics',
      icon: TrendingUp,
      color: 'purple',
      gradient: 'from-purple-500 to-pink-500',
      route: '/admin/analytics',
      stat: stats.totalCreators,
      statLabel: 'Active Creators'
    },
    {
      id: 'settings',
      title: 'Platform Settings',
      description: 'Set NGN exchange rate & payment config',
      icon: Settings,
      color: 'orange',
      gradient: 'from-orange-500 to-amber-500',
      route: '/admin/settings',
      stat: null,
      statLabel: 'NGN Rate & Buffer'
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage your platform</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.totalUsers}</h3>
            <p className="text-gray-600 text-sm">Total Users</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.totalCreators}</h3>
            <p className="text-gray-600 text-sm">Active Creators</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              {stats.pendingKYC > 0 && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">
                  Action Needed
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{stats.pendingKYC}</h3>
            <p className="text-gray-600 text-sm">Pending KYC</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">${stats.totalRevenue.toFixed(2)}</h3>
            <p className="text-gray-600 text-sm">Total Revenue</p>
          </motion.div>
        </div>

        {/* Admin Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminSections.map((section, index) => (
            <motion.div
              key={section.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
              onClick={() => navigate(section.route)}
              className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition cursor-pointer group relative"
            >
              {section.needsAttention && (
                <div className="absolute top-4 right-4">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                </div>
              )}
              
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 bg-gradient-to-br ${section.gradient} rounded-xl flex items-center justify-center group-hover:scale-110 transition`}>
                  <section.icon className="w-7 h-7 text-white" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition" />
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-2">{section.title}</h3>
              <p className="text-gray-600 mb-4">{section.description}</p>
              
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">{section.stat}</span>
                  <span className="text-sm text-gray-600">{section.statLabel}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* KYC Status Overview */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">KYC Application Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Clock className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingKYC}</p>
                <p className="text-sm text-gray-600">Pending Review</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.approvedKYC}</p>
                <p className="text-sm text-gray-600">Approved</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.rejectedKYC}</p>
                <p className="text-sm text-gray-600">Rejected</p>
              </div>
            </div>
          </div>
          
          {stats.pendingKYC > 0 && (
            <button
              onClick={() => navigate('/admin/kyc')}
              className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2"
            >
              <FileCheck className="w-5 h-5" />
              <span>Review Pending Applications</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}