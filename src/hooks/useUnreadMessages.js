// src/hooks/useUnreadMessages.js - REAL-TIME UNREAD MESSAGES LISTENER
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { subscribeToUnreadMessageCount } from '../services/messageService';

export const useUnreadMessages = () => {
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeToUnreadMessageCount(currentUser.uid, (count) => {
      setUnreadCount(Number(count) || 0);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentUser?.uid]);

  return { 
    unreadCount, 
    messages: [] 
  };
};

export default useUnreadMessages;
