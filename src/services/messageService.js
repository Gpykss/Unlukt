// src/services/messageService.js - Complete Messaging System

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Check if users can message each other
 * Rules:
 * 1. Not blocked
 * 2. Admin can message anyone
 * 3. Anyone can message admin
 * 4. Both are verified creators
 * 5. User has active subscription to creator
 */
export const canMessage = async (user1Id, user2Id) => {
  try {
    console.log('🔍 ===== CHECKING MESSAGE PERMISSION =====');
    console.log('User 1 ID:', user1Id);
    console.log('User 2 ID:', user2Id);
    
    // FIRST: Check if blocked
    const blocked = await isUserBlocked(user1Id, user2Id);
    console.log('Blocked status:', blocked);
    
    if (blocked) {
      console.log('❌ User is blocked');
      throw new Error('You cannot message this user');
    }
    
    const user1Doc = await getDoc(doc(db, 'users', user1Id));
    const user2Doc = await getDoc(doc(db, 'users', user2Id));
    
    console.log('User 1 exists:', user1Doc.exists());
    console.log('User 2 exists:', user2Doc.exists());
    
    if (!user1Doc.exists() || !user2Doc.exists()) {
      throw new Error('User not found');
    }
    
    const user1Data = user1Doc.data();
    const user2Data = user2Doc.data();
    
    console.log('📋 User 1 Full Data:', user1Data);
    console.log('📋 User 2 Full Data:', user2Data);
    
    console.log('User 1 Info:', {
      role: user1Data.role,
      kycStatus: user1Data.kycStatus,
      displayName: user1Data.displayName
    });
    console.log('User 2 Info:', {
      role: user2Data.role,
      kycStatus: user2Data.kycStatus,
      displayName: user2Data.displayName
    });
    
    // ✅ Rule 2 & 3: Admin can message anyone, anyone can message admin
    // CHECK FOR isAdmin field (not role)
    const user1IsAdmin = user1Data.isAdmin === true || user1Data.role === 'admin';
    const user2IsAdmin = user2Data.isAdmin === true || user2Data.role === 'admin';

    console.log('🔐 Admin Check:');
    console.log('  User 1 is admin:', user1IsAdmin, '(isAdmin:', user1Data.isAdmin, ', role:', user1Data.role, ')');
    console.log('  User 2 is admin:', user2IsAdmin, '(isAdmin:', user2Data.isAdmin, ', role:', user2Data.role, ')');

    if (user1IsAdmin || user2IsAdmin) {
      console.log('✅ ===== PERMISSION GRANTED: Admin messaging =====');
      return true;
    }

    // ✅ Rule 4: Both are verified creators
    // CHECK FOR isCreator field (not role)
    const user1IsVerifiedCreator = (user1Data.isCreator === true || user1Data.role === 'creator') && user1Data.kycStatus === 'approved';
    const user2IsVerifiedCreator = (user2Data.isCreator === true || user2Data.role === 'creator') && user2Data.kycStatus === 'approved';

    console.log('👨‍💼 Creator Check:');
    console.log('  User 1 is verified creator:', user1IsVerifiedCreator, '(isCreator:', user1Data.isCreator, ')');
    console.log('  User 2 is verified creator:', user2IsVerifiedCreator, '(isCreator:', user2Data.isCreator, ')');

    if (user1IsVerifiedCreator && user2IsVerifiedCreator) {
      console.log('✅ ===== PERMISSION GRANTED: Both verified creators =====');
      return true;
    }
    // Rule 5: Check subscription
    console.log('💳 Checking subscriptions...');
    const sub1 = await getDoc(doc(db, 'subscriptions', `${user1Id}_${user2Id}`));
    const sub2 = await getDoc(doc(db, 'subscriptions', `${user2Id}_${user1Id}`));
    
    console.log('  Subscription 1 (user1→user2) exists:', sub1.exists());
    console.log('  Subscription 2 (user2→user1) exists:', sub2.exists());
    
    if (sub1.exists()) {
      console.log('  Subscription 1 data:', sub1.data());
    }
    if (sub2.exists()) {
      console.log('  Subscription 2 data:', sub2.data());
    }
    
    // Check if subscription is active and not expired
    const checkSubscription = (subDoc) => {
      if (!subDoc.exists()) return false;
      const data = subDoc.data();
      console.log('  Checking subscription status:', data.status);
      if (data.status !== 'active') return false;
      
      if (data.expiresAt) {
        const now = new Date();
        const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        console.log('  Expiry check - Now:', now, 'Expires:', expiresAt, 'Valid:', expiresAt > now);
        if (expiresAt < now) return false;
      }
      
      return true;
    };
    
    if (checkSubscription(sub1) || checkSubscription(sub2)) {
      console.log('✅ ===== PERMISSION GRANTED: Active subscription =====');
      return true;
    }
    
    console.log('❌ ===== PERMISSION DENIED: No valid permission found =====');
    throw new Error('You need an active subscription to message this creator');
  } catch (error) {
    console.error('❌ Error in canMessage:', error);
    throw error;
  }
};

