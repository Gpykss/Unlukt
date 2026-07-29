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

// ✅ 4 duration options
export const CALL_DURATIONS = [
  { mins: 15, label: '15 min' },
  { mins: 30, label: '30 min' },
  { mins: 60, label: '1 hour' },
  { mins: 90, label: '1.5 hours' },
];

// ✅ Minimum booking lead time in minutes
export const MIN_BOOKING_LEAD_MINS = 5;

export const END_CALL_REASONS = {
  ENDED: 'ended',           // call is done
  TECHNICAL: 'technical',  // will rejoin
  REPORT: 'report',        // misconduct
};

export const getCreatorAvailability = async (creatorId) => {
  try {
    const availRef = doc(db, 'creator_availability', creatorId);
    const availDoc = await getDoc(availRef);
    if (availDoc.exists()) {
      const data = availDoc.data();
      return {
        livestreamPrice: 10,
        ...data
      };
    }
    return {
      status: 'offline',
      videoCallPrice: MINIMUM_VIDEO_PRICE,
      voiceCallPrice: MINIMUM_VOICE_PRICE,
      livestreamPrice: 10,
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
    const livePrice = Math.max(1, Number(data.livestreamPrice) || 10);
    const update = {
      status: data.status || 'offline',
      videoCallPrice: videoPrice,
      voiceCallPrice: voicePrice,
      livestreamPrice: livePrice,
      callsEnabled: data.callsEnabled !== false,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(availRef, update, { merge: true });

    // Sync to user profile document so other views see the price
    const userRef = doc(db, 'users', creatorId);
    await updateDoc(userRef, {
      livestreamPrice: livePrice
    }).catch(e => logger.warn('Non-critical: could not sync livestreamPrice to users profile collection', e));

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

// ✅ endVideoCall now takes userId + reason
// - 'ended'    → marks this user as done; completes only when both ended
// - 'technical'→ just leaves Agora, call stays open, no Firestore end flag
// - 'report'   → marks ended + files report
export const endVideoCall = async (bookingId, userId, reason = END_CALL_REASONS.ENDED) => {
  try {
    const bookingRef = doc(db, 'call_bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    if (!bookingDoc.exists()) throw new Error('Booking not found');
    const booking = bookingDoc.data();

    if (booking.status === 'completed' || booking.status === 'refunded') {
      return { bothEnded: true };
    }

    const isCreator = booking.creatorId === userId;

    // ✅ Technical issue — just leave, don't mark as ended
    if (reason === END_CALL_REASONS.TECHNICAL) {
      await updateDoc(bookingRef, {
        [`techIssue.${isCreator ? 'creator' : 'user'}`]: true,
        [`techIssue.${isCreator ? 'creator' : 'user'}At`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { bothEnded: false, technical: true };
    }

    // ✅ Report — mark ended + save report
    if (reason === END_CALL_REASONS.REPORT) {
      await addDoc(collection(db, 'call_reports'), {
        bookingId,
        reportedBy: userId,
        reportedUserId: isCreator ? booking.userId : booking.creatorId,
        createdAt: serverTimestamp(),
      });
    }

    // ✅ Mark this person as ended
    const endedField = isCreator ? 'creatorEnded' : 'userEnded';
    await updateDoc(bookingRef, {
      [endedField]: true,
      [`${endedField}At`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Re-read to check if both ended
    const updated = (await getDoc(bookingRef)).data();
    const bothEnded = updated.userEnded === true && updated.creatorEnded === true;

    if (bothEnded) {
      await updateDoc(bookingRef, {
        status: 'completed',
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Release creator earnings
      if (!booking.creatorPaid && booking.creatorEarning) {
        const creatorBalRef = doc(db, 'creator_balances', booking.creatorId);
        const month = new Date().toLocaleString('default', { month: 'short' });
        try {
          await updateDoc(creatorBalRef, {
            availableBalance: increment(booking.creatorEarning),
            [`monthlyEarnings.${month}`]: increment(booking.creatorEarning),
            updatedAt: serverTimestamp(),
          });
        } catch {
          await setDoc(creatorBalRef, {
            creatorId: booking.creatorId,
            availableBalance: booking.creatorEarning,
            totalEarnings: booking.creatorEarning,
            monthlyEarnings: { [month]: booking.creatorEarning },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await updateDoc(bookingRef, { creatorPaid: true });
      }
      logger.info('Call fully completed (both ended):', bookingId);
    }

    return { bothEnded };
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
    if (latest.status === 'refunded' || latest.status === 'completed') return;

    const price = latest.price || bookingData?.price || 0;
    const userId = latest.userId || bookingData?.userId;
    const creatorId = latest.creatorId || bookingData?.creatorId;
    const creatorEarning = latest.creatorEarning || bookingData?.creatorEarning || 0;

    const userBalRef = doc(db, 'user_balances', userId);
    try {
      await updateDoc(userBalRef, { balance: increment(price), updatedAt: serverTimestamp() });
    } catch {
      await setDoc(userBalRef, { userId, balance: price, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }

    await addDoc(collection(db, 'transactions'), {
      userId, amount: price, type: 'refund',
      description: 'Call not initiated — automatic refund',
      bookingId, createdAt: serverTimestamp(),
    });

    if (creatorEarning > 0) {
      const creatorBalRef = doc(db, 'creator_balances', creatorId);
      try {
        await updateDoc(creatorBalRef, {
          availableBalance: increment(-creatorEarning),
          totalEarnings: increment(-creatorEarning),
          updatedAt: serverTimestamp(),
        });
      } catch { /* doc doesn't exist */ }
    }

    await addDoc(collection(db, 'notifications'), {
      userId, type: 'refund',
      message: `Your $${price.toFixed(2)} booking was refunded — the call was not initiated in time.`,
      bookingId, read: false, createdAt: serverTimestamp(),
    });

    await updateDoc(bookingRef, {
      status: 'refunded', refundedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    throw error;
  }
};

export default {
  getCreatorAvailability, updateCreatorAvailability,
  startVideoCall, endVideoCall, refundBooking, getCallDurationSeconds,
  MINIMUM_VIDEO_PRICE, MINIMUM_VOICE_PRICE, CALL_DURATION,
  CALL_DURATIONS, MIN_BOOKING_LEAD_MINS, END_CALL_REASONS,
};