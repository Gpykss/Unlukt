// src/services/subscriptionService.js

import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs,
  serverTimestamp, Timestamp, increment
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { deductFromWallet } from './walletService';
import { getCreatorSplit, creditAmbassadorCommission } from './commissionService';

export const DURATIONS = {
  daily:   { label: 'Daily',   days: 1,  badge: '24hrs'   },
  weekly:  { label: 'Weekly',  days: 7,  badge: '7 days'  },
  monthly: { label: 'Monthly', days: 30, badge: '30 days' },
};

/**
 * Get the price for a specific duration.
 * Supports creator-set direct discounted prices (priceMonthly/Weekly/Daily).
 * Falls back to percent-based discount, then base price.
 */
export const getPriceForDuration = (monthlyPrice, duration, discount = null, creatorPrices = null) => {
  // Base price from creator settings
  let base;
  if (creatorPrices) {
    if (duration === 'daily'  && creatorPrices.daily  != null) base = Number(creatorPrices.daily);
    else if (duration === 'weekly' && creatorPrices.weekly != null) base = Number(creatorPrices.weekly);
    else base = Number(creatorPrices.monthly ?? monthlyPrice);
  } else {
    const multipliers = { daily: 0.1, weekly: 0.35, monthly: 1 };
    base = Number(monthlyPrice) * (multipliers[duration] ?? 1);
  }

  if (discount && discount.active) {
    const now = Date.now();
    const expiry = discount.expiresAt ? new Date(discount.expiresAt).getTime() : Infinity;
    if (now < expiry) {
      // Bundle: price per month from bundle total
      if (discount.type === 'bundle' && discount.bundlePrice && discount.bundleMonths && duration === 'monthly') {
        return Math.max(0.5, parseFloat((Number(discount.bundlePrice) / Number(discount.bundleMonths)).toFixed(2)));
      }
      // Direct creator-set discounted price per duration
      const directPrice =
        duration === 'monthly' ? discount.priceMonthly :
        duration === 'weekly'  ? discount.priceWeekly  :
        duration === 'daily'   ? discount.priceDaily   : null;
      if (directPrice != null && Number(directPrice) > 0) {
        return Math.max(0.5, parseFloat(Number(directPrice).toFixed(2)));
      }
      // Legacy: percent-based fallback
      if (discount.percent) {
        return Math.max(0.5, parseFloat((base * (1 - discount.percent / 100)).toFixed(2)));
      }
    }
  }
  return Math.max(0.5, parseFloat(base.toFixed(2)));
};

export const getExpiryDate = (duration) => {
  const days = DURATIONS[duration]?.days ?? 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

export const subscribeToCreator = async (userId, creatorId, duration = 'monthly', monthlyPrice = 9.99, discount = null, creatorPrices = null) => {
  if (!userId) throw new Error('Not logged in');
  if (!creatorId) throw new Error('Invalid creator');
  if (userId === creatorId) throw new Error('You cannot subscribe to yourself');

  const price = getPriceForDuration(monthlyPrice, duration, discount, creatorPrices);
  const expiresAt = getExpiryDate(duration);
  const durationLabel = DURATIONS[duration]?.label ?? 'Monthly';

  const creatorDoc = await getDoc(doc(db, 'users', creatorId));
  const creatorName = creatorDoc.exists() ? creatorDoc.data().displayName || 'Creator' : 'Creator';

  // 1. Deduct from wallet
  await deductFromWallet(userId, price, `${durationLabel} subscription to ${creatorName}`, {
    contentType: 'subscription',
    creatorId,
    duration,
  });

  // 2. ✅ Dynamic split: ambassador=90%, referred creator=80+5amb+15plat, normal=80/20
  const { creatorEarning, platformFee, ambassadorCommission, ambassadorId } =
    await getCreatorSplit(creatorId, price);

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
    });
  }

  // ✅ Credit ambassador 5% commission if referred creator
  await creditAmbassadorCommission(ambassadorId, ambassadorCommission, creatorId, 'subscription');

  // 3. Create or extend subscription
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
    platformFee,
    ambassadorCommission: ambassadorCommission || 0,
    ambassadorId: ambassadorId || null,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: serverTimestamp(),
  };

  if (subDoc.exists()) {
    const existing = subDoc.data();
    const currentExpiry = existing.expiresAt?.toDate?.() || new Date();
    const base = currentExpiry > new Date() ? currentExpiry : new Date();
    const days = DURATIONS[duration]?.days ?? 30;
    const newExpiry = new Date(base);
    newExpiry.setDate(newExpiry.getDate() + days);
    await updateDoc(subRef, { ...subData, expiresAt: Timestamp.fromDate(newExpiry) });
  } else {
    await setDoc(subRef, { ...subData, createdAt: serverTimestamp() });
    try {
      const creatorUserRef = doc(db, 'users', creatorId);
      await updateDoc(creatorUserRef, {
        subscribersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to update subscribersCount:', e);
    }
  }

  // 4. Log transaction
  await addDoc(collection(db, 'subscription_transactions'), {
    userId,
    creatorId,
    duration,
    durationLabel,
    amount: price,
    creatorEarning,
    platformFee,
    ambassadorCommission: ambassadorCommission || 0,
    ambassadorId: ambassadorId || null,
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: serverTimestamp(),
  });

  return { success: true, price, expiresAt, duration };
};

export const hasActiveSubscription = async (userId, creatorId) => {
  if (!userId || !creatorId) return false;
  try {
    const subDoc = await getDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`));
    if (!subDoc.exists()) return false;
    const data = subDoc.data();
    if (data.status !== 'active') return false;
    const expiry = data.expiresAt?.toDate?.();
    if (!expiry) return true;
    return expiry > new Date();
  } catch { return false; }
};

export const getSubscription = async (userId, creatorId) => {
  if (!userId || !creatorId) return null;
  try {
    const subDoc = await getDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`));
    if (!subDoc.exists()) return null;
    return { id: subDoc.id, ...subDoc.data() };
  } catch { return null; }
};

export const getCreatorSubscribers = async (creatorId) => {
  try {
    const q = query(collection(db, 'subscriptions'), where('creatorId', '==', creatorId), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const now = new Date();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => {
      const expiry = s.expiresAt?.toDate?.();
      return !expiry || expiry > now;
    });
  } catch { return []; }
};

export const getUserSubscriptions = async (userId) => {
  try {
    const q = query(collection(db, 'subscriptions'), where('userId', '==', userId), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const now = new Date();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => {
      const expiry = s.expiresAt?.toDate?.();
      return !expiry || expiry > now;
    });
  } catch { return []; }
};

export const cancelSubscription = async (userId, creatorId) => {
  try {
    await updateDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // ✅ Decrement subscribersCount on cancel
    try {
      const creatorUserRef = doc(db, 'users', creatorId);
      await updateDoc(creatorUserRef, {
        subscribersCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to decrement subscribersCount:', e);
    }
    return true;
  } catch (e) { throw new Error('Failed to cancel subscription: ' + e.message); }
};

export const getCreatorDiscount = async (creatorId) => {
  try {
    const discDoc = await getDoc(doc(db, 'creator_discounts', creatorId));
    if (!discDoc.exists()) return null;
    return discDoc.data();
  } catch { return null; }
};