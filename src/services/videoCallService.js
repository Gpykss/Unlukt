// src/services/videoCallService.js - Video Call Booking & Management

import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import { getUserTier, getCallDiscount } from './tierService';
import cryptoService from './crypto.service';

const MINIMUM_VIDEO_PRICE = 10; // $10 USD
const CALL_DURATION = 30; // 30 minutes

/**
 * Get creator's video call availability and pricing
 */
export const getCreatorAvailability = async (creatorId) => {
  try {
    const availRef = doc(db, 'creator_availability', creatorId);
    const availDoc = await getDoc(availRef);
    
    if (availDoc.exists()) {
      return availDoc.data();
    }
    
    // Default availability
    return {
      status: 'offline',
      videoCallPrice: MINIMUM_VIDEO_PRICE,
      voiceCallPrice: 5,
      callsEnabled: false,
      lastUpdated: new Date()
    };
  } catch (error) {
    logger.error('Error fetching availability:', error);
    throw error;
  }
};

/**
 * Update creator availability
 */
export const updateCreatorAvailability = async (creatorId, data) => {
  try {
    const availRef = doc(db, 'creator_availability', creatorId);
    
    // Validate pricing
    const videoPrice = Math.max(MINIMUM_VIDEO_PRICE, Number(data.videoCallPrice) || MINIMUM_VIDEO_PRICE);
    const voicePrice = Math.max(5, Number(data.voiceCallPrice) || 5);
    
    const update = {
      status: data.status || 'offline',
      videoCallPrice: videoPrice,
      voiceCallPrice: voicePrice,
      callsEnabled: data.callsEnabled !== false,
      lastUpdated: serverTimestamp()
    };
    
    await setDoc(availRef, update, { merge: true });
    
    logger.success('Availability updated:', creatorId);
    return update;
  } catch (error) {
    logger.error('Error updating availability:', error);
    throw error;
  }
};

/**
 * Book a video call
 */
export const bookVideoCall = async (fanId, creatorId, scheduledTime) => {
  try {
    // Check creator availability
    const availability = await getCreatorAvailability(creatorId);
    
    if (availability.status !== 'available' || !availability.callsEnabled) {
      throw new Error('Creator is not available for calls right now');
    }
    
    // Get pricing
    let price = availability.videoCallPrice;
    
    // Apply tier discount
    const fanTier = await getUserTier(fanId, creatorId);
    if (fanTier) {
      const discount = getCallDiscount(fanTier);
      price = price * (1 - discount);
    }
    
    // Create booking
    const bookingRef = doc(collection(db, 'video_calls'));
    const booking = {
      id: bookingRef.id,
      fanId,
      creatorId,
      type: 'video',
      price,
      duration: CALL_DURATION,
      status: 'pending_payment',
      scheduledTime: scheduledTime || new Date(Date.now() + 5 * 60 * 1000), // Default: 5 mins from now
      createdAt: serverTimestamp(),
      paymentId: null,
      agoraToken: null,
      channelName: null
    };
    
    await setDoc(bookingRef, booking);
    
    logger.success('Video call booked:', bookingRef.id);
    return { bookingId: bookingRef.id, ...booking };
  } catch (error) {
    logger.error('Error booking video call:', error);
    throw error;
  }
};

/**
 * Pay for video call with crypto
 */
export const payForVideoCall = async (bookingId, fanId, fanEmail, fanName, userCountry) => {
  try {
    const bookingRef = doc(db, 'video_calls', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      throw new Error('Booking not found');
    }
    
    const booking = bookingDoc.data();
    
    if (booking.status !== 'pending_payment') {
      throw new Error('Booking is not pending payment');
    }
    
    // Initialize crypto payment
    const payment = await cryptoService.initializeUSDTPayment({
      amount: booking.price,
      userId: fanId,
      userEmail: fanEmail,
      userName: fanName,
      contentType: 'video_call',
      contentId: bookingId,
      creatorId: booking.creatorId,
      userCountry
    });
    
    // Update booking with payment ID
    await updateDoc(bookingRef, {
      paymentId: payment.paymentId,
      status: 'awaiting_payment',
      updatedAt: serverTimestamp()
    });
    
    logger.success('Payment initialized for video call:', bookingId);
    return payment;
  } catch (error) {
    logger.error('Error paying for video call:', error);
    throw error;
  }
};

