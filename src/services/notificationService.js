// src/services/notificationService.js - FIXED VERSION

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  limit
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Create a notification
 */
export const createNotification = async (notificationData) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    
    // ✅ REMOVE ALL UNDEFINED VALUES - Firestore doesn't accept undefined
    const cleanData = {};
    Object.keys(notificationData).forEach(key => {
      const value = notificationData[key];
      if (value !== undefined) {
        cleanData[key] = value;
      }
    });
    
    const notification = {
      ...cleanData,
      read: false,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(notificationsRef, notification);
    console.log('✅ Notification created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Create notification when someone follows you
 */
export const createFollowNotification = async (followerId, followingId, followerData) => {
  try {
    return await createNotification({
      type: 'follow',
      userId: followingId,
      actorId: followerId,
      actorName: followerData?.displayName || followerData?.name || 'Someone',
      actorAvatar: followerData?.avatar || followerData?.photoURL || null,
      actorUsername: followerData?.username || null,
      message: 'started following you'
    });
  } catch (error) {
    console.error('Error creating follow notification:', error);
  }
};

/**
 * Create notification when someone likes your post
 */
export const createLikeNotification = async (likerId, postOwnerId, likerData, postId, postImage) => {
  // Don't notify if liking own post
  if (likerId === postOwnerId) return;
  
  try {
    return await createNotification({
      type: 'like',
      userId: postOwnerId,
      actorId: likerId,
      actorName: likerData?.displayName || likerData?.name || 'Someone',
      actorAvatar: likerData?.avatar || likerData?.photoURL || null,
      actorUsername: likerData?.username || null,
      message: 'liked your post',
      postId: postId,
      postImage: postImage || null
    });
  } catch (error) {
    console.error('Error creating like notification:', error);
  }
};

/**
 * Create notification when someone comments on your post
 */
export const createCommentNotification = async (commenterId, postOwnerId, commenterData, postId, commentText, postImage) => {
  // Don't notify if commenting on own post
  if (commenterId === postOwnerId) return;
  
  try {
    const truncatedComment = commentText && commentText.length > 50 
      ? commentText.substring(0, 50) + '...' 
      : commentText || '';
    
    return await createNotification({
      type: 'comment',
      userId: postOwnerId,
      actorId: commenterId,
      actorName: commenterData?.displayName || commenterData?.name || 'Someone',
      actorAvatar: commenterData?.avatar || commenterData?.photoURL || null,
      actorUsername: commenterData?.username || null,
      message: `commented: "${truncatedComment}"`,
      postId: postId,
      postImage: postImage || null
    });
  } catch (error) {
    console.error('Error creating comment notification:', error);
  }
};

/**
 * Create notification when someone subscribes to you
 */
export const createSubscriptionNotification = async (subscriberId, creatorId, subscriberData) => {
  try {
    return await createNotification({
      type: 'subscriber',
      userId: creatorId,
      actorId: subscriberId,
      actorName: subscriberData?.displayName || subscriberData?.name || 'Someone',
      actorAvatar: subscriberData?.avatar || subscriberData?.photoURL || null,
      actorUsername: subscriberData?.username || null,
      message: 'subscribed to your profile'
    });
  } catch (error) {
    console.error('Error creating subscription notification:', error);
  }
};

/**
 * Create notification when someone sends you a tip
 */
export const createTipNotification = async (senderId, recipientId, senderData, amount) => {
  try {
    return await createNotification({
      type: 'tip',
      userId: recipientId,
      actorId: senderId,
      actorName: senderData?.displayName || senderData?.name || 'Someone',
      actorAvatar: senderData?.avatar || senderData?.photoURL || null,
      actorUsername: senderData?.username || null,
      message: `sent you a tip of $${amount.toFixed(2)}`,
      amount: amount
    });
  } catch (error) {
    console.error('Error creating tip notification:', error);
  }
};

/**
 * Create notification when someone sends you a message
 */
export const createMessageNotification = async (senderId, recipientId, senderData, messagePreview) => {
  try {
    return await createNotification({
      type: 'message',
      userId: recipientId,
      actorId: senderId,
      actorName: senderData?.displayName || senderData?.name || 'Someone',
      actorAvatar: senderData?.avatar || senderData?.photoURL || null,
      actorUsername: senderData?.username || null,
      message: messagePreview || 'sent you a message'
    });
  } catch (error) {
    console.error('Error creating message notification:', error);
  }
};

/**
 * Create system notification
 */
export const createSystemNotification = async (userId, message, type = 'system') => {
  try {
    return await createNotification({
      type: type,
      userId: userId,
      message: message
    });
  } catch (error) {
    console.error('Error creating system notification:', error);
  }
};

/**
 * Get notifications for a user
 */
export const getUserNotifications = async (userId, limitCount = 50) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return notifications;
  } catch (error) {
    console.error('Error getting notifications:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time notifications
 */
export const subscribeToNotifications = (userId, callback) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(notifications);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    return () => {};
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true,
      readAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        read: true,
        readAt: serverTimestamp()
      });
    });
    
    await batch.commit();
    console.log('✅ All notifications marked as read');
  } catch (error) {
    console.error('Error marking all as read:', error);
    throw error;
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (notificationId) => {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
    console.log('✅ Notification deleted');
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

/**
 * Get unread notification count
 */
export const getUnreadNotificationCount = async (userId) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

/**
 * Subscribe to unread notification count
 */
export const subscribeToUnreadCount = (userId, callback) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      callback(snapshot.size);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to unread count:', error);
    return () => {};
  }
};