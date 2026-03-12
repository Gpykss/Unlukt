// src/services/subscriptionService.js

import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { deductFromWallet } from './walletService';

// ── Duration config ──────────────────────────────────────────────
export const DURATIONS = {
  daily: {
    label: 'Daily',
    days: 1,
    multiplier: 0.1,   // 10% of monthly price
    badge: '24hrs',
  },
  weekly: {
    label: 'Weekly',
    days: 7,
    multiplier: 0.35,  // 35% of monthly price
    badge: '7 days',
  },
  monthly: {
    label: 'Monthly',
    days: 30,
    multiplier: 1,     // full monthly price
    badge: '30 days',
  },
};

/**
 * Calculate price for a given duration based on creator's monthly price.
 * Respects any active discount the creator has set.
 */
export const getPriceForDuration = (monthlyPrice, duration, discount = null) => {
  const base = Number(monthlyPrice || 9.99);
  const mult = DURATIONS[duration]?.multiplier ?? 1;
  let price = base * mult;

  // Apply creator discount if valid
  if (discount && discount.active) {
    const now = Date.now();
    const expiry = discount.expiresAt ? new Date(discount.expiresAt).getTime() : Infinity;
    if (now < expiry) {
      price = price * (1 - (discount.percent || 0) / 100);
    }
  }

  return Math.max(0.5, parseFloat(price.toFixed(2)));
};

/**
 * Get expiry date for a given duration starting from now.
 */
export const getExpiryDate = (duration) => {
  const days = DURATIONS[duration]?.days ?? 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

/**
 * Subscribe a fan to a creator.
 * Deducts from wallet and creates/updates subscription doc.
 */
export const subscribeToCreator = async (
  userId,
  creatorId,
  duration = 'monthly',
  monthlyPrice = 9.99,
  discount = null
) => {
  if (!userId) throw new Error('Not logged in');
  if (!creatorId) throw new Error('Invalid creator');
  if (userId === creatorId) throw new Error('You cannot subscribe to yourself');

  const price = getPriceForDuration(monthlyPrice, duration, discount);
  const expiresAt = getExpiryDate(duration);
  const durationLabel = DURATIONS[duration]?.label ?? 'Monthly';

  // Get creator info for display
  const creatorDoc = await getDoc(doc(db, 'users', creatorId));
  const creatorName = creatorDoc.exists()
    ? creatorDoc.data().displayName || 'Creator'
    : 'Creator';

  // Deduct from fan wallet (80% to creator, 20% platform)
  await deductFromWallet(
    userId,
    price,
    `${durationLabel} subscription to ${creatorName}`,
    {
      contentType: 'subscription',
      creatorId,
      duration,
    }
  );

  // Credit 80% to creator
  const creatorEarning = parseFloat((price * 0.8).toFixed(2));
  const creatorBalRef = doc(db, 'creator_balances', creatorId);
  const creatorBalDoc = await getDoc(creatorBalRef);

  if (creatorBalDoc.exists()) {
    await updateDoc(creatorBalRef, {
      pendingBalance: (creatorBalDoc.data().pendingBalance || 0) + creatorEarning,
      totalEarnings: (creatorBalDoc.data().totalEarnings || 0) + creatorEarning,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(creatorBalRef, {
      creatorId,
      availableBalance: 0,
      pendingBalance: creatorEarning,
      totalEarnings: creatorEarning,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Create or update subscription record
  const subId = `${userId}_${creatorId}`;
  const subRef = doc(db, 'subscriptions', subId);
  const subDoc = await getDoc(subRef);

  const subData = {
    userId,
    creatorId,
    status: 'active',
    duration,
    durationLabel,
    amount: price,
    monthlyPrice: Number(monthlyPrice),
    creatorEarning,
    platformFee: parseFloat((price * 0.2).toFixed(2)),
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: serverTimestamp(),
  };

  if (subDoc.exists()) {
    // Extend existing subscription
    const existing = subDoc.data();
    const currentExpiry = existing.expiresAt?.toDate?.() || new Date();
    // If still active, extend from current expiry; else start fresh
    const base = currentExpiry > new Date() ? currentExpiry : new Date();
    const days = DURATIONS[duration]?.days ?? 30;
    const newExpiry = new Date(base);
    newExpiry.setDate(newExpiry.getDate() + days);

    await updateDoc(subRef, {
      ...subData,
      expiresAt: Timestamp.fromDate(newExpiry),
    });
  } else {
    await setDoc(subRef, {
      ...subData,
      createdAt: serverTimestamp(),
    });
  }

  // Log transaction
  await addDoc(collection(db, 'subscription_transactions'), {
    userId,
    creatorId,
    duration,
    durationLabel,
    amount: price,
    creatorEarning,
    platformFee: parseFloat((price * 0.2).toFixed(2)),
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: serverTimestamp(),
  });

  return { success: true, price, expiresAt, duration };
};

/**
 * Check if a user has an active subscription to a creator.
 */
export const hasActiveSubscription = async (userId, creatorId) => {
  if (!userId || !creatorId) return false;
  try {
    const subRef = doc(db, 'subscriptions', `${userId}_${creatorId}`);
    const subDoc = await getDoc(subRef);
    if (!subDoc.exists()) return false;

    const data = subDoc.data();
    if (data.status !== 'active') return false;

    const expiry = data.expiresAt?.toDate?.();
    if (!expiry) return true; // no expiry = lifetime
    return expiry > new Date();
  } catch {
    return false;
  }
};

/**
 * Get a user's subscription details for a specific creator.
 */
export const getSubscription = async (userId, creatorId) => {
  if (!userId || !creatorId) return null;
  try {
    const subDoc = await getDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`));
    if (!subDoc.exists()) return null;
    return { id: subDoc.id, ...subDoc.data() };
  } catch {
    return null;
  }
};

/**
 * Get all active subscribers for a creator.
 */
export const getCreatorSubscribers = async (creatorId) => {
  try {
    const q = query(
      collection(db, 'subscriptions'),
      where('creatorId', '==', creatorId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const now = new Date();

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => {
        const expiry = s.expiresAt?.toDate?.();
        return !expiry || expiry > now;
      });
  } catch {
    return [];
  }
};

/**
 * Get all subscriptions for a user (what they've subscribed to).
 */
export const getUserSubscriptions = async (userId) => {
  try {
    const q = query(
      collection(db, 'subscriptions'),
      where('userId', '==', userId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const now = new Date();

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => {
        const expiry = s.expiresAt?.toDate?.();
        return !expiry || expiry > now;
      });
  } catch {
    return [];
  }
};

/**
 * Cancel a subscription (sets status to cancelled).
 */
export const cancelSubscription = async (userId, creatorId) => {
  try {
    const subRef = doc(db, 'subscriptions', `${userId}_${creatorId}`);
    await updateDoc(subRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    throw new Error('Failed to cancel subscription: ' + e.message);
  }
};

/**
 * Get creator's discount settings.
 */
export const getCreatorDiscount = async (creatorId) => {
  try {
    const discDoc = await getDoc(doc(db, 'creator_discounts', creatorId));
    if (!discDoc.exists()) return null;
    return discDoc.data();
  } catch {
    return null;
  }
};