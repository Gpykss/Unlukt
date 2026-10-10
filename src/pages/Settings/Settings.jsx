// src/pages/Settings/Settings.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Lock, CreditCard, LogOut, ChevronRight, ChevronDown,
  Mail, Phone, Globe, Eye, EyeOff, Ban, Download,
  Check, X, AlertTriangle, Loader2, ArrowLeft, MapPin, Tag, DollarSign, Crown, Sparkles,
  MessageSquare, Shield
} from 'lucide-react';
import { ALL_COUNTRIES } from '../../services/geoService';
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
import CreatorTierModal from '../../components/Dashboard/CreatorTierModal';
import DataLiteToggle from './DataLiteToggle';

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { profile, displayName, username, isVerified, isCreator } = useUserProfile();
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [showActiveSessions, setShowActiveSessions] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [location, setLocation] = useState(profile?.location || '');
  
  // ✅ Per-duration subscription prices set by creator independently
  const [priceMonthly, setPriceMonthly] = useState('');
  const [priceWeekly, setPriceWeekly]   = useState('');
  const [priceDaily, setPriceDaily]     = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  // Automated Welcome Messages
  const [autoMessages, setAutoMessages] = useState({
    subscriberEnabled: true,
    subscriberMessage: 'Hey {name}! 🎉 Thank you so much for subscribing to my profile. So excited to have you here! Feel free to DM me anytime.',
    followerEnabled: true,
    followerMessage: 'Hey {name}! 👋 Thanks for following my profile. Stay tuned for exclusive posts and updates!',
  });
  const [savingAutoMessages, setSavingAutoMessages] = useState(false);

  // Geo-Blocking / Country Restrictions
  const [geoBlockingEnabled, setGeoBlockingEnabled] = useState(false);
  const [blockedCountries, setBlockedCountries] = useState([]);
  const [savingGeo, setSavingGeo] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

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
      if (profile.autoMessages) {
        setAutoMessages({
          subscriberEnabled: profile.autoMessages.subscriberEnabled !== false,
          subscriberMessage: profile.autoMessages.subscriberMessage || 'Hey {name}! 🎉 Thank you so much for subscribing to my profile. So excited to have you here! Feel free to DM me anytime.',
          followerEnabled: profile.autoMessages.followerEnabled !== false,
          followerMessage: profile.autoMessages.followerMessage || 'Hey {name}! 👋 Thanks for following my profile. Stay tuned for exclusive posts and updates!',
        });
      }
      setGeoBlockingEnabled(profile.geoBlockingEnabled === true);
      setBlockedCountries(Array.isArray(profile.blockedCountries) ? profile.blockedCountries : []);
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
      } catch { showToast('Failed to save prices', 'error'); }
    finally { setSavingPrice(false); }
  };

  const handleSaveAutoMessages = async () => {
    if (!currentUser || !isCreator) return;
    setSavingAutoMessages(true);
    try {
      await updateUserProfile(currentUser.uid, { autoMessages });
      showToast('Automated welcome messages saved!');
    } catch {
      showToast('Failed to save automated messages', 'error');
    } finally {
      setSavingAutoMessages(false);
    }
  };

  const handleToggleCountryBlock = (countryCode) => {
    const code = countryCode.toUpperCase();
    setBlockedCountries(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      return [...prev, code];
    });
  };

  const handleSaveGeoBlocking = async () => {
    if (!currentUser || !isCreator) return;
    setSavingGeo(true);
    try {
      await updateUserProfile(currentUser.uid, {
        geoBlockingEnabled,
        blockedCountries,
      });
      showToast('Geo-blocking preferences saved!');
    } catch {
      showToast('Failed to save geo-blocking preferences', 'error');
    } finally {
      setSavingGeo(false);
    }
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
    <div className="min-h-screen bg-gray-50 pb-28 lg:pb-8 overflow-x-hidden">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center space-x-4">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4 space-y-4 sm:space-y-6">
        {/* Profile Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
              {profile?.avatar
                ? <img src={profile.avatar} alt={displayName} className="w-full h-full object-cover" />
                : displayName?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{displayName}</h3>
                {isVerified && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"><span className="text-white text-xs">✓</span></div>}
              </div>
              {username && <p className="text-gray-500 text-sm truncate">@{username}</p>}
              {isCreator && <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-semibold">Creator</span>}
            </div>
            <button onClick={() => navigate('/edit-profile')} className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition">
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
            {/* 3-Tier Membership Management */}
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-rose-50/40 via-pink-50/20 to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                      <Crown className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900">3-Tier Memberships (Supporter, VIP, Superfan)</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 max-w-lg">
                    Customize prices, perks, and call discounts for multi-level fans. Fans select their tier upon subscribing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTierModal(true)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl text-sm sm:text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Configure Tiers</span>
                </button>
              </div>
            </div>

            {/* Subscription Pricing */}
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">💰 Base Subscription Pricing</h3>
              <p className="text-sm text-gray-500 mb-5">
                Set your default prices for each duration. Fans choose which plan to subscribe to.
              </p>

              <div className="space-y-4 w-full sm:max-w-md">
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
                    <p className="text-xs text-gray-400 pt-1 border-t border-gray-200 mt-1">
                      {(profile?.isAmbassador === true || profile?.role === 'ambassador')
                        ? 'Ambassador 🏆 · You keep 90% of each payment'
                        : 'You keep 80% of each payment'}
                    </p>
                  </div>
                )}

                {/* 3-Tier Membership Configuration (PRD 16.1 & 16.2) */}
                <div className="p-4 bg-gradient-to-r from-amber-50 to-rose-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Crown className="w-5 h-5 text-amber-500" />
                      <span className="font-bold text-gray-900 text-sm">3-Tier Membership & Badges</span>
                      <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900">
                        Supporter • VIP • Superfan
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Configure individual tier prices, custom perks, and subscriber badges shown on your public profile!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTierModal(true)}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Manage Tiers</span>
                  </button>
                </div>
                <button
                  onClick={handleSaveSubscriptionPrice}
                  disabled={savingPrice}
                  className="w-full mt-2 min-h-[44px] px-4 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  {savingPrice ? <Loader2 className="w-5 h-5 animate-spin" /> : '💾 Save Prices'}
                </button>
              </div>
            </div>


            {/* Availability Toggle */}
            <div className="p-2 sm:p-6 border-b border-gray-200">
              <AvailabilityToggle />
            </div>

            {/* Discount Manager */}
            <div className="p-3 sm:p-6 border-b border-gray-200">
              <CreatorDiscountManager
                baseMonthly={parseFloat(priceMonthly) || 0}
                baseWeekly={priceWeekly !== '' ? parseFloat(priceWeekly) : null}
                baseDaily={priceDaily   !== '' ? parseFloat(priceDaily)  : null}
              />
            </div>

            {/* ========== AUTOMATED WELCOME MESSAGES ========== */}
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="p-1.5 rounded-lg bg-sky-100 text-sky-600">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <h3 className="text-sm sm:text-base font-bold text-gray-900">💬 Automated Welcome Messages</h3>
              </div>
              <p className="text-xs text-gray-500 mb-5">
                Automatically send a personalized direct message to fans the moment they subscribe or follow you. Use <code className="bg-gray-100 px-1 py-0.5 rounded text-rose-600 font-bold">{'{name}'}</code> to personalize with the fan's name.
              </p>

              <div className="space-y-4 sm:space-y-6 w-full sm:max-w-xl">
                {/* 1. New Subscriber Auto-Message */}
                <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span>New Subscriber Greeting</span>
                      </h4>
                      <p className="text-xs text-gray-500">Sent immediately when a fan joins any paid membership tier.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={autoMessages.subscriberEnabled}
                        onChange={(e) => setAutoMessages(p => ({ ...p, subscriberEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  {autoMessages.subscriberEnabled && (
                    <textarea
                      rows={3}
                      value={autoMessages.subscriberMessage}
                      onChange={(e) => setAutoMessages(p => ({ ...p, subscriberMessage: e.target.value }))}
                      placeholder="e.g. Hey {name}! 🎉 Thank you so much for subscribing to my profile. Feel free to DM me anytime!"
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-white"
                    />
                  )}
                </div>

                {/* 2. New Follower Auto-Message */}
                <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-500" />
                        <span>New Follower Greeting</span>
                      </h4>
                      <p className="text-xs text-gray-500">Sent immediately when someone follows your public profile.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={autoMessages.followerEnabled}
                        onChange={(e) => setAutoMessages(p => ({ ...p, followerEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  {autoMessages.followerEnabled && (
                    <textarea
                      rows={3}
                      value={autoMessages.followerMessage}
                      onChange={(e) => setAutoMessages(p => ({ ...p, followerMessage: e.target.value }))}
                      placeholder="e.g. Hey {name}! 👋 Thanks for following my profile. Stay tuned for exclusive posts and updates!"
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-white"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveAutoMessages}
                  disabled={savingAutoMessages}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2"
                >
                  {savingAutoMessages ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 Save Automated Messages'}
                </button>
              </div>
            </div>

            {/* ========== GEO-BLOCKING / COUNTRY RESTRICTIONS ========== */}
            <div className="p-4 sm:p-6 bg-white">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                      <Globe className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900">🌍 Geo-Blocking / Regional Privacy</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 max-w-lg">
                    Restrict users in selected countries from viewing your profile, exclusive posts, or subscribing.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={geoBlockingEnabled}
                    onChange={(e) => setGeoBlockingEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                </label>
              </div>

              {geoBlockingEnabled && (
                <div className="mt-4 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4 w-full sm:max-w-xl">
                  {/* Selected countries chips */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Blocked Countries ({blockedCountries.length})
                    </label>
                    {blockedCountries.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No countries blocked yet. Select countries below to restrict access.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {blockedCountries.map((code) => {
                          const cObj = ALL_COUNTRIES.find(c => c.code === code) || { code, name: code, flag: '🌐' };
                          return (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-200 rounded-full text-xs font-bold text-rose-700 shadow-2xs"
                            >
                              <span>{cObj.flag}</span>
                              <span>{cObj.name}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleCountryBlock(code)}
                                className="ml-1 text-gray-400 hover:text-red-600 transition"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Search / Add country */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Search & Add Country to Block:
                    </label>
                    <input
                      type="text"
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      placeholder="Type country name (e.g. Nigeria, United States, Ghana)..."
                      className="w-full p-3 border border-gray-200 rounded-xl text-base sm:text-xs focus:outline-none focus:border-rose-500 bg-white"
                    />

                    {/* Filtered suggestions list */}
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-xl bg-white divide-y divide-gray-100 shadow-inner">
                      {ALL_COUNTRIES
                        .filter(c => !countrySearch.trim() || c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
                        .map((c) => {
                          const isBlocked = blockedCountries.includes(c.code);
                          return (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => handleToggleCountryBlock(c.code)}
                              className={`w-full px-3 py-3 sm:py-2 text-left text-sm sm:text-xs flex items-center justify-between gap-2 transition ${
                                isBlocked ? 'bg-rose-50/80 font-bold text-rose-700' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className="text-base">{c.flag}</span>
                                <span>{c.name} ({c.code})</span>
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isBlocked ? 'bg-rose-200 text-rose-900' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {isBlocked ? 'Blocked 🚫' : '+ Block'}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveGeoBlocking}
                    disabled={savingGeo}
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2"
                  >
                    {savingGeo ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 Save Geo-Blocking Preferences'}
                  </button>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* ========== DATA SAVER ========== */}
        <DataLiteToggle />

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
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-red-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            <button onClick={handleLogout}
              className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition">
              <div className="flex items-center space-x-3">
                <LogOut className="w-5 h-5 text-gray-600" />
                <span className="font-medium text-gray-900">Sign Out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition">
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
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => setShowEditLocation(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
        {showTierModal && (
          <CreatorTierModal
            isOpen={showTierModal}
            onClose={() => setShowTierModal(false)}
            creatorId={currentUser?.uid}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-24 lg:bottom-4 left-4 right-4 sm:left-auto z-50">
            <div className={`px-4 sm:px-6 py-3 sm:py-4 rounded-xl shadow-lg flex items-center space-x-3 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
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
        className="w-full px-4 sm:px-6 py-3 sm:py-4 min-h-[56px] flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
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
      className={`px-4 sm:px-6 py-3 sm:py-4 min-h-[56px] flex items-center space-x-3 sm:space-x-4 transition ${
        onClick ? 'hover:bg-gray-50 cursor-pointer' : ''
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm sm:text-base">{label}</p>
        <p className="text-sm text-gray-500 truncate">{description}</p>
      </div>
      {badge && (
        <span
          className={`flex-shrink-0 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {show ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>
          <div className="flex space-x-3 mt-6">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 min-h-[44px] px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center">
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 pb-8 sm:pb-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Blocked Users</h3>
        {blockedUsers.length === 0 ? (
          <div className="text-center py-8"><Ban className="w-12 h-12 text-gray-400 mx-auto mb-3" /><p className="text-gray-500">No blocked users</p></div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg">{user.avatar}</div>
                  <div><p className="font-medium text-gray-900">{user.name}</p>{user.username && <p className="text-sm text-gray-500">@{user.username}</p>}</div>
                </div>
                <button onClick={() => onUnblock(user.id)} className="flex-shrink-0 min-h-[40px] px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm rounded-lg font-medium transition">Unblock</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-6 min-h-[44px] px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Close</button>
      </motion.div>
    </div>
  );
}

function ActiveSessionsModal({ onClose, sessions }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
        <button onClick={onClose} className="w-full mt-6 min-h-[44px] px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">Close</button>
      </motion.div>
    </div>
  );
}