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
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getUserTier } from './tierService';

/**
 * ✅ FIXED: Check if user is blocked — never throws, returns false on error
 * Using 'list' permission which is now allowed for authenticated users
 */
export const isUserBlocked = async (user1Id, user2Id) => {
  try {
    const blocksRef = collection(db, 'blocks');
    const q1 = query(blocksRef, where('blockerId', '==', user1Id), where('blockedId', '==', user2Id));
    const q2 = query(blocksRef, where('blockerId', '==', user2Id), where('blockedId', '==', user1Id));
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    return !s1.empty || !s2.empty;
  } catch (error) {
    // If we can't read blocks (permissions), assume not blocked
    // so users are never accidentally locked out of messaging
    console.warn('⚠️ Could not check block status, assuming not blocked:', error.message);
    return false;
  }
};

/**
 * Check if users can message each other
 */
export const canMessage = async (user1Id, user2Id) => {
  try {
    const blocked = await isUserBlocked(user1Id, user2Id);
    if (blocked) throw new Error('You cannot message this user');

    const user1Doc = await getDoc(doc(db, 'users', user1Id));
    const user2Doc = await getDoc(doc(db, 'users', user2Id));

    if (!user1Doc.exists() || !user2Doc.exists()) throw new Error('User not found');

    const user1Data = user1Doc.data();
    const user2Data = user2Doc.data();

    const user1IsAdmin = user1Data.isAdmin === true || user1Data.role === 'admin';
    const user2IsAdmin = user2Data.isAdmin === true || user2Data.role === 'admin';
    if (user1IsAdmin || user2IsAdmin) return true;

    const user1IsVerifiedCreator =
      (user1Data.isCreator === true || user1Data.role === 'creator') &&
      user1Data.kycStatus === 'approved';
    const user2IsVerifiedCreator =
      (user2Data.isCreator === true || user2Data.role === 'creator') &&
      user2Data.kycStatus === 'approved';
    if (user1IsVerifiedCreator && user2IsVerifiedCreator) return true;

    const sub1 = await getDoc(doc(db, 'subscriptions', `${user1Id}_${user2Id}`));
    const sub2 = await getDoc(doc(db, 'subscriptions', `${user2Id}_${user1Id}`));

    const checkSubscription = (subDoc) => {
      if (!subDoc.exists()) return false;
      const data = subDoc.data();
      if (data.status !== 'active') return false;
      if (data.expiresAt) {
        const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (expiresAt < new Date()) return false;
      }
      return true;
    };

    if (checkSubscription(sub1) || checkSubscription(sub2)) return true;

    throw new Error('You need an active subscription to message this creator');
  } catch (error) {
    throw error;
  }
};

/**
 * Get or create a conversation between two users
 */
export const getOrCreateConversation = async (user1Id, user2Id) => {
  try {
    await canMessage(user1Id, user2Id);

    const conversationId = [user1Id, user2Id].sort().join('_');
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);

    const user1Doc = await getDoc(doc(db, 'users', user1Id));
    const user2Doc = await getDoc(doc(db, 'users', user2Id));
    const user1Data = user1Doc.exists() ? user1Doc.data() : {};
    const user2Data = user2Doc.exists() ? user2Doc.data() : {};

    if (conversationSnap.exists()) {
      await updateDoc(conversationRef, {
        [`participantDetails.${user1Id}`]: {
          displayName: user1Data.displayName || 'User',
          avatar: user1Data.avatar || '👤',
          username: user1Data.username || '',
        },
        [`participantDetails.${user2Id}`]: {
          displayName: user2Data.displayName || 'User',
          avatar: user2Data.avatar || '👤',
          username: user2Data.username || '',
        },
      });
      return { id: conversationId, ...conversationSnap.data() };
    }

    const newConversation = {
      id: conversationId,
      participants: [user1Id, user2Id],
      participantDetails: {
        [user1Id]: {
          displayName: user1Data.displayName || 'User',
          avatar: user1Data.avatar || '👤',
          username: user1Data.username || '',
        },
        [user2Id]: {
          displayName: user2Data.displayName || 'User',
          avatar: user2Data.avatar || '👤',
          username: user2Data.username || '',
        },
      },
      lastMessage: null,
      lastMessageTime: serverTimestamp(),
      unreadCount: { [user1Id]: 0, [user2Id]: 0 },
      createdAt: serverTimestamp(),
    };

    await setDoc(conversationRef, newConversation);
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
    await canMessage(senderId, receiverId);

    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messageData = {
      senderId,
      receiverId,
      text: String(messageText),
      read: false,
      createdAt: serverTimestamp(),
    };

    const messageDoc = await addDoc(messagesRef, messageData);

    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    const currentUnread = conversationSnap.exists()
      ? conversationSnap.data()?.unreadCount?.[receiverId] || 0
      : 0;

    await updateDoc(conversationRef, {
      lastMessage: String(messageText),
      lastMessageTime: serverTimestamp(),
      [`unreadCount.${receiverId}`]: currentUnread + 1,
      [`participantDetails.${senderId}`]: {
        displayName: senderData?.displayName || 'User',
        avatar: senderData?.avatar || null,
        username: senderData?.username || null,
      },
    });

    return { id: messageDoc.id, ...messageData };
  } catch (error) {
    console.error('❌ Error sending message:', error);
    throw error;
  }
};

