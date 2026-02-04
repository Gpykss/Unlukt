// src/layout/MobileBottomNav.jsx - Mobile Bottom Navigation with Message Badge

import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, Plus, User } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import NotificationBell from '../components/common/NotificationBell';
import MessageBell from '../components/common/MessageBell';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, isCreator } = useUserProfile();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {/* Home */}
        <button
          onClick={() => navigate('/feed')}
          className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition ${
            isActive('/feed') ? 'text-rose-500' : 'text-gray-600'
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs font-medium">Home</span>
        </button>

        {/* Discover */}
        <button
          onClick={() => navigate('/discover')}
          className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition ${
            isActive('/discover') ? 'text-rose-500' : 'text-gray-600'
          }`}
        >
          <Compass className="w-6 h-6" />
          <span className="text-xs font-medium">Discover</span>
        </button>

        {/* New Post (Creators only) */}
        {isCreator && (
          <button
            onClick={() => navigate('/new-post')}
            className="relative -mt-4"
          >
            <div className="w-14 h-14 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
              <Plus className="w-7 h-7 text-white" />
            </div>
          </button>
        )}

        {/* Notifications with Badge */}
        <div className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition ${
          isActive('/notifications') ? 'text-rose-500' : 'text-gray-600'
        }`}>
          <NotificationBell showLabel={false} />
          <span className="text-xs font-medium">Alerts</span>
        </div>

        {/* Messages with Badge */}
        <div className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition ${
          isActive('/messages') ? 'text-rose-500' : 'text-gray-600'
        }`}>
          <MessageBell showLabel={false} />
          <span className="text-xs font-medium">Messages</span>
        </div>

        {/* Profile */}
        <button
          onClick={() => navigate(`/creator/${username || 'your-profile'}`)}
          className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition ${
            location.pathname.includes('/creator/') ? 'text-rose-500' : 'text-gray-600'
          }`}
        >
          <User className="w-6 h-6" />
          <span className="text-xs font-medium">Profile</span>
        </button>
      </div>
    </nav>
  );
}