/**
 * Get or create a conversation between two users
 */
export const getOrCreateConversation = async (user1Id, user2Id) => {
  try {
    console.log('🔍 Looking for conversation between:', user1Id, user2Id);
    
    // ✅ CHECK PERMISSIONS FIRST
    await canMessage(user1Id, user2Id);
    
    // Create a consistent conversation ID (alphabetically sorted)
    const conversationId = [user1Id, user2Id].sort().join('_');
    
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    // Get both users' data
    const user1Doc = await getDoc(doc(db, 'users', user1Id));
    const user2Doc = await getDoc(doc(db, 'users', user2Id));
    
    const user1Data = user1Doc.exists() ? user1Doc.data() : {};
    const user2Data = user2Doc.exists() ? user2Doc.data() : {};
    
    if (conversationSnap.exists()) {
      console.log('✅ Found existing conversation');
      
      // Update participant details in case they changed
      await updateDoc(conversationRef, {
        [`participantDetails.${user1Id}`]: {
          displayName: user1Data.displayName || 'User',
          avatar: user1Data.avatar || '👤',
          username: user1Data.username || ''
        },
        [`participantDetails.${user2Id}`]: {
          displayName: user2Data.displayName || 'User',
          avatar: user2Data.avatar || '👤',
          username: user2Data.username || ''
        }
      });
      
      return { id: conversationId, ...conversationSnap.data() };
    }
    
    // Create new conversation with participant details
    console.log('📝 Creating new conversation');
    const newConversation = {
      id: conversationId,
      participants: [user1Id, user2Id],
      participantDetails: {
        [user1Id]: {
          displayName: user1Data.displayName || 'User',
          avatar: user1Data.avatar || '👤',
          username: user1Data.username || ''
        },
        [user2Id]: {
          displayName: user2Data.displayName || 'User',
          avatar: user2Data.avatar || '👤',
          username: user2Data.username || ''
        }
      },
      lastMessage: null,
      lastMessageTime: serverTimestamp(),
      unreadCount: {
        [user1Id]: 0,
        [user2Id]: 0
      },
      createdAt: serverTimestamp()
    };
    
    await setDoc(conversationRef, newConversation);
    console.log('✅ Conversation created');
    
    return { id: conversationId, ...newConversation };
  } catch (error) {
    console.error('❌ Error getting/creating conversation:', error);
    throw error;
  }
};

/**
 * Send a message
 */
export const sendMessage = async (conversationId, senderId, receiverId, messageText, senderData) => {
  try {
    console.log('📤 Sending message...');

    // ✅ CHECK PERMISSIONS before sending
    await canMessage(senderId, receiverId);
    
    // Add message to messages subcollection
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messageData = {
      senderId,
      receiverId,
      text: messageText,
      read: false,
      createdAt: serverTimestamp()
    };
    
    const messageDoc = await addDoc(messagesRef, messageData);
    console.log('✅ Message sent:', messageDoc.id);
    
    // Update conversation with last message
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    const currentUnread = conversationSnap.exists() ? conversationSnap.data()?.unreadCount?.[receiverId] || 0 : 0;
    
    await updateDoc(conversationRef, {
      lastMessage: messageText,
      lastMessageTime: serverTimestamp(),
      [`unreadCount.${receiverId}`]: currentUnread + 1,
      [`participantDetails.${senderId}`]: {
        displayName: senderData?.displayName || 'User',
        avatar: senderData?.avatar || null,
        username: senderData?.username || null
      }
    });
    
    console.log('✅ Conversation updated');
    
    return { id: messageDoc.id, ...messageData };
  } catch (error) {
    console.error('❌ Error sending message:', error);
    throw error;
  }
};

/**
 * Get all conversations for a user
 */
