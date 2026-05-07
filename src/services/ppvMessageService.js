// src/services/ppvMessageService.js

import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import { deductFromWallet } from './walletService';
import { getCreatorSplit, creditAmbassadorCommission } from './commissionService';

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

    // 3. ✅ Dynamic split via commission service
    const { creatorEarning, platformFee, ambassadorCommission, ambassadorId } =
      await getCreatorSplit(message.senderId, message.unlockPrice);

    const creatorBalRef = doc(db, 'creator_balances', message.senderId);
    const month = new Date().toLocaleString('default', { month: 'short' });
    try {
      await updateDoc(creatorBalRef, {
        availableBalance: increment(creatorEarning),
        totalEarnings: increment(creatorEarning),
        [`monthlyEarnings.${month}`]: increment(creatorEarning),
        updatedAt: serverTimestamp(),
      });
    } catch {
      await setDoc(creatorBalRef, {
        creatorId: message.senderId,
        availableBalance: creatorEarning,
        totalEarnings: creatorEarning,
        monthlyEarnings: { [month]: creatorEarning },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // ✅ Credit ambassador commission if referred creator
    await creditAmbassadorCommission(ambassadorId, ambassadorCommission, message.senderId, 'ppv');

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