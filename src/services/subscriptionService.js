// src/services/subscriptionService.js

import {
  doc, getDoc, updateDoc,
  collection, query, where, getDocs,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { pay } from './payService';
import { sendCreatorAutoMessage } from './messageService';

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

export const subscribeToCreator = async (
  userId,
  creatorId,
  duration = 'monthly',
  monthlyPrice = 9.99,
  discount = null,
  creatorPrices = null,
  selectedTier = 'supporter',
  customPrice = null
) => {
  if (!userId) throw new Error('Not logged in');
  if (!creatorId) throw new Error('Invalid creator');
  if (userId === creatorId) throw new Error('You cannot subscribe to yourself');

  const shownPrice = customPrice != null && Number(customPrice) > 0
    ? Number(customPrice)
    : getPriceForDuration(monthlyPrice, duration, discount, creatorPrices);
  const tier = selectedTier || 'supporter';

  // Server sets the real price from the creator's settings, charges the wallet, splits the money,
  // and creates/extends the subscription — all at once. If the price changed it refuses.
  const res = await pay('subscription', { creatorId, tier, duration, expectedPrice: shownPrice });
  const price = res.price;
  const expiresAt = new Date(res.expiresAt);

  // Automated welcome message from the creator (best effort)
  try {
    await sendCreatorAutoMessage(creatorId, userId, 'subscription');
  } catch (autoMsgErr) {
    console.warn('⚠️ Automated subscriber welcome message error:', autoMsgErr);
  }

  return { success: true, price, expiresAt, duration };
};

export const hasActiveSubscription = async (userId, creatorId) => {
  if (!userId || !creatorId) return false;
  try {
    const subDoc = await getDoc(doc(db, 'subscriptions', `${userId}_${creatorId}`));
    if (!subDoc.exists()) return false;
    const data = subDoc.data();
    // Cancelled = won't renew, but it's paid until expiresAt
    if (!['active', 'cancelled'].includes(data.status)) return false;
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
    // subscribersCount is kept by the server (onSubscriptionChange) so it can't be faked or double-counted
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