/**
 * Activate video call after payment verified
 * Called by admin after verifying crypto payment
 */
export const activateVideoCall = async (bookingId) => {
  try {
    const bookingRef = doc(db, 'video_calls', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      throw new Error('Booking not found');
    }
    
    const booking = bookingDoc.data();
    
    // Generate Agora channel
    const channelName = `video_${bookingId}_${Date.now()}`;
    
    await updateDoc(bookingRef, {
      status: 'confirmed',
      channelName,
      activatedAt: serverTimestamp()
    });
    
    logger.success('Video call activated:', bookingId);
    return { channelName };
  } catch (error) {
    logger.error('Error activating video call:', error);
    throw error;
  }
};

/**
 * Mark call as started (creator joined)
 */
export const startVideoCall = async (bookingId, userId) => {
  try {
    const bookingRef = doc(db, 'video_calls', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      throw new Error('Booking not found');
    }
    
    const booking = bookingDoc.data();
    
    // Verify user is creator
    if (booking.creatorId !== userId) {
      throw new Error('Only creator can start the call');
    }
    
    await updateDoc(bookingRef, {
      status: 'in_progress',
      startedAt: serverTimestamp(),
      creatorJoined: true
    });
    
    // Update creator status to busy
    await updateCreatorAvailability(userId, { status: 'busy' });
    
    logger.success('Video call started:', bookingId);
  } catch (error) {
    logger.error('Error starting video call:', error);
    throw error;
  }
};

/**
 * End video call
 */
export const endVideoCall = async (bookingId) => {
  try {
    const bookingRef = doc(db, 'video_calls', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      throw new Error('Booking not found');
    }
    
    const booking = bookingDoc.data();
    
    await updateDoc(bookingRef, {
      status: 'completed',
      endedAt: serverTimestamp()
    });
    
    // Reset creator availability
    await updateCreatorAvailability(booking.creatorId, { status: 'available' });
    
    logger.success('Video call ended:', bookingId);
  } catch (error) {
    logger.error('Error ending video call:', error);
    throw error;
  }
};

/**
 * Check for no-show and refund
 * Called by scheduled function
 */
export const checkNoShow = async (bookingId) => {
  try {
    const bookingRef = doc(db, 'video_calls', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) return;
    
    const booking = bookingDoc.data();
    
    // If call was confirmed but creator didn't join within 5 minutes of scheduled time
    if (booking.status === 'confirmed' && !booking.creatorJoined) {
      const scheduledTime = booking.scheduledTime.toDate ? booking.scheduledTime.toDate() : new Date(booking.scheduledTime);
      const graceTime = new Date(scheduledTime.getTime() + 5 * 60 * 1000); // 5 minutes
      const now = new Date();
      
      if (now > graceTime) {
        // Mark as no-show and initiate refund
        await updateDoc(bookingRef, {
          status: 'no_show',
          refundRequested: true,
          updatedAt: serverTimestamp()
        });
        
        // Add penalty strike to creator
        const creatorRef = doc(db, 'users', booking.creatorId);
        const creatorDoc = await getDoc(creatorRef);
        
        if (creatorDoc.exists()) {
          const strikes = (creatorDoc.data().noShowStrikes || 0) + 1;
          await updateDoc(creatorRef, {
            noShowStrikes: strikes,
            updatedAt: serverTimestamp()
          });
          
          // Suspend if 3 strikes
          if (strikes >= 3) {
            await updateDoc(creatorRef, {
              callsSuspended: true,
              suspensionReason: '3 no-shows',
              updatedAt: serverTimestamp()
            });
            
            await updateCreatorAvailability(booking.creatorId, {
              callsEnabled: false,
              status: 'offline'
            });
          }
        }
        
        logger.warn('No-show detected:', bookingId);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('Error checking no-show:', error);
    return false;
  }
};

export default {
  getCreatorAvailability,
  updateCreatorAvailability,
  bookVideoCall,
  payForVideoCall,
  activateVideoCall,
  startVideoCall,
  endVideoCall,
  checkNoShow,
  MINIMUM_VIDEO_PRICE,
  CALL_DURATION
};
