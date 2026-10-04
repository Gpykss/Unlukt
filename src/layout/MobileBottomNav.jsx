// src/layout/MobileBottomNav.jsx

import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, Plus, MessageCircle, User, LayoutDashboard, Phone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUserProfile } from '../hooks/useUserProfile';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isNewNav } from '../utils/featureFlags';
import QuickCreateSheet from '../components/common/QuickCreateSheet';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isCreator, profile } = useUserProfile();
  const { unreadCount } = useUnreadMessages();
  const [activeCallCount, setActiveCallCount] = useState(0);
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Check for active calls for fans
  useEffect(() => {
    if (!currentUser || isCreator) return;
    const checkActiveCalls = async () => {
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
    checkActiveCalls();
    const interval = setInterval(checkActiveCalls, 60000);
    return () => clearInterval(interval);
  }, [currentUser, isCreator]);

  const handleProfileClick = () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (isCreator) {
      navigate('/dashboard');
    } else if (profile?.username) {
      navigate(`/creator/${profile.username.replace('@', '')}`);
    } else {
      navigate(`/creator/${currentUser.uid}`);
    }
  };

  const handleCreateClick = () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (isCreator) {
      setShowCreateSheet(true);
    } else {
      navigate('/discover');
    }
  };

  // PRD Section 15.2: 5-item thumb zone (Feed, Discover, Create, DMs, Studio/Profile)
  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 z-50 shadow-lg safe-area-bottom">
        <div className="max-w-md mx-auto px-2">
          <div className="flex items-center justify-between py-2 px-1">

            {/* 1. Feed */}
            <button
              onClick={() => navigate('/feed')}
              className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] transition ${
                isActive('/feed') ? 'text-red-500 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Home className={`w-5 h-5 ${isActive('/feed') ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] mt-1 tracking-tight">Feed</span>
            </button>

            {/* 2. Discover */}
            <button
              onClick={() => navigate('/discover')}
              className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] transition ${
                isActive('/discover') || isActive('/search') ? 'text-red-500 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Compass className={`w-5 h-5 ${isActive('/discover') || isActive('/search') ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] mt-1 tracking-tight">Discover</span>
            </button>

            {/* 3. Center Create (Opens quick sheet) */}
            <button
              onClick={handleCreateClick}
              className="flex flex-col items-center justify-center px-1 -mt-4 active:scale-95 transition"
            >
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/25 border-2 border-white text-white">
                <Plus className="w-6 h-6 stroke-[2.5]" />
              </div>
              <span className="text-[10px] font-medium text-gray-500 mt-0.5">
                {isCreator ? 'Create' : 'Explore'}
              </span>
            </button>

            {/* 4. DMs / Messages (Unified Inbox) */}
            <button
              onClick={() => currentUser ? navigate('/messages') : navigate('/login')}
              className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] relative transition ${
                isActive('/messages') ? 'text-red-500 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="relative">
                <MessageCircle className={`w-5 h-5 ${isActive('/messages') ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse border border-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">DMs</span>
            </button>

            {/* 5. Studio / Profile */}
            <button
              onClick={handleProfileClick}
              className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] transition ${
                isActive('/dashboard') || location.pathname.startsWith('/creator/') ? 'text-red-500 font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {profile?.profilePicture ? (
                <div className={`w-5 h-5 rounded-full overflow-hidden border ${isActive('/dashboard') ? 'border-red-500 ring-2 ring-red-500/30' : 'border-gray-300'}`}>
                  <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                </div>
              ) : isCreator ? (
                <LayoutDashboard className={`w-5 h-5 ${isActive('/dashboard') ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              ) : (
                <User className={`w-5 h-5 ${location.pathname.startsWith('/creator/') ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              )}
              <span className="text-[10px] mt-1 tracking-tight">
                {isCreator ? 'Studio' : 'Profile'}
              </span>
            </button>

          </div>
        </div>
      </nav>

      {/* Quick Action Sheet */}
      <QuickCreateSheet
        isOpen={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
      />
    </>
  );
}