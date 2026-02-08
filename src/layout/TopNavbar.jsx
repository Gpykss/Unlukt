// src/layout/TopNavbar.jsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, LockKeyhole, Bell, MessageCircle, User } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import NotificationBell from '../components/common/NotificationBell';
import MessageBell from '../components/common/MessageBell';

export default function TopNavbar({ onMenuToggle, isSidebarOpen }) {
  const navigate = useNavigate();
  const { displayName, avatar } = useUserProfile();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-40">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        
        {/* Left Side - Menu + Logo */}
        <div className="flex items-center space-x-4">
          {/* Hamburger Menu - Mobile & Desktop */}
          <button
            onClick={onMenuToggle}
            className="p-2 hover:bg-gray-100 rounded-lg transition lg:hidden"
          >
            {isSidebarOpen ? (
              <X className="w-6 h-6 text-gray-700" />
            ) : (
              <Menu className="w-6 h-6 text-gray-700" />
            )}
          </button>

          {/* Unlukt Logo */}
          <div 
            onClick={() => navigate('/feed')}
            className="flex items-center cursor-pointer"
          >
            <span 
              className="text-2xl font-black text-gray-900 flex items-center tracking-tight"
              style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
            >
              Unl
              <LockKeyhole className="w-6 h-6 text-red-600 mx-0.5" strokeWidth={1.25} fill="none" />
              kt
            </span>
          </div>
        </div>

        {/* Right Side - Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* Messages - Mobile Icon Only */}
          <div className="lg:hidden">
            <MessageBell showLabel={false} />
          </div>

          {/* Notifications - Mobile Icon Only */}
          <div className="lg:hidden">
            <NotificationBell showLabel={false} />
          </div>

          {/* User Profile */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center space-x-2 p-1.5 hover:bg-gray-100 rounded-lg transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-semibold overflow-hidden">
                {avatar ? (
                  <img 
                    src={avatar} 
                    alt={displayName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <span className="text-sm">{displayName?.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProfileMenu(false)}
                />
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <div className="p-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                    <p className="text-sm text-gray-500">View profile</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        navigate('/help');
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition"
                    >
                      Help Center
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