const parseTimeMs = (t) => {
  if (!t) return 0;
  try {
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.toDate === 'function') return t.toDate().getTime();
    if (t instanceof Date) return t.getTime();
    if (t.seconds != null) return t.seconds * 1000;
    if (t._seconds != null) return t._seconds * 1000;
    if (typeof t === 'number') return t < 1e11 ? t * 1000 : t;
    if (typeof t === 'string') {
      const p = new Date(t).getTime();
      return isNaN(p) ? 0 : p;
    }
  } catch {
    return 0;
  }
  return 0;
};

/**
 * Subscribe to conversations (real-time)
 * Avoids rigid orderBy('lastMessageTime') which hides older conversations missing the field
 */
export const subscribeToConversations = (userId, callback) => {
  try {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const conversations = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const otherUserId = data.participants.find((id) => id !== userId);
        if (!otherUserId) continue;

        let freshUserData = {};
        try {
          const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
          freshUserData = otherUserDoc.exists() ? otherUserDoc.data() : {};
        } catch (e) {
          // ignore read error
        }
        const participantDetails = data.participantDetails?.[otherUserId];

        const rawLastMessage = data.lastMessage;
        const lastMessageText =
          typeof rawLastMessage === 'string' ? rawLastMessage : rawLastMessage?.text || '';

        // Resolve tier for other user (checks both directions for fan <-> creator)
        let tier = null;
        try {
          tier = await getUserTier(otherUserId, userId);
          if (!tier) {
            tier = await getUserTier(userId, otherUserId);
          }
        } catch (e) {}

        const lastTime = data.lastMessageTime || data.updatedAt || data.createdAt || data.timestamp || null;

        conversations.push({
          id: docSnap.id,
          ...data,
          lastMessage: lastMessageText,
          lastMessageTime: lastTime,
          tier: tier || data.tier || null,
          isSubscriber: Boolean(tier || data.isSubscriber),
          isSpender: Boolean(tier || data.isSpender || (data.totalSpent && data.totalSpent > 0)),
          otherUser: {
            id: otherUserId,
            name: freshUserData.displayName || participantDetails?.displayName || 'User',
            username: freshUserData.username || participantDetails?.username || '',
            avatar: freshUserData.avatar || participantDetails?.avatar || '👤',
            online: freshUserData.isOnline === true,
            lastSeen: freshUserData.lastSeen || null,
            tier: tier || null,
          },
          unreadCount: data.unreadCount?.[userId] || 0,
          muted: data.muted?.[userId] || false,
        });
      }

      // Sort in memory by newest activity
      conversations.sort((a, b) => parseTimeMs(b.lastMessageTime) - parseTimeMs(a.lastMessageTime));

      callback(conversations);
    }, (error) => {
      console.warn('⚠️ Conversations listener error (non-fatal):', error.message);
      callback([]);
    });

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to conversations:', error);
    return () => {};
  }
};

/**
 * Subscribe to messages in a conversation (real-time)
 * Queries all messages and sorts in memory to ensure older messages (with timestamp/time/sentAt)
 * are NEVER excluded by Firestore's strict orderBy clause
 */
export const subscribeToMessages = (conversationId, callback) => {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');

    const unsubscribe = onSnapshot(messagesRef, (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Chronological sort handling all field variations across older and newer messages
      messages.sort((a, b) => {
        const timeA = parseTimeMs(a.createdAt || a.timestamp || a.sentAt || a.time || a.date);
        const timeB = parseTimeMs(b.createdAt || b.timestamp || b.sentAt || b.time || b.date);
        return timeA - timeB;
      });

      callback(messages);
    }, (error) => {
      console.warn('⚠️ Messages listener error (non-fatal):', error.message);
      callback([]);
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
    await updateDoc(conversationRef, { [`unreadCount.${userId}`]: 0 });

    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(
      messagesRef,
      where('receiverId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map((d) => updateDoc(d.ref, { read: true })));
  } catch (error) {
    console.error('❌ Error marking as read:', error);
  }
};

/**
 * Subscribe to unread message count (real-time)
 */
export const subscribeToUnreadMessageCount = (userId, callback) => {
  try {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId)  // ✅ Fixed: was '==' which is wrong for arrays
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalUnread = 0;
      snapshot.forEach((doc) => {
        totalUnread += doc.data().unreadCount?.[userId] || 0;
      });
      callback(totalUnread);
    }, (error) => {
      console.warn('⚠️ Unread message count listener error (non-fatal):', error.message);
      callback(0);
    });
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to unread count:', error);
    return () => {};
  }
};

