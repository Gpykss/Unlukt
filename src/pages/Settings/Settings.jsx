// src/pages/Settings/Settings.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Lock, CreditCard, LogOut, ChevronRight, ChevronDown,
  Mail, Phone, Globe, Eye, EyeOff, Ban, Download,
  Check, X, AlertTriangle, Loader2, ArrowLeft, MapPin, Tag, DollarSign
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { 
  sendEmailVerification, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser
} from 'firebase/auth';
import { 
  doc, updateDoc, collection, query, where,
  getDocs, deleteDoc, getDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { updateUserProfile } from '../../services/firestoreService';
import AvailabilityToggle from '../../components/Dashboard/AvailabilityToggle';
import CreatorDiscountManager from "./CreatorDiscountManager";

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { profile, displayName, username, isVerified, isCreator } = useUserProfile();
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [showActiveSessions, setShowActiveSessions] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [location, setLocation] = useState(profile?.location || '');
  
  // ✅ Per-duration subscription prices set by creator independently
  const [priceMonthly, setPriceMonthly] = useState('');
  const [priceWeekly, setPriceWeekly]   = useState('');
  const [priceDaily, setPriceDaily]     = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  // ✅ Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    account: true,
    creator: isCreator,
    privacy: false,
    data: false,
    billing: false,
  });
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    loadBlockedUsers();
    loadActiveSessions();
  }, [currentUser]);

  useEffect(() => {
    if (profile?.location) setLocation(profile.location);
    // Load per-duration prices; fall back to legacy subscriptionPrice for monthly
    if (profile) {
      setPriceMonthly(String(profile.subscriptionPriceMonthly ?? profile.subscriptionPrice ?? '9.99'));
      setPriceWeekly(String(profile.subscriptionPriceWeekly ?? ''));
      setPriceDaily(String(profile.subscriptionPriceDaily ?? ''));
    }
  }, [profile]);

  const loadBlockedUsers = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'blocks'), where('blockerId', '==', currentUser.uid));
      const snapshot = await getDocs(q);
      const blocked = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const blockData = docSnap.data();
          const userDoc = await getDoc(doc(db, 'users', blockData.blockedId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            return { id: docSnap.id, userId: blockData.blockedId, name: userData.displayName || 'User', username: userData.username || '', avatar: userData.avatar || '👤' };
          }
          return null;
        })
      );
      setBlockedUsers(blocked.filter(Boolean));
    } catch (error) { console.error('Error loading blocked users:', error); }
  };

  const loadActiveSessions = async () => {
    setActiveSessions([{ id: 1, device: 'Chrome on Windows', location: 'Port Harcourt, NG', lastActive: 'Active now', current: true }]);
  };

  const handleUnblockUser = async (blockId) => {
    try {
      await deleteDoc(doc(db, 'blocks', blockId));
      setBlockedUsers(blockedUsers.filter(u => u.id !== blockId));
      showToast('User unblocked successfully!');
    } catch { showToast('Failed to unblock user', 'error'); }
  };

  const handleSendVerificationEmail = async () => {
    if (!currentUser) return;
    if (currentUser.emailVerified) { showToast('Your email is already verified!'); return; }
    setLoading(true);
    try {
      await sendEmailVerification(currentUser);
      showToast('Verification email sent! Check your inbox.');
    } catch (error) {
      showToast(error.code === 'auth/too-many-requests' ? 'Too many requests. Try again later.' : 'Failed to send verification email', 'error');
    } finally { setLoading(false); }
  };

  const handleUpdateLocation = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      await updateUserProfile(currentUser.uid, { location });
      showToast('Location updated successfully!');
      setShowEditLocation(false);
    } catch { showToast('Failed to update location', 'error'); }
    finally { setLoading(false); }
  };

  // ✅ Save all 3 subscription prices set independently by creator
  const handleSaveSubscriptionPrice = async () => {
    if (!currentUser || !isCreator) return;
    const monthly = parseFloat(priceMonthly);
    const weekly  = parseFloat(priceWeekly);
    const daily   = parseFloat(priceDaily);
    if (isNaN(monthly) || monthly < 0.99 || monthly > 999.99) {
      showToast('Monthly price must be between $0.99 and $999.99', 'error'); return;
    }
    if (priceWeekly !== '' && (isNaN(weekly) || weekly < 0.49 || weekly > 999.99)) {
      showToast('Weekly price must be between $0.49 and $999.99', 'error'); return;
    }
    if (priceDaily !== '' && (isNaN(daily) || daily < 0.10 || daily > 999.99)) {
      showToast('Daily price must be between $0.10 and $999.99', 'error'); return;
    }
    setSavingPrice(true);
    try {
      await updateUserProfile(currentUser.uid, {
        subscriptionPrice: monthly,          // keep legacy field = monthly
        subscriptionPriceMonthly: monthly,
        subscriptionPriceWeekly:  priceWeekly !== '' ? weekly  : null,
        subscriptionPriceDaily:   priceDaily  !== '' ? daily   : null,
      });
      showToast('Subscription prices saved!');
    } catch { showToast('Failed to save prices', 'error'); }
    finally { setSavingPrice(false); }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const confirmation = prompt('This will permanently delete your account. Type "DELETE" to confirm:');
    if (confirmation !== 'DELETE') { alert('Account deletion cancelled.'); return; }
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid));
      const convoSnap = await getDocs(query(collection(db, 'conversations'), where('participants', 'array-contains', currentUser.uid)));
      await Promise.all(convoSnap.docs.map(d => deleteDoc(d.ref)));
      const blocksSnap = await getDocs(query(collection(db, 'blocks'), where('blockerId', '==', currentUser.uid)));
      await Promise.all(blocksSnap.docs.map(d => deleteDoc(d.ref)));
      await currentUser.delete();
      navigate('/login');
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        alert('Please log out and log back in, then try again.');
      } else {
        alert('Failed to delete account. Please contact support.');
      }
    } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch { showToast('Failed to logout', 'error'); }
  };

  const handleDownloadData = async () => {
    setLoading(true);
    try {
      const userData = {
        profile: { email: currentUser?.email, displayName: profile?.displayName || displayName, username, exportDate: new Date().toISOString() },
        blockedUsers: blockedUsers.map(u => ({ name: u.name, username: u.username })),
      };
      const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `my-data-${Date.now()}.json`;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
      showToast('Data downloaded successfully!');
    } catch { showToast('Failed to download data', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center space-x-4">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {/* Profile Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
              {profile?.avatar
                ? <img src={profile.avatar} alt={displayName} className="w-full h-full object-cover" />
                : displayName?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
                {isVerified && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"><span className="text-white text-xs">✓</span></div>}
              </div>
              {username && <p className="text-gray-500">@{username}</p>}
              {isCreator && <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-semibold">Creator</span>}
            </div>
            <button onClick={() => navigate('/edit-profile')} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition">
              Edit Profile
            </button>
          </div>
        </motion.div>

        {/* ========== ACCOUNT SECTION ========== */}
        <CollapsibleSection
          title="Account"
          icon={User}
          isExpanded={expandedSections.account}
          onToggle={() => toggleSection('account')}
        >
          <SettingItem
            icon={User}
            label="Edit Profile"
            description="Update your profile information"
            onClick={() => navigate('/edit-profile')}
          />
          <SettingItem
            icon={Mail}
            label="Email"
            description={currentUser?.email}
            badge={currentUser?.emailVerified ? 'Verified' : 'Not Verified'}
            badgeColor={currentUser?.emailVerified ? 'green' : 'yellow'}
            onClick={currentUser?.emailVerified ? null : handleSendVerificationEmail}
          />
          <SettingItem
            icon={Phone}
            label="Phone Number"
            description={profile?.phoneNumber || 'Not set'}
            onClick={() => navigate('/edit-profile')}
          />
          <SettingItem
            icon={MapPin}
            label="Location"
            description={location?.countryName || location || 'Not set'}
            onClick={() => setShowEditLocation(true)}
          />
        </CollapsibleSection>

        {/* ========== CREATOR SETTINGS (CREATORS ONLY) ========== */}
        {isCreator && (
          <CollapsibleSection
            title="Creator Settings"
            icon={DollarSign}
            isExpanded={expandedSections.creator}
            onToggle={() => toggleSection('creator')}
          >
            {/* Subscription Pricing */}
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">💰 Subscription Pricing</h3>
              <p className="text-sm text-gray-500 mb-5">
                Set your own prices for each duration. Fans choose which plan to subscribe to.
              </p>

              <div className="space-y-4 max-w-md">
                {/* Monthly */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                    📅 Monthly <span className="text-xs font-normal text-gray-400">(30 days)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">$</span>
                    <input
                      type="number"
                      min="0.99"
                      max="999.99"
                      step="0.01"
                      placeholder="e.g. 9.99"
                      value={priceMonthly}
                      onChange={(e) => setPriceMonthly(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-lg font-semibold"
                    />
                  </div>
                </div>

                {/* Weekly */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                    🗓️ Weekly <span className="text-xs font-normal text-gray-400">(7 days)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">$</span>
                    <input
                      type="number"
                      min="0.49"
                      max="999.99"
                      step="0.01"
                      placeholder="e.g. 3.99"
                      value={priceWeekly}
                      onChange={(e) => setPriceWeekly(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-lg font-semibold"
                    />
                  </div>
                </div>

                {/* Daily */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                    ⚡ Daily <span className="text-xs font-normal text-gray-400">(24 hours)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">$</span>
                    <input
                      type="number"
                      min="0.10"
                      max="999.99"
                      step="0.01"
                      placeholder="e.g. 1.99"
                      value={priceDaily}
                      onChange={(e) => setPriceDaily(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-lg font-semibold"
                    />
                  </div>
                </div>

                {/* What fans will see — no earnings confusion */}
                {priceMonthly && !isNaN(parseFloat(priceMonthly)) && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5">
                    <p className="text-xs font-bold text-gray-600 mb-2">💳 What fans will pay:</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">📅 Monthly</span>
                      <span className="font-bold text-gray-900">${parseFloat(priceMonthly || 0).toFixed(2)}</span>
                    </div>
                    {priceWeekly !== '' && !isNaN(parseFloat(priceWeekly)) && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">🗓️ Weekly</span>
                        <span className="font-bold text-gray-900">${parseFloat(priceWeekly).toFixed(2)}</span>
                      </div>
                    )}
                    {priceDaily !== '' && !isNaN(parseFloat(priceDaily)) && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">⚡ Daily</span>
                        <span className="font-bold text-gray-900">${parseFloat(priceDaily).toFixed(2)}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 pt-1 border-t border-gray-200 mt-1">Platform fee: 20% · You receive 80% of each payment</p>
                  </div>
                )}

                <button
                  onClick={handleSaveSubscriptionPrice}
                  disabled={savingPrice}
                  className="w-full mt-2 px-4 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  {savingPrice ? <Loader2 className="w-5 h-5 animate-spin" /> : '💾 Save Prices'}
                </button>
              </div>
            </div>


            {/* Availability Toggle */}
            <div className="p-6 border-b border-gray-200">
              <AvailabilityToggle />
            </div>

            {/* Discount Manager */}
            <div className="p-6">
              <CreatorDiscountManager
                baseMonthly={parseFloat(priceMonthly) || 0}
                baseWeekly={priceWeekly !== '' ? parseFloat(priceWeekly) : null}
                baseDaily={priceDaily   !== '' ? parseFloat(priceDaily)  : null}
              />
            </div>
          </CollapsibleSection>
        )}

        {/* ========== PRIVACY & SECURITY ========== */}
        <CollapsibleSection
          title="Privacy & Security"
          icon={Lock}
          isExpanded={expandedSections.privacy}
          onToggle={() => toggleSection('privacy')}
        >
          <SettingItem
            icon={Lock}
            label="Change Password"
            description="Update your password"
            onClick={() => setShowChangePassword(true)}
          />
          <SettingItem
            icon={Ban}
            label="Blocked Users"
            description={`${blockedUsers.length} users blocked`}
            onClick={() => setShowBlockedUsers(true)}
          />
          <SettingItem
            icon={Globe}
            label="Active Sessions"
            description="Manage your active login sessions"
            onClick={() => setShowActiveSessions(true)}
          />
        </CollapsibleSection>

        {/* ========== DATA & PRIVACY ========== */}
        <CollapsibleSection
          title="Data & Privacy"
          icon={Download}
          isExpanded={expandedSections.data}
          onToggle={() => toggleSection('data')}
        >
          <SettingItem
            icon={Download}
            label="Download Your Data"
            description="Get a copy of your information"
            onClick={handleDownloadData}
            loading={loading}
          />
        </CollapsibleSection>

        {/* ========== BILLING ========== */}
        <CollapsibleSection
          title="Billing"
          icon={CreditCard}
          isExpanded={expandedSections.billing}
          onToggle={() => toggleSection('billing')}
        >
          <SettingItem
            icon={CreditCard}
            label="Payment Methods"
            description="Manage your payment options"
            onClick={() => navigate('/wallet')}
          />
        </CollapsibleSection>

        {/* ========== DANGER ZONE ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>
          <div className="p-6 space-y-4">
            <button onClick={handleLogout}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition">
              <div className="flex items-center space-x-3">
                <LogOut className="w-5 h-5 text-gray-600" />
                <span className="font-medium text-gray-900">Sign Out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-900">Delete Account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showEditLocation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowEditLocation(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Update Location</h3>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4" />
              <div className="flex space-x-3">
                <button onClick={() => setShowEditLocation(false)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Cancel</button>
                <button onClick={handleUpdateLocation} disabled={loading} className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} currentUser={currentUser} showToast={showToast} />}
      </AnimatePresence>

      <AnimatePresence>
        {showBlockedUsers && <BlockedUsersModal onClose={() => setShowBlockedUsers(false)} blockedUsers={blockedUsers} onUnblock={handleUnblockUser} />}
      </AnimatePresence>

      <AnimatePresence>
        {showActiveSessions && <ActiveSessionsModal onClose={() => setShowActiveSessions(false)} sessions={activeSessions} />}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Delete Account?</h3>
              </div>
              <p className="text-gray-600 mb-6">This action cannot be undone. All your data will be permanently deleted.</p>
              <div className="flex items-center space-x-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Cancel</button>
                <button onClick={async () => { setShowDeleteConfirm(false); await handleDeleteAccount(); }} disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Delete Account'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-4 right-4 z-50">
            <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
              {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <p className="font-medium">{toast.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ========== HELPER COMPONENTS ==========

function CollapsibleSection({ title, icon: Icon, isExpanded, onToggle, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-200 overflow-hidden"
          >
            <div className="divide-y divide-gray-200">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SettingItem({ icon: Icon, label, description, badge, badgeColor, onClick, loading }) {
  return (
    <div
      onClick={onClick}
      className={`px-6 py-4 flex items-center space-x-4 transition ${
        onClick ? 'hover:bg-gray-50 cursor-pointer' : ''
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500 truncate">{description}</p>
      </div>
      {badge && (
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            badgeColor === 'green'
              ? 'bg-green-100 text-green-700'
              : badgeColor === 'yellow'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {badge}
        </span>
      )}
      {onClick && (
        loading ? (
          <Loader2 className="w-5 h-5 text-rose-500 animate-spin flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )
      )}
    </div>
  );
}

// ── Helper Modals (keep these as they are) ──

function ChangePasswordModal({ onClose, currentUser, showToast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { showToast('Passwords do not match!', 'error'); return; }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters!', 'error'); return; }
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      showToast('Password changed successfully!');
      onClose();
    } catch (error) {
      showToast(error.code === 'auth/wrong-password' ? 'Current password is incorrect!' : 'Failed to change password', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Change Password</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Current Password', value: currentPassword, onChange: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
            { label: 'New Password', value: newPassword, onChange: setNewPassword, show: showNew, toggle: () => setShowNew(v => !v) },
          ].map(({ label, value, onChange, show, toggle }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {show ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>
          <div className="flex space-x-3 mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Change Password'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function BlockedUsersModal({ onClose, blockedUsers, onUnblock }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Blocked Users</h3>
        {blockedUsers.length === 0 ? (
          <div className="text-center py-8"><Ban className="w-12 h-12 text-gray-400 mx-auto mb-3" /><p className="text-gray-500">No blocked users</p></div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg">{user.avatar}</div>
                  <div><p className="font-medium text-gray-900">{user.name}</p>{user.username && <p className="text-sm text-gray-500">@{user.username}</p>}</div>
                </div>
                <button onClick={() => onUnblock(user.id)} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm rounded-lg font-medium transition">Unblock</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-6 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Close</button>
      </motion.div>
    </div>
  );
}

function ActiveSessionsModal({ onClose, sessions }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Active Sessions</h3>
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <Globe className="w-5 h-5 text-gray-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">{session.device}</p>
                    <p className="text-sm text-gray-500">{session.location}</p>
                    <p className="text-xs text-gray-400 mt-1">{session.lastActive}</p>
                  </div>
                </div>
                {session.current && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Current</span>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-6 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Close</button>
      </motion.div>
    </div>
  );
}