// src/services/ppvMessageService.js

import { doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
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
    logger.warn('Cloud function unlock error, falling back to direct ledger unlock:', error.message);

    try {
      const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) throw new Error('Message not found');
      const msgData = msgSnap.data();

      if (msgData.unlockedBy?.includes(userId)) {
        return {
          success: true,
          unlocked: true,
          mediaUrl: msgData.mediaUrl,
          alreadyUnlocked: true,
        };
      }

      const price = Number(msgData.unlockPrice || msgData.price || 0);

      // Determine creator UID
      let creatorId = msgData.senderId;
      if (!creatorId || creatorId === userId) {
        try {
          const convSnap = await getDoc(doc(db, 'conversations', conversationId));
          if (convSnap.exists()) {
            const convData = convSnap.data();
            creatorId = convData.creatorId || convData.participants?.find(p => p !== userId) || creatorId;
          }
        } catch (_) {}
      }

      // Process payment & balance transfers if price > 0
      if (price > 0) {
        // 1. Deduct from fan's wallet balance
        await deductFromWallet(
          userId,
          price,
          `Unlocked PPV message`,
          { contentType: 'ppv', messageId, conversationId, creatorId }
        );

        // 2. Also keep wallets collection in sync if fan has wallet doc
        try {
          const fanWalletRef = doc(db, 'wallets', userId);
          const fanWalletSnap = await getDoc(fanWalletRef);
          if (fanWalletSnap.exists()) {
            await updateDoc(fanWalletRef, {
              balanceMinor: increment(-Math.round(price * 100)),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (_) {}

        if (creatorId && creatorId !== userId) {
          // 3. Dynamic split: ambassador=90%, referred creator=80+5amb+15plat, normal=80/20
          const { creatorEarning, platformFee, ambassadorCommission, ambassadorId } =
            await getCreatorSplit(creatorId, price);

          // 4. Credit creator_balances (availableBalance, totalEarnings, monthlyEarnings)
          const creatorBalRef = doc(db, 'creator_balances', creatorId);
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
              creatorId,
              availableBalance: creatorEarning,
              totalEarnings: creatorEarning,
              monthlyEarnings: { [month]: creatorEarning },
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }

          // 5. Credit wallets collection (synchronized with cumulative creator balance)
          try {
            const creatorWalletRef = doc(db, 'wallets', creatorId);
            const wSnap = await getDoc(creatorWalletRef);
            const cSnap = await getDoc(creatorBalRef);
            const trueTotalAvail = cSnap.exists()
              ? (Number(cSnap.data().availableBalance || 0) + Number(cSnap.data().pendingBalance || 0))
              : creatorEarning;

            if (wSnap.exists() && wSnap.data().balanceMinor !== undefined) {
              const currentW = wSnap.data().balanceMinor / 100;
              const targetMinor = Math.round(Math.max(currentW + creatorEarning, trueTotalAvail) * 100);
              await updateDoc(creatorWalletRef, {
                balanceMinor: targetMinor,
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(creatorWalletRef, {
                balanceMinor: Math.round(trueTotalAvail * 100),
                updatedAt: serverTimestamp(),
              }, { merge: true });
            }
          } catch (wErr) {
            logger.warn('Non-fatal error syncing creator wallet:', wErr);
          }

          // 6. Keep user_balances synced if creator has user_balances doc
          try {
            const cUserBalRef = doc(db, 'user_balances', creatorId);
            const cUserSnap = await getDoc(cUserBalRef);
            if (cUserSnap.exists()) {
              await updateDoc(cUserBalRef, {
                balance: increment(creatorEarning),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (_) {}

          // 7. Credit ambassador commission if creator was referred
          if (ambassadorId && ambassadorCommission > 0) {
            await creditAmbassadorCommission(ambassadorId, ambassadorCommission, creatorId, 'ppv');
          }

          // 8. Log in ppv_unlocks
          try {
            await addDoc(collection(db, 'ppv_unlocks'), {
              userId,
              fanId: userId,
              creatorId,
              conversationId,
              messageId,
              amount: price,
              creatorEarning,
              platformFee,
              ambassadorCommission: ambassadorCommission || 0,
              ambassadorId: ambassadorId || null,
              createdAt: serverTimestamp(),
            });
          } catch (_) {}

          // 9. Record in unlocked_content
          try {
            await setDoc(doc(db, 'unlocked_content', `${userId}_${messageId}`), {
              userId,
              creatorId,
              contentType: 'message',
              contentId: messageId,
              conversationId,
              price,
              unlockedAt: serverTimestamp(),
            }, { merge: true });
          } catch (_) {}
        }
      }

      // Add user to message unlockedBy
      await updateDoc(msgRef, {
        unlockedBy: arrayUnion(userId),
        unlockedAt: serverTimestamp(),
      });

      return {
        success: true,
        unlocked: true,
        mediaUrl: msgData.mediaUrl,
        alreadyUnlocked: false,
      };
    } catch (fallbackErr) {
      logger.error('Fallback unlock error:', fallbackErr);
      throw fallbackErr;
    }
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