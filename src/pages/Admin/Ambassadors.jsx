// src/pages/Admin/Ambassadors.jsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Award, ArrowLeft, Loader2, Search, Users,
  Copy, Check, TrendingUp, DollarSign, Link2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs,
  doc, getDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function Ambassadors() {
  const navigate = useNavigate();
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadAmbassadors();
  }, []);

  const loadAmbassadors = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'ambassador')
      );
      const snap = await getDocs(q);
      const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Enrich with commission totals
      const enriched = await Promise.all(
        rawList.map(async (amb) => {
          const commissionsSnap = await getDocs(
            query(collection(db, 'referralCommissions'), where('ambassadorId', '==', amb.id))
          );
          const commissions = commissionsSnap.docs.map(d => d.data());
          const totalEarned = commissions.reduce((s, c) => s + (c.amount || 0), 0);
          const pending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
          const paid = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);

          // Count referred creators
          const referredSnap = await getDocs(
            query(collection(db, 'users'), where('referredBy', '==', amb.id))
          );

          return {
            ...amb,
            commissionTotal: totalEarned,
            commissionPending: pending,
            commissionPaid: paid,
            referredCount: referredSnap.size,
          };
        })
      );

      setAmbassadors(enriched);
    } catch (err) {
      console.error('Error loading ambassadors:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ambassadors.filter(a => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      a.displayName?.toLowerCase().includes(s) ||
      a.username?.toLowerCase().includes(s) ||
      a.email?.toLowerCase().includes(s) ||
      a.referralCode?.toLowerCase().includes(s)
    );
  });

  const copyLink = (amb) => {
    const link = `https://unlukt.com/register?ref=${amb.referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(amb.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const totalPlatformCommission = ambassadors.reduce((s, a) => s + a.commissionTotal, 0);
  const totalAmbassadors = ambassadors.length;
  const totalReferred = ambassadors.reduce((s, a) => s + a.referredCount, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Award className="w-8 h-8 text-amber-500" />
                Ambassadors
              </h1>
              <p className="text-gray-600 mt-1">All users with the Ambassador role</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalAmbassadors}</p>
            <p className="text-sm text-gray-500">Total Ambassadors</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalReferred}</p>
            <p className="text-sm text-gray-500">Total Referred Creators</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">${totalPlatformCommission.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Total Commission Paid Out</p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, username, email or referral code..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Award className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                {ambassadors.length === 0 ? 'No ambassadors yet. Assign the ambassador role to users from User Management.' : 'No results match your search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ambassador</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Referral Code</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Referred</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Earned</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Pending</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(amb => (
                    <motion.tr
                      key={amb.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0">
                            {amb.avatar || amb.profilePicture
                              ? <img src={amb.avatar || amb.profilePicture} alt="" className="w-full h-full object-cover" />
                              : amb.displayName?.charAt(0).toUpperCase() || 'A'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{amb.displayName || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">@{amb.username || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          {amb.referralCode || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-gray-900">{amb.referredCount}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900">
                        ${amb.commissionTotal.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-amber-600 font-semibold">${amb.commissionPending.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-600 font-semibold">${amb.commissionPaid.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                          {((amb.referralCommissionRate || 0) * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {amb.referralCode ? (
                          <button
                            onClick={() => copyLink(amb)}
                            title="Copy referral link"
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              copiedId === amb.id
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            {copiedId === amb.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === amb.id ? 'Copied' : 'Copy'}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">No code</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