/**
 * ✅ FIXED: Delete a conversation — participants can now delete
 */
export const deleteConversation = async (conversationId, userId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);

    if (!conversationSnap.exists()) {
      console.log('⚠️ Conversation does not exist');
      return;
    }

    const data = conversationSnap.data();
    if (userId && Array.isArray(data.participants) && !data.participants.includes(userId)) {
      throw new Error('You are not a participant in this conversation');
    }

    // Delete all messages first
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messagesSnap = await getDocs(messagesRef);
    await Promise.all(messagesSnap.docs.map((d) => deleteDoc(d.ref)));

    // Then delete the conversation doc
    await deleteDoc(conversationRef);
    console.log('✅ Conversation deleted');
  } catch (error) {
    console.error('❌ Error deleting conversation:', error);
    throw error;
  }
};

/**
 * ✅ FIXED: Clear all messages — keeps conversation intact
 */
export const clearChat = async (conversationId, userId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);

    if (!conversationSnap.exists()) throw new Error('Conversation does not exist');

    const data = conversationSnap.data();
    if (userId && Array.isArray(data.participants) && !data.participants.includes(userId)) {
      throw new Error('You are not a participant in this conversation');
    }

    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const snapshot = await getDocs(messagesRef);
    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));

    await updateDoc(conversationRef, {
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
    });

    console.log('✅ Chat cleared');
  } catch (error) {
    console.error('❌ Error clearing chat:', error);
    throw error;
  }
};

/**
 * Mute / Unmute a conversation
 */
export const muteConversation = async (conversationId, userId) => {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), { [`muted.${userId}`]: true });
  } catch (error) {
    console.error('❌ Error muting:', error);
    throw error;
  }
};

export const unmuteConversation = async (conversationId, userId) => {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), { [`muted.${userId}`]: false });
  } catch (error) {
    console.error('❌ Error unmuting:', error);
    throw error;
  }
};

/**
 * ✅ FIXED: Block a user — does NOT delete conversation
 * Conversation stays visible so user can unblock from the chat menu
 */