export const getUserConversations = async (userId) => {
  try {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId),
      orderBy('lastMessageTime', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const conversations = [];
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // Get other participant's ID
      const otherUserId = data.participants.find(id => id !== userId);
      
      // ✅ ALWAYS fetch fresh user data to get online status
      const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
      const freshUserData = otherUserDoc.exists() ? otherUserDoc.data() : {};
      
      // Fallback to participantDetails if user doc doesn't exist
      const participantDetails = data.participantDetails?.[otherUserId];
      const otherUserData = {
        displayName: freshUserData.displayName || participantDetails?.displayName || 'User',
        username: freshUserData.username || participantDetails?.username || '',
        avatar: freshUserData.avatar || participantDetails?.avatar || '👤',
        isOnline: freshUserData.isOnline || false
      };
      
      conversations.push({
        id: docSnap.id,
        ...data,
        otherUser: {
          id: otherUserId,
          name: otherUserData.displayName,
          username: otherUserData.username,
          avatar: otherUserData.avatar,
          online: otherUserData.isOnline === true
        },
        unreadCount: data.unreadCount?.[userId] || 0
      });
    }
    
    return conversations;
  } catch (error) {
    console.error('❌ Error getting conversations:', error);
    return [];
  }
};

/**
 * Subscribe to conversations (real-time)
 */
export const subscribeToConversations = (userId, callback) => {
  try {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId),
      orderBy('lastMessageTime', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const conversations = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Get other participant's ID
        const otherUserId = data.participants.find(id => id !== userId);
        
        // ✅ ALWAYS fetch fresh user data to get online status
        const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
        const freshUserData = otherUserDoc.exists() ? otherUserDoc.data() : {};
        
        // Fallback to participantDetails if user doc doesn't exist
        const participantDetails = data.participantDetails?.[otherUserId];
        const otherUserData = {
          displayName: freshUserData.displayName || participantDetails?.displayName || 'User',
          username: freshUserData.username || participantDetails?.username || '',
          avatar: freshUserData.avatar || participantDetails?.avatar || '👤',
          isOnline: freshUserData.isOnline || false
        };
        
        conversations.push({
          id: docSnap.id,
          ...data,
          otherUser: {
            id: otherUserId,
            name: otherUserData.displayName,
            username: otherUserData.username,
            avatar: otherUserData.avatar,
            online: otherUserData.isOnline === true
          },
          unreadCount: data.unreadCount?.[userId] || 0,
          muted: data.muted?.[userId] || false 
        });
      }
      
      callback(conversations);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to conversations:', error);
    return () => {};
  }
};

/**
 * Subscribe to messages in a conversation (real-time)
 */
export const subscribeToMessages = (conversationId, callback) => {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(messages);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to messages:', error);
    return () => {};
  }
};

/**
 * Mark conversation as read
 */
export const markConversationAsRead = async (conversationId, userId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      [`unreadCount.${userId}`]: 0
    });
    
    // Mark all messages as read
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(
      messagesRef,
      where('receiverId', '==', userId),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(doc => 
      updateDoc(doc.ref, { read: true })
    );
    
    await Promise.all(updatePromises);
    console.log('✅ Conversation marked as read');
  } catch (error) {
    console.error('❌ Error marking as read:', error);
  }
};

/**
 * Get total unread message count for user
 */
export const getUnreadMessageCount = async (userId) => {
  try {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId)
    );
    
    const snapshot = await getDocs(q);
    let totalUnread = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      totalUnread += data.unreadCount?.[userId] || 0;
    });
    
    return totalUnread;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
};

/**
 * Subscribe to unread message count (real-time)
 */
export const subscribeToUnreadMessageCount = (userId, callback) => {
  try {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalUnread = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        totalUnread += data.unreadCount?.[userId] || 0;
      });
      
      callback(totalUnread);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to unread count:', error);
    return () => {};
  }
};

/**
 * Check if user has active subscription to a creator
 */
export const hasActiveSubscription = async (userId, creatorId) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', `${userId}_${creatorId}`);
    const subscriptionSnap = await getDoc(subscriptionRef);
    
    if (!subscriptionSnap.exists()) {
      return false;
    }
    
    const subscription = subscriptionSnap.data();
    
    // Check if subscription is active and not expired
    const now = new Date();
    const expiresAt = subscription.expiresAt?.toDate();
    
    return subscription.status === 'active' && expiresAt > now;
  } catch (error) {
    console.error('❌ Error checking subscription:', error);
    return false;
  }
};

/**
 * Update user's online status
 */
