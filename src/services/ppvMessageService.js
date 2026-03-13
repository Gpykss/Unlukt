// src/services/ppvMessageService.js

import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import { deductFromWallet } from './walletService';

export const sendPPVMessage = async (conversationId, senderId, messageData) => {
  try {
    const { content, price, mediaUrl, mediaType } = messageData;
    const unlockPrice = Math.max(1, Number(price) || 5);

    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messageDoc = await addDoc(messagesRef, {
      senderId,
      content: content || '',
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      isPPV: true,
      unlockPrice,
      unlockedBy: [],
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessage: '🔒 Locked message',
      lastMessageTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    logger.success('PPV message sent:', messageDoc.id);
    return { messageId: messageDoc.id, unlockPrice };
  } catch (error) {
    logger.error('Error sending PPV message:', error);
    throw error;
  }
};

export const hasUnlockedMessage = async (conversationId, messageId, userId) => {
  try {
    const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    if (!messageDoc.exists()) return false;
    const message = messageDoc.data();
    if (message.senderId === userId) return true;
    return message.unlockedBy?.includes(userId) || false;
  } catch (error) {
    logger.error('Error checking unlock status:', error);
    return false;
  }
};

export const unlockPPVMessage = async (conversationId, messageId, userId) => {
  try {
    const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);

    if (!messageDoc.exists()) throw new Error('Message not found');

    const message = messageDoc.data();

    if (!message.isPPV) throw new Error('Message is not locked');
    if (message.unlockedBy?.includes(userId)) throw new Error('Already unlocked');

    // 1. Deduct from wallet first
    await deductFromWallet(userId, message.unlockPrice, 'PPV message unlock', {
      contentType: 'ppv_message',
      contentId: messageId,
      creatorId: message.senderId,
      conversationId,
    });

    // 2. Unlock the message
    await updateDoc(messageRef, {
      unlockedBy: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });

    // 3. ✅ Credit creator using increment() — no getDoc needed, avoids permission error
    const creatorEarning = message.unlockPrice * 0.80;
    const creatorBalRef = doc(db, 'creator_balances', message.senderId);
    try {
      await updateDoc(creatorBalRef, {
        pendingBalance: increment(creatorEarning),
        totalEarnings: increment(creatorEarning),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Doc doesn't exist yet — create it
      await setDoc(creatorBalRef, {
        creatorId: message.senderId,
        availableBalance: 0,
        pendingBalance: creatorEarning,
        totalEarnings: creatorEarning,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    logger.success('PPV message unlocked:', messageId);
    return { success: true, unlocked: true };
  } catch (error) {
    logger.error('Error unlocking PPV message:', error);
    throw error;
  }
};

export const getMessagePreview = (message) => {
  if (!message.isPPV) return message.content;
  const hasMedia = message.mediaUrl && message.mediaType && message.mediaType !== 'text';
  if (hasMedia) return `🔒 Unlock to view ${message.mediaType} — $${message.unlockPrice}`;
  const preview = message.content?.substring(0, 20) || '';
  return `🔒 ${preview}... — Unlock for $${message.unlockPrice}`;
};

export default {
  sendPPVMessage,
  hasUnlockedMessage,
  unlockPPVMessage,
  getMessagePreview,
};