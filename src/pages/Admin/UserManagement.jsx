// src/pages/Admin/UserManagement.jsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Search, Crown, Shield, Ban, ArrowLeft,
  Loader2, Mail, Calendar, MapPin, CheckCircle, XCircle, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, getCountFromServer, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, creators, users, verified

  useEffect(() => {
    loadUsers();
  }, [filter]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      
      let q;
      if (filter === 'creators') {
        q = query(usersRef, where('isCreator', '==', true), orderBy('createdAt', 'desc'), limit(100));
      } else if (filter === 'verified') {
        q = query(usersRef, where('kycStatus', '==', 'approved'), orderBy('createdAt', 'desc'), limit(100));
      } else {
        q = query(usersRef, orderBy('createdAt', 'desc'), limit(100));
      }

      const snapshot = await getDocs(q);
      let userData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // ✅ Enrich creators with real follower + subscriber counts
      const creators = userData.filter(u => u.isCreator);
      if (creators.length > 0) {
        const enriched = await Promise.all(
          creators.map(async (creator) => {
            const [fSnap, sSnap] = await Promise.all([
              getCountFromServer(query(collection(db, 'follows'), where('followingId', '==', creator.id))),
              getCountFromServer(query(collection(db, 'subscriptions'), where('creatorId', '==', creator.id), where('status', '==', 'active'))),
            ]);
            return {
              ...creator,
              followersCount:   fSnap.data().count,
              subscribersCount: sSnap.data().count,
            };
          })
        );
        const enrichedMap = Object.fromEntries(enriched.map(c => [c.id, c]));
        userData = userData.map(u => (u.isCreator && enrichedMap[u.id]) ? enrichedMap[u.id] : u);
      }

      setUsers(userData);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      user.displayName?.toLowerCase().includes(search) ||
      user.username?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search)
    );
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  const getStatusBadge = (user) => {
    if (user.kycStatus === 'approved') {
      return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" />Verified</span>;
    }
    if (user.kycStatus === 'pending') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>;
    }
    if (user.kycStatus === 'rejected') {
      return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" />Rejected</span>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/admin')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4 transition">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
                <Users className="w-8 h-8 text-rose-500" />
                <span>User Management</span>
              </h1>
              <p className="text-gray-600 mt-2">Manage all platform users and creators</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-2">
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, username, or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center space-x-2">
              {[
                { value: 'all', label: 'All Users', icon: Users },
                { value: 'creators', label: 'Creators', icon: Crown },
                { value: 'verified', label: 'Verified', icon: Shield }
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition flex items-center gap-2 ${
                    filter === value
                      ? 'bg-rose-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                            {user.avatar || user.profilePicture ? (
                              <img src={user.avatar || user.profilePicture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>{user.displayName?.charAt(0).toUpperCase() || 'U'}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{user.displayName || 'Unknown'}</p>
                            <p className="text-sm text-gray-500">@{user.username || 'user'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{user.email || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(user)}
                      </td>
                      <td className="px-6 py-4">
                        {user.isCreator ? (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1 w-fit">
                            <Crown className="w-3 h-3" />Creator
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">Fan</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{formatDate(user.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          {user.isCreator && (
                            <>
                              <span>{user.followersCount || 0} followers</span>
                              <span>{user.subscribersCount || 0} subs</span>
                            </>
                          )}
                        </div>
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