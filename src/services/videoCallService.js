// src/services/videoCallService.js

import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCreatorCallStatus, refund as refundPayment, releaseCallEarning } from './payService';
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

// ✅ Minimum booking lead time in minutes (creator can cancel if they weren't ready)
export const MIN_BOOKING_LEAD_MINS = 2;

// A booking nobody completed/cancelled stops blocking the creator this long after its slot ends
// (so a no-show can't lock a creator out of bookings forever).
const STALE_BOOKING_GRACE_MINS = 30;

/**
 * One booking at a time: returns the creator's open booking (confirmed / in progress) or null.
 * Creators can't be booked again until that call is completed, cancelled or refunded.
 */
export const getCreatorActiveBooking = async (creatorId) => {
  // Asked from the server: fans can't read other people's bookings (they hold notes and prices)
  const r = await getCreatorCallStatus(creatorId);
  return r?.busy ? { status: r.status, scheduledAtDate: new Date(r.scheduledAt) } : null;
};

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
      livestreamFree: data.livestreamFree !== false, // creator chooses: free live or paid 1-hour ticket
      callsEnabled: data.callsEnabled !== false,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(availRef, update, { merge: true });

    // Sync to user profile document so other views see the price and status
    const userRef = doc(db, 'users', creatorId);
    await updateDoc(userRef, {
      livestreamPrice: livePrice,
      livestreamFree: update.livestreamFree,
      videoCallPrice: videoPrice,
      voiceCallPrice: voicePrice,
      callsEnabled: update.callsEnabled,
      isAvailableForCalls: update.status === 'available' && update.callsEnabled,
    }).catch(e => logger.warn('Non-critical: could not sync call availability to users profile collection', e));

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
      // ✅ One shared start time → both sides and any rejoin see the same remaining time
      ...(booking.callStartedAt ? {} : { callStartedAt: serverTimestamp() }),
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
    // Once the booked time is over (+10 min), one person ending is enough to close the call —
    // otherwise a call the other side never ends stays "in progress" forever.
    const start = updated.scheduledAt?.toDate?.() || new Date(updated.scheduledAt);
    const slotOver = Date.now() > start.getTime() + ((updated.duration || CALL_DURATION) + 10) * 60 * 1000;
    const bothEnded = (updated.userEnded === true && updated.creatorEnded === true) || slotOver;

    if (bothEnded) {
      await updateDoc(bookingRef, {
        status: 'completed',
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Older bookings paid the creator on completion — the server releases that (once)
      if (booking.creatorPaid === false && booking.creatorEarning) {
        await releaseCallEarning(bookingId).catch((e) => logger.error('Release earning failed', e));
      }
      logger.info('Call fully completed (both ended):', bookingId);
    }

    return { bothEnded };
  } catch (error) {
    logger.error('Error ending call:', error);
    throw error;
  }
};

/**
 * Refund a booking that was never started (no-show) — done by the server: fan refunded in full,
 * creator's (and any ambassador's) share taken back. Safe to call twice.
 */
export const refundBooking = async (bookingId) => {
  try {
    return await refundPayment('call', { bookingId });
  } catch (error) {
    if (/status: (refunded|completed|cancelled|rejected)/.test(error.message || '')) return null; // already done
    logger.error('Error processing refund:', error);
    throw error;
  }
};

/**
 * Creator rejects a booking, or the fan cancels it (before it starts). Fan always gets a full
 * refund; the other side is notified. All done on the server.
 */
export const cancelBooking = async (bookingId, _byUserId, reason = '') =>
  refundPayment('call', { bookingId, reason: reason || null });

export default {
  getCreatorAvailability, updateCreatorAvailability,
  startVideoCall, endVideoCall, refundBooking, getCallDurationSeconds,
  MINIMUM_VIDEO_PRICE, MINIMUM_VOICE_PRICE, CALL_DURATION,
  CALL_DURATIONS, MIN_BOOKING_LEAD_MINS, END_CALL_REASONS,
};