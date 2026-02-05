// src/layout/MobileBottomNav.jsx - FIXED: ONE LINE + RESPONSIVE + CENTERED

import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageCircle, Plus, Wallet, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useUnreadMessages } from '../hooks/useUnreadMessages';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isCreator, profile } = useUserProfile();
  const { unreadCount } = useUnreadMessages();

  const isActive = (path) => location.pathname === path;

  const handleProfileClick = () => {
    if (profile?.username) {
      navigate(`/creator/${profile.username.replace('@', '')}`);
    } else if (currentUser) {
      navigate(`/creator/${currentUser.uid}`);
    }
  };

  const isOnOwnProfile = () => {
    const currentPath = location.pathname;
    const username = profile?.username?.replace('@', '');
    return currentPath === `/creator/${username}` || currentPath === `/creator/${currentUser?.uid}`;
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg">
      {/* ✅ CENTERED CONTAINER WITH MAX WIDTH */}
      <div className="max-w-lg mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-around py-2">
          
          {/* Home */}
          <button
            onClick={() => navigate('/feed')}
            className={`flex flex-col items-center justify-center py-2 px-3 min-w-[60px] ${
              isActive('/feed') ? 'text-red-500' : 'text-gray-600'
            }`}
          >
            <Home className={`w-6 h-6 ${isActive('/feed') ? 'fill-red-500' : ''}`} />
            <span className="text-xs font-medium mt-1">Home</span>
          </button>

          {/* Messages */}
          <button
            onClick={() => navigate('/messages')}
            className={`flex flex-col items-center justify-center py-2 px-3 min-w-[60px] relative ${
              isActive('/messages') ? 'text-red-500' : 'text-gray-600'
            }`}
          >
            <div className="relative">
              <MessageCircle className={`w-6 h-6 ${isActive('/messages') ? 'fill-red-500' : ''}`} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium mt-1">Messages</span>
          </button>

          {/* Create Post (ONLY for Creators) */}
          {isCreator && (
            <button
              onClick={() => navigate('/new-post')}
              className="flex flex-col items-center justify-center px-3 min-w-[60px]"
            >
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg -mt-4 mb-1">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-600">Create</span>
            </button>
          )}

          {/* Profile */}
          <button
            onClick={handleProfileClick}
            className={`flex flex-col items-center justify-center py-2 px-3 min-w-[60px] ${
              isOnOwnProfile() ? 'text-red-500' : 'text-gray-600'
            }`}
          >
            {profile?.profilePicture ? (
              <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-current">
                <img 
                  src={profile.profilePicture} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <User className={`w-6 h-6 ${isOnOwnProfile() ? 'fill-red-500' : ''}`} />
            )}
            <span className="text-xs font-medium mt-1">Profile</span>
          </button>

          {/* Wallet */}
          <button
            onClick={() => navigate('/wallet')}
            className={`flex flex-col items-center justify-center py-2 px-3 min-w-[60px] ${
              isActive('/wallet') ? 'text-red-500' : 'text-gray-600'
            }`}
          >
            <Wallet className={`w-6 h-6 ${isActive('/wallet') ? 'fill-red-500' : ''}`} />
            <span className="text-xs font-medium mt-1">Wallet</span>
          </button>

        </div>
      </div>
    </nav>
  );
}