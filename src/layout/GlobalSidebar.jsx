import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home,
  Search,
  Compass,
  User,
  BarChart3,
  Wallet,
  Settings,
  LogOut,
  Plus,
  Crown,
  Shield
} from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from '../components/common/NotificationBell';
import MessageBell from '../components/common/MessageBell';

export default function GlobalSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, displayName, username, avatar, isCreator } = useUserProfile();
  const { logout } = useAuth();

  const menuItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/feed' },
    { id: 'search', label: 'Search', icon: Search, path: '/search' },
    { id: 'discover', label: 'Discover', icon: Compass, path: '/discover' },
    { id: 'profile', label: 'Profile', icon: User, path: `/creator/${username || 'your-profile'}` },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
    { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/wallet', highlight: true },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' }
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <aside className="hidden lg:flex lg:flex-col fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 z-30">
      {/* Profile Section */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-semibold overflow-hidden">
            {avatar ? (
              <img 
                src={avatar} 
                alt={displayName} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <span className="text-xl">{displayName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1">
              <h3 className="font-bold text-gray-900 truncate">{displayName}</h3>
              {isCreator && (
                <Crown className="w-4 h-4 text-rose-500 flex-shrink-0" title="Creator" />
              )}
              {profile?.isAdmin && (
                <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" title="Admin" />
              )}
            </div>
            {username ? (
              <p className="text-sm text-gray-500 truncate">@{username}</p>
            ) : (
              <button
                onClick={() => navigate('/complete-profile')}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium"
              >
                Complete profile
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition ${
                  active
                    ? 'bg-rose-50 text-rose-600'
                    : 'text-gray-700 hover:bg-gray-50'
                } ${item.highlight ? 'relative' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.highlight && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                    NEW
                  </span>
                )}
              </button>
            );
          })}

          {/* Notifications with Badge */}
          <NotificationBell showLabel={true} />

          {/* Messages with Badge */}
          <MessageBell showLabel={true} />

          {/* Admin Link - Only for Admins */}
          {profile?.isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition ${
                isActive('/admin') || location.pathname.startsWith('/admin')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Admin</span>
            </button>
          )}
        </div>

        {/* New Post Button - Only for Creators */}
        {isCreator ? (
          <button
            onClick={() => navigate('/new-post')}
            className="w-full mt-6 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition shadow-lg"
          >
            <Plus className="w-5 h-5" />
            <span>New Post</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/become-creator')}
            className="w-full mt-6 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition shadow-lg"
          >
            <Crown className="w-5 h-5" />
            <span>Become Creator</span>
          </button>
        )}
      </nav>

      {/* Sign Out */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}