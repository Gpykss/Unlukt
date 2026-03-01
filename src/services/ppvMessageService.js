// src/services/ppvMessageService.js - Pay-Per-View Messaging

import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import cryptoService from './crypto.service';

/**
 * Send a PPV (locked) message
 */
export const sendPPVMessage = async (conversationId, senderId, messageData) => {
  try {
    const { content, price, mediaUrl, mediaType } = messageData;
    
    // Validate price
    const unlockPrice = Math.max(1, Number(price) || 5);
    
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messageDoc = await addDoc(messagesRef, {
      senderId,
      content: content || '',
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'text',
      isPPV: true,
      unlockPrice,
      unlockedBy: [],
      createdAt: serverTimestamp()
    });
    
    // Update conversation last message
    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessage: {
        text: '🔒 Locked message',
        createdAt: serverTimestamp(),
        senderId
      },
      updatedAt: serverTimestamp()
    });
    
    logger.success('PPV message sent:', messageDoc.id);
    return { messageId: messageDoc.id, unlockPrice };
  } catch (error) {
    logger.error('Error sending PPV message:', error);
    throw error;
  }
};

/**
 * Check if user has unlocked a PPV message
 */
export const hasUnlockedMessage = async (conversationId, messageId, userId) => {
  try {
    const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) return false;
    
    const message = messageDoc.data();
    
    // Creator can always see their own message
    if (message.senderId === userId) return true;
    
    // Check if user has unlocked
    return message.unlockedBy?.includes(userId) || false;
  } catch (error) {
    logger.error('Error checking unlock status:', error);
    return false;
  }
};

/**
 * Unlock a PPV message with crypto payment
 */
export const unlockPPVMessage = async (conversationId, messageId, userId, userEmail, userName, userCountry) => {
  try {
    const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }
    
    const message = messageDoc.data();
    
    if (!message.isPPV) {
      throw new Error('Message is not locked');
    }
    
    if (message.unlockedBy?.includes(userId)) {
      throw new Error('You have already unlocked this message');
    }
    
    // Initialize crypto payment
    const payment = await cryptoService.initializeUSDTPayment({
      amount: message.unlockPrice,
      userId,
      userEmail,
      userName,
      contentType: 'ppv_message',
      contentId: messageId,
      creatorId: message.senderId,
      userCountry,
      metadata: {
        conversationId,
        messageId
      }
    });
    
    // Store pending unlock
    await setDoc(doc(db, 'ppv_unlocks', payment.paymentId), {
      conversationId,
      messageId,
      userId,
      creatorId: message.senderId,
      amount: message.unlockPrice,
      status: 'pending_payment',
      createdAt: serverTimestamp()
    });
    
    logger.success('PPV unlock payment initialized:', messageId);
    return payment;
  } catch (error) {
    logger.error('Error unlocking PPV message:', error);
    throw error;
  }
};

/**
 * Complete PPV unlock after payment verified
 * Called by admin after verifying crypto payment
 */
export const completePPVUnlock = async (paymentId) => {
  try {
    const unlockRef = doc(db, 'ppv_unlocks', paymentId);
    const unlockDoc = await getDoc(unlockRef);
    
    if (!unlockDoc.exists()) {
      throw new Error('Unlock record not found');
    }
    
    const unlock = unlockDoc.data();
    
    // Add user to unlockedBy array
    const messageRef = doc(db, 'conversations', unlock.conversationId, 'messages', unlock.messageId);
    await updateDoc(messageRef, {
      unlockedBy: [...(unlock.unlockedBy || []), unlock.userId],
      updatedAt: serverTimestamp()
    });
    
    // Update unlock status
    await updateDoc(unlockRef, {
      status: 'completed',
      unlockedAt: serverTimestamp()
    });
    
    logger.success('PPV message unlocked:', unlock.messageId);
    return true;
  } catch (error) {
    logger.error('Error completing PPV unlock:', error);
    throw error;
  }
};

/**
 * Get message preview (for locked messages)
 */
export const getMessagePreview = (message) => {
  if (!message.isPPV) return message.content;
  
  const hasMedia = message.mediaUrl && message.mediaType;
  
  if (hasMedia) {
    return `🔒 Unlock to view ${message.mediaType} - $${message.unlockPrice}`;
  }
  
  // Show first 20 characters as preview
  const preview = message.content?.substring(0, 20) || '';
  return `🔒 ${preview}... - Unlock for $${message.unlockPrice}`;
};

export default {
  sendPPVMessage,
  hasUnlockedMessage,
  unlockPPVMessage,
  completePPVUnlock,
  getMessagePreview
};
