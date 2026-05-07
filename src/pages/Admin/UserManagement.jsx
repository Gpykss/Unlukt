// src/pages/Admin/UserManagement.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, Crown, Shield, Ban, ArrowLeft,
  Loader2, Mail, Calendar, MapPin, CheckCircle, XCircle, Clock,
  X, Save, Link2, Copy, Check, Award, Percent
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, getDocs, getCountFromServer, orderBy,
  limit, where, doc, updateDoc, getDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';

// ── Helper: generate a referral code from display name ────────────────────────
function generateReferralCode(displayName) {
  const slug = (displayName || 'AMB')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
    .padEnd(3, 'X');
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `AMB-${slug}-${rand}`;
}

// ── Slide-over User Detail Panel ──────────────────────────────────────────────
function UserDetailPanel({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role || 'creator');
  const [contentSplit, setContentSplit] = useState(user.contentSplit ?? 80);
  const [commissionRate, setCommissionRate] = useState(
    user.referralCommissionRate != null ? user.referralCommissionRate * 100 : 5
  );
  const [referralCode, setReferralCode] = useState(user.referralCode || '');
  const [referredBy, setReferredBy] = useState(user.referredBy || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ambassadors, setAmbassadors] = useState([]);
  const [ambSearch, setAmbSearch] = useState('');
  const [showAmbDropdown, setShowAmbDropdown] = useState(false);

  // Load ambassador list for the referredBy picker
  useEffect(() => {
    const loadAmbassadors = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('role', '==', 'ambassador'), limit(50))
        );
        setAmbassadors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Could not load ambassadors for picker:', e);
      }
    };
    loadAmbassadors();
  }, []);

  const selectedAmbassador = ambassadors.find(a => a.id === referredBy) || null;
  const filteredAmbassadors = ambassadors.filter(a => {
    if (!ambSearch) return true;
    const s = ambSearch.toLowerCase();
    return (
      a.displayName?.toLowerCase().includes(s) ||
      a.username?.toLowerCase().includes(s) ||
      a.referralCode?.toLowerCase().includes(s)
    );
  });

  // Auto-set content split and generate code when role switches to ambassador
  useEffect(() => {
    if (role === 'ambassador') {
      setContentSplit(90);
      if (!referralCode) {
        setReferralCode(generateReferralCode(user.displayName));
      }
    } else {
      setContentSplit(prev => prev === 90 ? 80 : prev);
    }
  }, [role]);

  const referralLink = referralCode
    ? `https://unlukt.com/register?ref=${referralCode}`
    : null;

  const copyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        role,
        contentSplit: Number(contentSplit),
        referralCommissionRate: Number(commissionRate) / 100,
        updatedAt: new Date(),
      };
      if (role === 'ambassador' && referralCode) {
        updates.referralCode = referralCode.trim().toUpperCase();
        // Init balance fields if not set
        if (!user.ambassadorBalance) updates.ambassadorBalance = 0;
        if (!user.totalCommissionEarned) updates.totalCommissionEarned = 0;
        if (!user.referralLinkClicks) updates.referralLinkClicks = 0;
      }
      // ✅ Write referredBy if set by admin
      if (referredBy && referredBy !== user.referredBy) {
        updates.referredBy = referredBy;
      } else if (!referredBy && user.referredBy) {
        // Admin cleared it
        const { deleteField } = await import('firebase/firestore');
        updates.referredBy = deleteField();
      }
      await updateDoc(doc(db, 'users', user.id), updates);
      onSaved({ ...user, ...updates });
      alert('Saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return 'N/A'; }
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">User Detail</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-6">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-xl overflow-hidden flex-shrink-0">
              {user.avatar || user.profilePicture
                ? <img src={user.avatar || user.profilePicture} alt="" className="w-full h-full object-cover" />
                : user.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{user.displayName || 'Unknown'}</p>
              <p className="text-sm text-gray-500">@{user.username || '—'}</p>
              <p className="text-sm text-gray-400">{user.email || '—'}</p>
            </div>
          </div>

          {/* Info pills */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 bg-gray-100 rounded-full text-gray-600">
              Joined {formatDate(user.createdAt)}
            </span>
            {user.kycStatus === 'approved' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> KYC Approved
              </span>
            )}
            {user.isCreator && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold flex items-center gap-1">
                <Crown className="w-3 h-3" /> Creator
              </span>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* ── Ambassador Controls ── */}
          <div className="space-y-4">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Ambassador Settings</h3>

            {/* Role */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
              >
                <option value="creator">Creator</option>
                <option value="ambassador">Ambassador</option>
              </select>
            </div>

            {/* Content Split */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content Split (%)
                <span className="ml-1 font-normal text-gray-400 text-xs">— creator's share of each payout</span>
              </label>
              <input
                type="number"
                value={contentSplit}
                onChange={e => setContentSplit(e.target.value)}
                min={50}
                max={95}
                step={1}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
              <p className="text-xs text-gray-400 mt-1">Default: 80 for creators · 90 for ambassadors</p>
            </div>

            {/* Commission Rate */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Percent className="w-4 h-4" />
                Referral Commission Rate (%)
              </label>
              <input
                type="number"
                value={commissionRate}
                onChange={e => setCommissionRate(e.target.value)}
                min={0}
                max={25}
                step={1}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Stored as {(Number(commissionRate) / 100).toFixed(2)} · e.g. 5% → 0.05
              </p>
            </div>

            {/* Referral Code — only shown when ambassador */}
            {role === 'ambassador' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Referral Code
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={e => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="AMB-NAME-XXXX"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setReferralCode(generateReferralCode(user.displayName))}
                  className="mt-1 text-xs text-rose-500 hover:text-rose-600 font-medium"
                >
                  ↻ Regenerate
                </button>
              </div>
            )}

            {/* Referral Link display */}
            {role === 'ambassador' && referralCode && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <Link2 className="w-4 h-4" />
                  Referral Link
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-600 truncate">
                    {`https://unlukt.com/register?ref=${referralCode}`}
                  </div>
                  <button
                    onClick={copyLink}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      copied ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Referral Attribution (manual) ── */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Users className="w-4 h-4" />
                Referred By Ambassador
                <span className="ml-1 font-normal text-gray-400 text-xs">— manual attribution</span>
              </label>

              {/* Show current attribution */}
              {selectedAmbassador && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden flex-shrink-0">
                    {selectedAmbassador.avatar || selectedAmbassador.profilePicture
                      ? <img src={selectedAmbassador.avatar || selectedAmbassador.profilePicture} alt="" className="w-full h-full object-cover" />
                      : selectedAmbassador.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-900 truncate">{selectedAmbassador.displayName}</p>
                    <p className="text-[11px] text-amber-700 font-mono">{selectedAmbassador.referralCode || selectedAmbassador.id.slice(0, 8)}</p>
                  </div>
                  <button
                    onClick={() => { setReferredBy(''); setAmbSearch(''); }}
                    className="text-amber-600 hover:text-red-600 transition"
                    title="Clear attribution"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Search box */}
              <div className="relative">
                <input
                  type="text"
                  value={ambSearch}
                  onChange={e => { setAmbSearch(e.target.value); setShowAmbDropdown(true); }}
                  onFocus={() => setShowAmbDropdown(true)}
                  placeholder={selectedAmbassador ? 'Change ambassador...' : 'Search ambassador by name or code...'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {showAmbDropdown && (ambSearch || !selectedAmbassador) && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                    {filteredAmbassadors.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3">No ambassadors found</p>
                    ) : filteredAmbassadors.map(amb => (
                      <button
                        key={amb.id}
                        type="button"
                        onMouseDown={() => {
                          setReferredBy(amb.id);
                          setAmbSearch('');
                          setShowAmbDropdown(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 transition text-left"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden flex-shrink-0">
                          {amb.avatar || amb.profilePicture
                            ? <img src={amb.avatar || amb.profilePicture} alt="" className="w-full h-full object-cover" />
                            : amb.displayName?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{amb.displayName}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{amb.referralCode || amb.id.slice(0, 8)}</p>
                        </div>
                        {referredBy === amb.id && <Check className="w-3 h-3 text-green-500 ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!referredBy && (
                <p className="text-xs text-gray-400 mt-1">No attribution set. Search above to manually assign.</p>
              )}
            </div>

            {/* Ambassador balance (read-only) */}
            {user.role === 'ambassador' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">Current Ambassador Balance</p>
                <p className="text-2xl font-bold text-amber-900">${(user.ambassadorBalance || 0).toFixed(2)}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Total earned all time: ${(user.totalCommissionEarned || 0).toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save button sticky at bottom */}
        <div className="p-5 border-t border-gray-100 bg-white sticky bottom-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, creators, users, verified, ambassadors
  const [selectedUser, setSelectedUser] = useState(null);

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
      } else if (filter === 'ambassadors') {
        // No orderBy here — avoids needing a composite index; sort in JS below
        q = query(usersRef, where('role', '==', 'ambassador'), limit(100));
      } else {
        q = query(usersRef, orderBy('createdAt', 'desc'), limit(100));
      }

      const snapshot = await getDocs(q);
      let userData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Enrich creators with real follower + subscriber counts
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
      // Log the full error so we can see if it's a missing index
      if (error.code === 'failed-precondition') {
        console.error('Missing Firestore index. Check Firebase console for the index creation link.');
      }
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

  const handleUserSaved = (updated) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
    setSelectedUser(prev => prev ? { ...prev, ...updated } : null);
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
              <p className="text-gray-600 mt-2">Click any row to view & edit ambassador settings</p>
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
            <div className="flex items-center flex-wrap gap-2">
              {[
                { value: 'all', label: 'All Users', icon: Users },
                { value: 'creators', label: 'Creators', icon: Crown },
                { value: 'verified', label: 'Verified', icon: Shield },
                { value: 'ambassadors', label: 'Ambassadors', icon: Award },
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
                      onClick={() => setSelectedUser(user)}
                      className="hover:bg-rose-50 transition cursor-pointer"
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
                        <div className="flex flex-col gap-1">
                          {user.role === 'ambassador' ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full flex items-center gap-1 w-fit">
                              <Award className="w-3 h-3" />Ambassador
                            </span>
                          ) : user.isCreator ? (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1 w-fit">
                              <Crown className="w-3 h-3" />Creator
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">Fan</span>
                          )}
                        </div>
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
                          {user.role === 'ambassador' && user.referralCode && (
                            <span className="font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[11px]">
                              {user.referralCode}
                            </span>
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

      {/* Slide-over panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}