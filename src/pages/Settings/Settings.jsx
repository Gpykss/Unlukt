// src/pages/Settings/Settings.jsx - WITH BACK BUTTON AND LOCATION

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Lock, 
  CreditCard, 
  LogOut,
  ChevronRight,
  Mail,
  Phone,
  Globe,
  Eye,
  EyeOff,
  Ban,
  Download,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { 
  sendEmailVerification,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser
} from 'firebase/auth';
import { 
  doc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { updateUserProfile } from '../../services/firestoreService';
import AvailabilityToggle from '../../components/Dashboard/AvailabilityToggle';

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
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  useEffect(() => {
    loadBlockedUsers();
    loadActiveSessions();
  }, [currentUser]);

  useEffect(() => {
    if (profile?.location) {
      setLocation(profile.location);
    }
  }, [profile]);

  const loadBlockedUsers = async () => {
    if (!currentUser) return;
    
    try {
      const blocksRef = collection(db, 'blocks');
      const q = query(blocksRef, where('blockerId', '==', currentUser.uid));
      const snapshot = await getDocs(q);
      
      const blocked = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const blockData = docSnap.data();
          const userDoc = await getDoc(doc(db, 'users', blockData.blockedId));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            return {
              id: docSnap.id,
              userId: blockData.blockedId,
              name: userData.displayName || 'User',
              username: userData.username || '',
              avatar: userData.avatar || '👤'
            };
          }
          return null;
        })
      );
      
      setBlockedUsers(blocked.filter(Boolean));
    } catch (error) {
      console.error('Error loading blocked users:', error);
    }
  };

  const loadActiveSessions = async () => {
    setActiveSessions([
      {
        id: 1,
        device: 'Chrome on Windows',
        location: 'Port Harcourt, NG',
        lastActive: 'Active now',
        current: true
      }
    ]);
  };

  const handleUnblockUser = async (blockId) => {
    try {
      await deleteDoc(doc(db, 'blocks', blockId));
      setBlockedUsers(blockedUsers.filter(u => u.id !== blockId));
      showToast('User unblocked successfully!', 'success');
    } catch (error) {
      console.error('Error unblocking user:', error);
      showToast('Failed to unblock user', 'error');
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!currentUser) return;
    
    if (currentUser.emailVerified) {
      showToast('Your email is already verified!', 'success');
      return;
    }
    
    setLoading(true);
    try {
      await sendEmailVerification(currentUser);
      showToast('Verification email sent! Check your inbox.', 'success');
    } catch (error) {
      console.error('Error sending verification:', error);
      if (error.code === 'auth/too-many-requests') {
        showToast('Too many requests. Please try again later.', 'error');
      } else {
        showToast('Failed to send verification email', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Update location
  const handleUpdateLocation = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      await updateUserProfile(currentUser.uid, { location });
      showToast('Location updated successfully!', 'success');
      setShowEditLocation(false);
    } catch (error) {
      console.error('Error updating location:', error);
      showToast('Failed to update location', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    
    const confirmation = prompt(
      'This will permanently delete your account and all data. Type "DELETE" to confirm:'
    );
    
    if (confirmation !== 'DELETE') {
      alert('Account deletion cancelled.');
      return;
    }
    
    setLoading(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await deleteDoc(userRef);
      
      const convoQuery = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', currentUser.uid)
      );
      const convoSnap = await getDocs(convoQuery);
      await Promise.all(convoSnap.docs.map(doc => deleteDoc(doc.ref)));
      
      const blocksQuery = query(
        collection(db, 'blocks'),
        where('blockerId', '==', currentUser.uid)
      );
      const blocksSnap = await getDocs(blocksQuery);
      await Promise.all(blocksSnap.docs.map(doc => deleteDoc(doc.ref)));
      
      await currentUser.delete();
      
      alert('Account deleted successfully. You will be redirected to login.');
      navigate('/login');
    } catch (error) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('For security, please log out and log back in, then try deleting your account again.');
      } else {
        alert('Failed to delete account. Please try again or contact support.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Failed to logout', 'error');
    }
  };

  const handleDownloadData = async () => {
    setLoading(true);
    try {
      const userData = {
        profile: {
          email: currentUser?.email,
          displayName: profile?.displayName || displayName,
          username: username,
          avatar: profile?.avatar,
          bio: profile?.bio,
          phoneNumber: profile?.phoneNumber,
          location: profile?.location,
          emailVerified: currentUser?.emailVerified,
          createdAt: currentUser?.metadata?.creationTime,
          lastSignIn: currentUser?.metadata?.lastSignInTime
        },
        blockedUsers: blockedUsers.map(u => ({
          name: u.name,
          username: u.username
        })),
        exportDate: new Date().toISOString()
      };
      
      const dataStr = JSON.stringify(userData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-data-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast('Your data has been downloaded successfully!', 'success');
    } catch (error) {
      console.error('Error downloading data:', error);
      showToast('Failed to download data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const settingsSections = [
    {
      title: 'Account',
      items: [
        {
          id: 'profile',
          label: 'Edit Profile',
          description: 'Update your profile information',
          icon: User,
          action: () => navigate('/edit-profile')
        },
        {
          id: 'email',
          label: 'Email',
          description: currentUser?.email,
          icon: Mail,
          badge: currentUser?.emailVerified ? 'Verified' : 'Not Verified',
          badgeColor: currentUser?.emailVerified ? 'green' : 'yellow',
          action: currentUser?.emailVerified ? null : () => handleSendVerificationEmail()
        },
        {
          id: 'phone',
          label: 'Phone Number',
          description: profile?.phoneNumber || 'Not set',
          icon: Phone,
          action: () => navigate('/edit-profile')
        },
        {
          id: 'location',
          label: 'Location',
          description: location?.countryName || location || 'Not set',
          icon: MapPin,
          action: () => setShowEditLocation(true)
        }
      ]
    },
    {
      title: 'Privacy & Security',
      items: [
        {
          id: 'password',
          label: 'Change Password',
          description: 'Update your password',
          icon: Lock,
          action: () => setShowChangePassword(true)
        },
        {
          id: 'blocked',
          label: 'Blocked Users',
          description: `${blockedUsers.length} users blocked`,
          icon: Ban,
          action: () => setShowBlockedUsers(true)
        },
        {
          id: 'sessions',
          label: 'Active Sessions',
          description: 'Manage your active login sessions',
          icon: Globe,
          action: () => setShowActiveSessions(true)
        }
      ]
    },
    {
      title: 'Data & Privacy',
      items: [
        {
          id: 'download',
          label: 'Download Your Data',
          description: 'Get a copy of your information',
          icon: Download,
          action: handleDownloadData,
          loading: loading
        }
      ]
    },
    {
      title: 'Billing',
      items: [
        {
          id: 'payment',
          label: 'Payment Methods',
          description: 'Manage your payment options',
          icon: CreditCard,
          action: () => navigate('/wallet')
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* ✅ BACK BUTTON */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center space-x-4">
          <button
            onClick={() => navigate('/feed')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6"
        >
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
              {profile?.avatar ? (
                <img 
                  src={profile.avatar} 
                  alt={displayName} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
                {isVerified && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              {username && <p className="text-gray-500">@{username}</p>}
            </div>
            <button
              onClick={() => navigate('/edit-profile')}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition"
            >
              Edit Profile
            </button>
          </div>
        </motion.div>

        {/* Settings Sections */}
        {settingsSections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={item.action}
                    className={`px-6 py-4 flex items-center space-x-4 transition ${
                      item.action ? 'hover:bg-gray-50 cursor-pointer' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500 truncate">{item.description}</p>
                    </div>
                    {item.badge && (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.badgeColor === 'green' 
                          ? 'bg-green-100 text-green-700' 
                          : item.badgeColor === 'yellow'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                    {item.action ? (
                      <div className="flex items-center">
                        {item.loading ? (
                          <Loader2 className="w-5 h-5 text-rose-500 animate-spin flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Call Availability - Creators Only */}
        {isCreator && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-6"
          >
            <AvailabilityToggle />
          </motion.div>
        )}
        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-red-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>
          <div className="p-6 space-y-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
            >
              <div className="flex items-center space-x-3">
                <LogOut className="w-5 h-5 text-gray-600" />
                <span className="font-medium text-gray-900">Sign Out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition"
            >
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-900">Delete Account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* MODALS */}
      
      {/* ✅ Edit Location Modal */}
      <AnimatePresence>
        {showEditLocation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowEditLocation(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">Update Location</h3>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowEditLocation(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLocation}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePassword && (
          <ChangePasswordModal 
            onClose={() => setShowChangePassword(false)}
            currentUser={currentUser}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      {/* Blocked Users Modal */}
      <AnimatePresence>
        {showBlockedUsers && (
          <BlockedUsersModal
            onClose={() => setShowBlockedUsers(false)}
            blockedUsers={blockedUsers}
            onUnblock={handleUnblockUser}
          />
        )}
      </AnimatePresence>

      {/* Active Sessions Modal */}
      <AnimatePresence>
        {showActiveSessions && (
          <ActiveSessionsModal
            onClose={() => setShowActiveSessions(false)}
            sessions={activeSessions}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Delete Account?</h3>
              </div>
              <p className="text-gray-600 mb-6">
                This action cannot be undone. All your data, subscriptions, and content will be permanently deleted.
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowDeleteConfirm(false);
                    await handleDeleteAccount();
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Delete Account'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 right-4 z-50"
          >
            <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3 ${
              toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            } text-white`}>
              {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <p className="font-medium">{toast.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper Modal Components
function ChangePasswordModal({ onClose, currentUser, showToast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match!', 'error');
      return;
    }
    
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters!', 'error');
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      
      showToast('Password changed successfully!', 'success');
      onClose();
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        showToast('Current password is incorrect!', 'error');
      } else {
        showToast('Failed to change password', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-900 mb-6">Change Password</h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showCurrentPassword ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showNewPassword ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center"
            >
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
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-900 mb-6">Blocked Users</h3>
        
        {blockedUsers.length === 0 ? (
          <div className="text-center py-8">
            <Ban className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No blocked users</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg">
                    {user.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{user.name}</p>
                    {user.username && <p className="text-sm text-gray-500">@{user.username}</p>}
                  </div>
                </div>
                <button
                  onClick={() => onUnblock(user.id)}
                  className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm rounded-lg font-medium transition"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}

function ActiveSessionsModal({ onClose, sessions }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-900 mb-6">Active Sessions</h3>
        
        <div className="space-y-3">
          {sessions.map((session) => (
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
                {session.current && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                    Current
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          If you see any suspicious activity, sign out from all devices and change your password.
        </p>

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}