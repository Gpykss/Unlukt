// src/services/videoCallService.js

import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc,
  serverTimestamp, increment
} from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';

export const MINIMUM_VIDEO_PRICE = 5;
export const MINIMUM_VOICE_PRICE = 3;
export const CALL_DURATION = 30;

export const getCreatorAvailability = async (creatorId) => {
  try {
    const availRef = doc(db, 'creator_availability', creatorId);
    const availDoc = await getDoc(availRef);
    if (availDoc.exists()) return availDoc.data();
    return {
      status: 'offline',
      videoCallPrice: MINIMUM_VIDEO_PRICE,
      voiceCallPrice: MINIMUM_VOICE_PRICE,
      callsEnabled: false,
      lastUpdated: new Date(),
    };
  } catch (error) {
    logger.error('Error fetching availability:', error);
    throw error;
  }
};

export const updateCreatorAvailability = async (creatorId, data) => {
  try {
    const availRef = doc(db, 'creator_availability', creatorId);
    const videoPrice = Math.max(MINIMUM_VIDEO_PRICE, Number(data.videoCallPrice) || MINIMUM_VIDEO_PRICE);
    const voicePrice = Math.max(MINIMUM_VOICE_PRICE, Number(data.voiceCallPrice) || MINIMUM_VOICE_PRICE);
    const update = {
      status: data.status || 'offline',
      videoCallPrice: videoPrice,
      voiceCallPrice: voicePrice,
      callsEnabled: data.callsEnabled !== false,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(availRef, update, { merge: true });
    return update;
  } catch (error) {
    logger.error('Error updating availability:', error);
    throw error;
  }
};

export const startVideoCall = async (bookingId, userId) => {
  try {
    const bookingRef = doc(db, 'call_bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);

    if (!bookingDoc.exists()) throw new Error('Booking not found');

    const booking = bookingDoc.data();
    const isCreator = booking.creatorId === userId;
    const isUser = booking.userId === userId;

    if (!isCreator && !isUser) throw new Error('You are not part of this call');

    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      throw new Error(`Cannot join call with status: ${booking.status}`);
    }

    await updateDoc(bookingRef, {
      status: 'in_progress',
      ...(isCreator
        ? { creatorEnteredCallAt: serverTimestamp() }
        : { userEnteredCallAt: serverTimestamp() }
      ),
      updatedAt: serverTimestamp(),
    });

    logger.info(`Call joined: bookingId=${bookingId}, userId=${userId}, role=${isCreator ? 'creator' : 'user'}`);
  } catch (error) {
    logger.error('Error starting call:', error);
    throw error;
  }
};

export const getCallDurationSeconds = async (bookingId) => {
  try {
    const bookingDoc = await getDoc(doc(db, 'call_bookings', bookingId));
    if (!bookingDoc.exists()) return CALL_DURATION * 60;
    const duration = bookingDoc.data().duration || CALL_DURATION;
    return duration * 60;
  } catch (e) {
    return CALL_DURATION * 60;
  }
};

export const endVideoCall = async (bookingId) => {
  try {
    const bookingRef = doc(db, 'call_bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);

    if (!bookingDoc.exists()) throw new Error('Booking not found');

    const booking = bookingDoc.data();

    await updateDoc(bookingRef, {
      status: 'completed',
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ✅ Release creator's pending → available using increment(), no getDoc needed
    if (!booking.creatorPaid && booking.creatorEarning) {
      const creatorBalRef = doc(db, 'creator_balances', booking.creatorId);
      try {
        await updateDoc(creatorBalRef, {
          pendingBalance: increment(-booking.creatorEarning),
          availableBalance: increment(booking.creatorEarning),
          updatedAt: serverTimestamp(),
        });
      } catch {
        await setDoc(creatorBalRef, {
          creatorId: booking.creatorId,
          availableBalance: booking.creatorEarning,
          pendingBalance: 0,
          totalEarnings: booking.creatorEarning,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await updateDoc(bookingRef, { creatorPaid: true });
    }

    logger.info('Call ended:', bookingId);
  } catch (error) {
    logger.error('Error ending call:', error);
    throw error;
  }
};

export const refundBooking = async (bookingId, bookingData) => {
  try {
    const bookingRef = doc(db, 'call_bookings', bookingId);

    const snap = await getDoc(bookingRef);
    if (!snap.exists()) throw new Error('Booking not found');
    const latest = snap.data();
    if (latest.status === 'refunded' || latest.status === 'completed') {
      logger.info('Refund skipped — already refunded or completed');
      return;
    }

    const price = latest.price || bookingData?.price || 0;
    const userId = latest.userId || bookingData?.userId;
    const creatorId = latest.creatorId || bookingData?.creatorId;
    const creatorEarning = latest.creatorEarning || bookingData?.creatorEarning || 0;

    // 1. ✅ Return funds to user wallet using increment(), no getDoc needed
    const userBalRef = doc(db, 'user_balances', userId);
    try {
      await updateDoc(userBalRef, {
        balance: increment(price),
        updatedAt: serverTimestamp(),
      });
    } catch {
      await setDoc(userBalRef, {
        userId,
        balance: price,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 2. Refund transaction record
    await addDoc(collection(db, 'transactions'), {
      userId,
      amount: price,
      type: 'refund',
      description: 'Call not initiated — automatic refund',
      bookingId,
      createdAt: serverTimestamp(),
    });

    // 3. ✅ Reverse creator's pending balance using increment(), no getDoc needed
    if (creatorEarning > 0) {
      const creatorBalRef = doc(db, 'creator_balances', creatorId);
      try {
        await updateDoc(creatorBalRef, {
          pendingBalance: increment(-creatorEarning),
          totalEarnings: increment(-creatorEarning),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Doc doesn't exist, nothing to reverse
        logger.info('Creator balance doc not found, skipping reversal');
      }
    }

    // 4. Notify user
    await addDoc(collection(db, 'notifications'), {
      userId,
      type: 'refund',
      message: `Your $${price.toFixed(2)} booking was refunded — the call was not initiated within 1 hour.`,
      bookingId,
      read: false,
      createdAt: serverTimestamp(),
    });

    // 5. Mark booking as refunded
    await updateDoc(bookingRef, {
      status: 'refunded',
      refundedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    logger.info(`Booking ${bookingId} refunded $${price} to user ${userId}`);
  } catch (error) {
    logger.error('Error processing refund:', error);
    throw error;
  }
};

export default {
  getCreatorAvailability,
  updateCreatorAvailability,
  startVideoCall,
  endVideoCall,
  refundBooking,
  getCallDurationSeconds,
  MINIMUM_VIDEO_PRICE,
  MINIMUM_VOICE_PRICE,
  CALL_DURATION,
};