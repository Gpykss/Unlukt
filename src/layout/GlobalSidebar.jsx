// src/layout/GlobalSidebar.jsx

import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, Search, User, BarChart3, Wallet,
  Settings, LogOut, Plus, Crown, Shield,
  Users, X, Phone
} from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from '../components/common/NotificationBell';
import MessageBell from '../components/common/MessageBell';
import LanguageSelector from '../components/common/LanguageSelector';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function GlobalSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, displayName, username, avatar, isCreator } = useUserProfile();
  const { logout, currentUser } = useAuth();
  const [activeCallCount, setActiveCallCount] = useState(0);

  // ✅ Check for joinable calls for non-creators
  useEffect(() => {
    if (!currentUser || isCreator) return;
    const check = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'call_bookings'),
          where('userId', '==', currentUser.uid),
          where('status', 'in', ['confirmed', 'in_progress'])
        ));
        const now = new Date();
        let count = 0;
        snap.docs.forEach(d => {
          const data = d.data();
          const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
          const durationMs = (data.duration || 30) * 60 * 1000;
          const expiresAt = new Date(scheduled.getTime() + durationMs);
          const minsUntil = Math.floor((scheduled - now) / 60000);
          if (now < expiresAt && minsUntil <= 5) count++;
        });
        setActiveCallCount(count);
      } catch (e) { console.error(e); }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [currentUser, isCreator]);

  const creatorMenuItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/feed' },
    { id: 'communities', label: 'Communities', icon: Users, path: '/communities' },
    { id: 'profile', label: 'Profile', icon: User, path: `/creator/${username || 'your-profile'}` },
    { id: 'search', label: 'Search', icon: Search, path: '/search' },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
    { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/wallet', highlight: true },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  const fanMenuItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/feed' },
    { id: 'communities', label: 'Communities', icon: Users, path: '/communities' },
    { id: 'profile', label: 'Profile', icon: User, path: `/creator/${username || 'your-profile'}` },
    { id: 'search', label: 'Search', icon: Search, path: '/search' },
    { id: 'my-calls', label: 'My Calls', icon: Phone, path: '/my-calls', badge: activeCallCount > 0 ? activeCallCount : null },
    { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/wallet', highlight: true },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  const menuItems = isCreator ? creatorMenuItems : fanMenuItems;

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      if (onClose) onClose();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  const handleProfileClick = () => {
    if (username) {
      navigate(`/creator/${username.replace('@', '')}`);
    } else {
      navigate('/complete-profile');
    }
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      )}

      <aside className={`
        fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 z-50 
        transition-transform duration-300 ease-in-out flex flex-col
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="lg:hidden absolute top-4 right-4 z-10">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Profile */}
        <div onClick={handleProfileClick}
          className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-semibold overflow-hidden">
              {avatar
                ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                : <span className="text-xl">{displayName?.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1">
                <h3 className="font-bold text-gray-900 truncate">{displayName}</h3>
                {isCreator && <Crown className="w-4 h-4 text-rose-500 flex-shrink-0" />}
                {profile?.isAdmin && <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />}
              </div>
              {username
                ? <p className="text-sm text-gray-500 truncate">@{username}</p>
                : <p className="text-xs text-rose-500 font-medium">Complete profile</p>}
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto pb-4">
          <nav className="p-4">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button key={item.id}
                    onClick={() => handleNavigation(item.path)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition relative ${
                      active ? 'bg-rose-50 text-rose-600' : 'text-gray-700 hover:bg-gray-50'
                    }`}>
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                    {/* ✅ Green badge for joinable calls */}
                    {item.badge && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                        {item.badge}
                      </span>
                    )}
                    {item.highlight && !item.badge && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                        NEW
                      </span>
                    )}
                  </button>
                );
              })}

              <NotificationBell showLabel={true} />
              <MessageBell showLabel={true} />

              {profile?.isAdmin && (
                <button onClick={() => handleNavigation('/admin')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition ${
                    isActive('/admin') || location.pathname.startsWith('/admin')
                      ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <Shield className="w-5 h-5" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            {isCreator ? (
              <button onClick={() => handleNavigation('/new-post')}
                className="w-full mt-6 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition shadow-lg">
                <Plus className="w-5 h-5" />
                <span>New Post</span>
              </button>
            ) : (
              <button onClick={() => handleNavigation('/become-creator')}
                className="w-full mt-6 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition shadow-lg">
                <Crown className="w-5 h-5" />
                <span>Become Creator</span>
              </button>
            )}
          </nav>
        </div>

        {/* Language Selector */}
        <LanguageSelector variant="sidebar" />

        {/* Logout */}
        <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0 lg:mb-0 mb-20">
          <button onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg font-medium transition">
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}