export const blockUser = async (blockerId, blockedId) => {
  try {
    const blockRef = doc(collection(db, 'blocks'));
    await setDoc(blockRef, {
      blockerId,
      blockedId,
      createdAt: serverTimestamp(),
    });
    console.log('✅ User blocked');
  } catch (error) {
    console.error('❌ Error blocking user:', error);
    throw error;
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

/**
 * Update user's online status
 */
export const updateUserOnlineStatus = async (userId, isOnline) => {
  if (!userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    await updateDoc(userRef, { isOnline, lastSeen: serverTimestamp() });
  } catch (error) {
    console.error('❌ Error updating online status:', error);
  }
};

/**
 * Subscribe to user's online status
 */
export const subscribeToUserStatus = (userId, callback) => {
  if (!userId) return () => {};
  try {
    const unsubscribe = onSnapshot(doc(db, 'users', userId), (d) => {
      if (d.exists()) {
        const data = d.data();
        callback({
          isOnline: data.isOnline === true,
          lastSeen: data.lastSeen || null,
        });
      }
    }, (err) => {
      console.warn('⚠️ User status listener error (non-fatal):', err.message);
    });
    return unsubscribe;
  } catch (error) {
    console.error('❌ Error subscribing to user status:', error);
    return () => {};
  }
};

/**
 * Check if user has active subscription to a creator
 */
export const hasActiveSubscription = async (userId, creatorId) => {
  try {
    const subscriptionSnap = await getDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`));
    if (!subscriptionSnap.exists()) return false;
    const subscription = subscriptionSnap.data();
    const expiresAt = subscription.expiresAt?.toDate();
    return subscription.status === 'active' && expiresAt > new Date();
  } catch (error) {
    console.error('❌ Error checking subscription:', error);
    return false;
  }
};

/**
 * Get total unread message count for user
 */
export const getUnreadMessageCount = async (userId) => {
  try {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId)
    );
    const snapshot = await getDocs(q);
    let totalUnread = 0;
    snapshot.forEach((doc) => { totalUnread += doc.data().unreadCount?.[userId] || 0; });
    return totalUnread;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
};

/**
 * Get all conversations for a user
 */
export const getUserConversations = async (userId) => {
  try {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId),
      orderBy('lastMessageTime', 'desc')
    );
    const snapshot = await getDocs(q);
    const conversations = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const otherUserId = data.participants.find((id) => id !== userId);
      const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
      const freshUserData = otherUserDoc.exists() ? otherUserDoc.data() : {};
      const participantDetails = data.participantDetails?.[otherUserId];

      conversations.push({
        id: docSnap.id,
        ...data,
        otherUser: {
          id: otherUserId,
          name: freshUserData.displayName || participantDetails?.displayName || 'User',
          username: freshUserData.username || participantDetails?.username || '',
          avatar: freshUserData.avatar || participantDetails?.avatar || '👤',
          online: freshUserData.isOnline === true,
          lastSeen: freshUserData.lastSeen || null,
        },
        unreadCount: data.unreadCount?.[userId] || 0,
      });
    }

    return conversations;
  } catch (error) {
    console.error('❌ Error getting conversations:', error);
    return [];
  }
};

/**
 * Send automated message from creator to fan on subscription or follow
 * @param {string} creatorId
 * @param {string} fanId
 * @param {'subscription' | 'follow'} type
 */
export const sendCreatorAutoMessage = async (creatorId, fanId, type = 'follow') => {
  if (!creatorId || !fanId || creatorId === fanId) return;

  try {
    // 1. Fetch creator profile to read their auto-messages settings
    const creatorDoc = await getDoc(doc(db, 'users', creatorId));
    if (!creatorDoc.exists()) return;
    const creatorData = creatorDoc.data();

    const autoConfig = creatorData.autoMessages || {};
    
    let isEnabled = true;
    let template = '';

    if (type === 'subscription') {
      isEnabled = autoConfig.subscriberEnabled !== false; // enabled by default
      template = autoConfig.subscriberMessage || 'Hey {name}! 🎉 Thank you so much for subscribing to my profile. So excited to have you here! Feel free to DM me anytime.';
    } else {
      isEnabled = autoConfig.followerEnabled !== false; // enabled by default
      template = autoConfig.followerMessage || 'Hey {name}! 👋 Thanks for following my profile. Stay tuned for exclusive posts and updates!';
    }

    if (!isEnabled || !template.trim()) {
      return;
    }

    // 2. Fetch fan profile to personalize {name}
    let fanName = 'there';
    const fanDoc = await getDoc(doc(db, 'users', fanId));
    let fanData = {};
    if (fanDoc.exists()) {
      fanData = fanDoc.data();
      fanName = fanData.displayName || fanData.name || (fanData.username ? `@${fanData.username}` : 'there');
    }

    const messageText = template
      .replace(/{name}/gi, fanName)
      .replace(/{creator}/gi, creatorData.displayName || 'Creator');

    // 3. Get or create conversation between creator and fan
    const conversation = await getOrCreateConversation(creatorId, fanId);
    if (!conversation?.id) return;

    // 4. Send message from creator to fan
    const messagesRef = collection(db, 'conversations', conversation.id, 'messages');
    await addDoc(messagesRef, {
      senderId: creatorId,
      receiverId: fanId,
      text: messageText,
      read: false,
      isAutoMessage: true,
      createdAt: serverTimestamp(),
    });

    // 5. Update conversation unread count for fan
    const conversationRef = doc(db, 'conversations', conversation.id);
    const conversationSnap = await getDoc(conversationRef);
    const currentUnread = conversationSnap.exists()
      ? conversationSnap.data()?.unreadCount?.[fanId] || 0
      : 0;

    await updateDoc(conversationRef, {
      lastMessage: messageText,
      lastMessageTime: serverTimestamp(),
      [`unreadCount.${fanId}`]: currentUnread + 1,
      [`participantDetails.${creatorId}`]: {
        displayName: creatorData.displayName || 'Creator',
        avatar: creatorData.avatar || creatorData.photoURL || '👤',
        username: creatorData.username || '',
      },
      [`participantDetails.${fanId}`]: {
        displayName: fanData.displayName || 'User',
        avatar: fanData.avatar || fanData.photoURL || '👤',
        username: fanData.username || '',
      }
    });

    console.log(`✅ Automated ${type} message sent from ${creatorId} to ${fanId}`);
  } catch (error) {
    console.warn(`⚠️ Failed to send automated ${type} message:`, error);
  }
};