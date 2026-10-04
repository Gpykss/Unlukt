// src/hooks/useNotifications.js - REAL-TIME UNREAD NOTIFICATIONS LISTENER
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { subscribeToUnreadCount } from '../services/notificationService';

export const useNotifications = () => {
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeToUnreadCount(currentUser.uid, (count) => {
      setUnreadCount(Number(count) || 0);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentUser?.uid]);

  return { 
    unreadCount, 
    notifications: [] 
  };
};

export default useNotifications;
