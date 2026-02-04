// src/components/common/MessageBell.jsx

import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUnreadMessageCount } from '../../services/messageService';

export default function MessageBell({ showLabel = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const isActive = location.pathname === '/messages';

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }

    // Subscribe to real-time unread count
    const unsubscribe = subscribeToUnreadMessageCount(currentUser.uid, (count) => {
      setUnreadCount(count);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <button
      onClick={() => navigate('/messages')}
      className={`relative flex items-center space-x-3 ${
        showLabel ? 'w-full px-4 py-3 rounded-lg font-medium transition' : ''
      } ${
        isActive
          ? showLabel ? 'bg-rose-50 text-rose-600' : 'text-rose-500'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <div className="relative">
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
      {showLabel && <span>Messages</span>}
    </button>
  );
}