export const updateUserOnlineStatus = async (userId, isOnline) => {
  if (!userId) {
    console.warn('⚠️ Cannot update status: userId is undefined');
    return;
  }

  try {
    console.log(`🔄 Attempting to set user ${userId} to ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    const userRef = doc(db, 'users', userId);
    
    // First check if document exists
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.error(`❌ User document does not exist for userId: ${userId}`);
      return;
    }
    
    console.log(`📝 User document exists, updating status...`);
    
    // Update the status
    await updateDoc(userRef, {
      isOnline: isOnline,
      lastSeen: serverTimestamp()
    });
    
    console.log(`✅ SUCCESS: User ${userId} is now ${isOnline ? 'ONLINE ✓' : 'OFFLINE ✗'}`);
    
    // Verify the update
    const updatedSnap = await getDoc(userRef);
    const updatedData = updatedSnap.data();
    console.log(`🔍 Verified isOnline field:`, updatedData.isOnline);
    
  } catch (error) {
    console.error('❌ Error updating online status:', error);
    console.error('Error details:', error.message);
  }
};

/**
 * Subscribe to user's online status
 */
export const subscribeToUserStatus = (userId, callback) => {
  try {
    const userRef = doc(db, 'users', userId);
    
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        callback(userData.isOnline || false);
      }
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to user status:', error);
    return () => {};
  }
};

/**
 * Delete a conversation (HARD DELETE)
 */
export const deleteConversation = async (conversationId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    await deleteDoc(conversationRef);
    console.log('✅ Conversation deleted');
  } catch (error) {
    console.error('❌ Error deleting conversation:', error);
    throw error;
  }
};

/**
 * Mute a conversation
 */
export const muteConversation = async (conversationId, userId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      [`muted.${userId}`]: true
    });
    console.log('✅ Conversation muted');
  } catch (error) {
    console.error('❌ Error muting conversation:', error);
    throw error;
  }
};

/**
 * Unmute a conversation
 */
export const unmuteConversation = async (conversationId, userId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      [`muted.${userId}`]: false
    });
    console.log('✅ Conversation unmuted');
  } catch (error) {
    console.error('❌ Error unmuting conversation:', error);
    throw error;
  }
};

/**
 * Clear all messages in a chat
 */
export const clearChat = async (conversationId) => {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const snapshot = await getDocs(messagesRef);
    
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Update conversation
    const conversationRef = doc(db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      lastMessage: '',
      lastMessageTime: serverTimestamp()
    });
    
    console.log('✅ Chat cleared');
  } catch (error) {
    console.error('❌ Error clearing chat:', error);
    throw error;
  }
};

/**
 * Block a user and delete conversation
 */
export const blockUser = async (blockerId, blockedId) => {
  try {
    // Create block document
    const blockRef = doc(collection(db, 'blocks'));
    await setDoc(blockRef, {
      blockerId,
      blockedId,
      createdAt: serverTimestamp()
    });
    
    console.log('✅ User blocked');
    
    // Delete the conversation
    const conversationId = [blockerId, blockedId].sort().join('_');
    const conversationRef = doc(db, 'conversations', conversationId);
    
    try {
      await deleteDoc(conversationRef);
      console.log('✅ Conversation deleted');
    } catch (error) {
      console.log('⚠️ Conversation may not exist');
    }
  } catch (error) {
    console.error('❌ Error blocking user:', error);
    throw error;
  }
};

/**
 * Check if user is blocked
 */
export const isUserBlocked = async (user1Id, user2Id) => {
  try {
    const blocksRef = collection(db, 'blocks');
    
    // Check if user1 blocked user2
    const q1 = query(
      blocksRef,
      where('blockerId', '==', user1Id),
      where('blockedId', '==', user2Id)
    );
    
    // Check if user2 blocked user1
    const q2 = query(
      blocksRef,
      where('blockerId', '==', user2Id),
      where('blockedId', '==', user1Id)
    );
    
    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(q1),
      getDocs(q2)
    ]);
    
    return !snapshot1.empty || !snapshot2.empty;
  } catch (error) {
    console.error('Error checking block status:', error);
    return false;
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (blockerId, blockedId) => {
  try {
    const blocksRef = collection(db, 'blocks');
    const q = query(
      blocksRef,
      where('blockerId', '==', blockerId),
      where('blockedId', '==', blockedId)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
      console.log('✅ User unblocked');
    }
  } catch (error) {
    console.error('❌ Error unblocking user:', error);
    throw error;
  }
};