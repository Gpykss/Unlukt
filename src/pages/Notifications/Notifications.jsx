// src/pages/Notifications/Notifications.jsx - WITHOUT message tab

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Heart,
  MessageCircle,
  UserPlus,
  DollarSign,
  Star,
  AlertCircle,
  CheckCheck,
  Trash2,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification as deleteNotificationService
} from '../../services/notificationService';

export default function Notifications() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const unsubscribe = subscribeToNotifications(currentUser.uid, (newNotifications) => {
      setNotifications(newNotifications);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const getIcon = (type) => {
    switch (type) {
      case 'like':
        return <Heart className="w-5 h-5 text-red-500 fill-red-500" />;
      case 'comment':
        return <MessageCircle className="w-5 h-5 text-blue-500" />;
      case 'follow':
        return <UserPlus className="w-5 h-5 text-green-500" />;
      case 'subscriber':
        return <UserPlus className="w-5 h-5 text-purple-500" />;
      case 'tip':
        return <DollarSign className="w-5 h-5 text-yellow-500" />;
      case 'system':
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
      default:
        return <Star className="w-5 h-5 text-rose-500" />;
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead(currentUser.uid);
    } catch (error) {
      console.error('Error marking all as read:', error);
      alert('Failed to mark all as read');
    }
  };

  const handleDeleteNotification = async (id) => {
    try {
      await deleteNotificationService(id);
    } catch (error) {
      console.error('Error deleting notification:', error);
      alert('Failed to delete notification');
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.read) {
      try {
        await markNotificationAsRead(notification.id);
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    }

    // Navigate based on type
    if (notification.type === 'follow' && notification.actorUsername) {
      navigate(`/creator/${notification.actorUsername}`);
    } else if ((notification.type === 'like' || notification.type === 'comment') && notification.postId) {
      // You can navigate to post detail page if you have one
      // navigate(`/post/${notification.postId}`);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch (error) {
      return 'Recently';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={() => navigate('/feed')}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-xs sm:text-sm text-gray-600">{unreadCount} unread</p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="flex items-center space-x-1 sm:space-x-2 text-rose-500 hover:text-rose-600 font-semibold text-xs sm:text-sm transition"
              >
                <CheckCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Mark all read</span>
                <span className="sm:hidden">Read</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Filter Tabs - REMOVED 'message' */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-1.5 sm:p-2 mb-4 sm:mb-6 flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
          {['all', 'unread', 'like', 'comment', 'follow', 'subscriber', 'tip'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition whitespace-nowrap ${
                filter === tab
                  ? 'bg-rose-50 text-rose-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium text-sm sm:text-base">No notifications</p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2">
                {filter === 'all' ? "You're all caught up!" : `No ${filter} notifications`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleNotificationClick(notification)}
                className={`p-3 sm:p-4 hover:bg-gray-50 transition cursor-pointer ${
                  !notification.read ? 'bg-rose-50/30' : ''
                }`}
              >
                <div className="flex items-start space-x-3 sm:space-x-4">
                  {/* Avatar/Icon */}
                  <div className="flex-shrink-0">
                    {notification.actorAvatar ? (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center overflow-hidden">
                        {notification.actorAvatar.startsWith('http') ? (
                          <img src={notification.actorAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl sm:text-2xl">{notification.actorAvatar}</span>
                        )}
                      </div>
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        {getIcon(notification.type)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base text-gray-900">
                          {notification.actorName && (
                            <span className="font-semibold">{notification.actorName} </span>
                          )}
                          <span className={notification.actorName ? 'text-gray-600' : 'text-gray-900'}>
                            {notification.message}
                          </span>
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>

                      {/* Post Thumbnail */}
                      {notification.postImage && (
                        <div className="ml-2 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {notification.postImage.startsWith('http') ? (
                            <img src={notification.postImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl sm:text-2xl">{notification.postImage}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                    {!notification.read && (
                      <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(notification.id);
                      }}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}