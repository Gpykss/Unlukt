// src/services/ppvMessageService.js

import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import logger from '../utils/logger';

export const sendPPVMessage = async (conversationId, senderId, messageData) => {
  try {
    const { content, price, mediaUrl, mediaType } = messageData;
    // Sent through the server: the media and full text are stored privately from the start,
    // the chat only shows a teaser + blurred preview until the fan pays.
    const unlockPrice = Math.max(1, Number(price) || 5);
    const res = await httpsCallable(functions, 'sendPPV', { timeout: 60000 })({
      conversationId, content: content || '', price: unlockPrice, mediaUrl: mediaUrl || null, mediaType: mediaType || null,
    });
    logger.success('PPV message sent:', res.data.messageId);
    return res.data;
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
    const unlockFn = httpsCallable(functions, 'unlock');
    const response = await unlockFn({ conversationId, messageId });
    logger.success('PPV message unlocked via secure ledger:', messageId);
    return {
      success: true,
      unlocked: true,
      mediaUrl: response.data?.url,
      alreadyUnlocked: response.data?.alreadyUnlocked,
      txId: response.data?.txId,
    };
  } catch (error) {
    // No browser-side fallback: unlocking is only ever done (and paid for) on the server
    logger.error('Unlock failed:', error);
    const msg = /insufficient/i.test(error.message || '') ? 'Insufficient balance. Please top up your wallet.'
      : error.code === 'functions/unavailable' || error.code === 'functions/deadline-exceeded'
        ? "Network is slow — couldn't confirm the unlock. Try again (you won't be charged twice)."
        : error.message || 'Failed to unlock';
    throw new Error(msg);
  }
};

export const getMessagePreview = (message) => {
  if (!message.isPPV) return message.content;
  const hasMedia = (message.mediaUrl || message.hasMedia) && message.mediaType && message.mediaType !== 'text';
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