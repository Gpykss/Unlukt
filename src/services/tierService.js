// src/services/tierService.js - 3-Tier Membership System

import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';

/**
 * Default tier structure
 */
export const DEFAULT_TIERS = {
  supporter: {
    name: 'Supporter',
    price: 9.99,
    duration: 'monthly', // daily | weekly | monthly
    benefits: ['Access to feed', 'View all posts'],
    level: 1
  },
  vip: {
    name: 'VIP',
    price: 19.99,
    duration: 'monthly',
    benefits: ['Everything in Supporter', 'Exclusive content', 'Priority DMs', '10% video call discount'],
    level: 2
  },
  superfan: {
    name: 'Superfan',
    price: 49.99,
    duration: 'monthly',
    benefits: ['Everything in VIP', 'AI voice notes', '20% video call discount', 'Early access', 'Custom badge'],
    level: 3
  }
};

/**
 * Get creator's tier configuration
 */
export const getCreatorTiers = async (creatorId) => {
  try {
    const tierRef = doc(db, 'creator_tiers', creatorId);
    const tierDoc = await getDoc(tierRef);
    
    if (tierDoc.exists()) {
      return tierDoc.data();
    }
    
    // Return default tiers if not configured
    return { ...DEFAULT_TIERS, enabled: false };
  } catch (error) {
    logger.error('Error fetching creator tiers:', error);
    throw error;
  }
};

/**
 * Save/Update creator's tier configuration
 */
export const saveCreatorTiers = async (creatorId, tiersData) => {
  try {
    const tierRef = doc(db, 'creator_tiers', creatorId);
    
    // Validate pricing
    const validated = validateTiers(tiersData);
    
    const data = {
      ...validated,
      creatorId,
      enabled: tiersData.enabled !== false,
      updatedAt: serverTimestamp()
    };
    
    await setDoc(tierRef, data, { merge: true });
    
    // Also sync the lowest/supporter tier price to the creator user profile for legacy compatibility
    try {
      const supporterPrice = validated.supporter?.price || 9.99;
      await updateDoc(doc(db, 'users', creatorId), {
        subscriptionPrice: supporterPrice,
        subscriptionPriceMonthly: supporterPrice,
        tiersEnabled: tiersData.enabled !== false,
        updatedAt: serverTimestamp()
      });
    } catch (userErr) {
      // Non-fatal if user update fails or user is restricted
      console.warn('Could not sync subscriptionPrice to user doc:', userErr);
    }
    
    logger.success('Creator tiers saved:', creatorId);
    return data;
  } catch (error) {
    logger.error('Error saving creator tiers:', error);
    throw error;
  }
};

/**
 * Validate tier data
 */
function validateTiers(tiers) {
  const validated = {};
  
  // Validate supporter
  if (tiers.supporter) {
    validated.supporter = {
      ...tiers.supporter,
      price: Math.max(0.5, Number(tiers.supporter.price) || 9.99),
      level: 1
    };
  }
  
  // Validate VIP (must be more expensive than supporter)
  if (tiers.vip) {
    const minPrice = validated.supporter?.price || 9.99;
    validated.vip = {
      ...tiers.vip,
      price: Math.max(minPrice + 5, Number(tiers.vip.price) || 19.99),
      level: 2
    };
  }
  
  // Validate Superfan (must be more expensive than VIP)
  if (tiers.superfan) {
    const minPrice = validated.vip?.price || 19.99;
    validated.superfan = {
      ...tiers.superfan,
      price: Math.max(minPrice + 10, Number(tiers.superfan.price) || 49.99),
      level: 3
    };
  }
  
  return validated;
}

/**
 * Check user's tier level with creator
 */
export const getUserTier = async (userId, creatorId) => {
  if (!userId || !creatorId) return null;
  try {
    // 1. Check deterministic doc ID
    const subRef = doc(db, 'subscriptions', `${userId}_${creatorId}`);
    let subDoc = await getDoc(subRef);
    let sub = subDoc.exists() ? subDoc.data() : null;
    
    // 2. Fallback: Query by fields in case of auto-generated doc ID
    if (!sub) {
      const q = query(
        collection(db, 'subscriptions'),
        where('userId', '==', userId),
        where('creatorId', '==', creatorId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        sub = snap.docs[0].data();
      }
    }

    // 3. Fallback: Check reversed (if creator was checking fan or vice versa)
    if (!sub) {
      const qRev = query(
        collection(db, 'subscriptions'),
        where('userId', '==', creatorId),
        where('creatorId', '==', userId)
      );
      const snapRev = await getDocs(qRev);
      if (!snapRev.empty) {
        sub = snapRev.docs[0].data();
      }
    }

    // 4. Fallback: Check creator fan subcollection
    if (!sub) {
      try {
        const fanDoc = await getDoc(doc(db, 'creators', creatorId, 'fans', userId));
        if (fanDoc.exists()) {
          sub = fanDoc.data();
        }
      } catch (e) {}
    }
    
    if (!sub) return null;
    
    // Status check: if explicitly cancelled/refunded, deny
    if (sub.status && sub.status !== 'active') {
      return null;
    }
    
    // Expiry check
    if (sub.expiresAt) {
      const now = new Date();
      const expiresAt = sub.expiresAt.toDate 
        ? sub.expiresAt.toDate() 
        : new Date(sub.expiresAt.seconds ? sub.expiresAt.seconds * 1000 : sub.expiresAt);
      
      if (!isNaN(expiresAt.getTime()) && expiresAt < now) {
        return null;
      }
    }
    
    // Return tier level (supporter, vip, superfan) - defaults to supporter for active subscription
    return sub.tier || 'supporter';
  } catch (error) {
    logger.error('Error checking user tier:', error);
    return null;
  }
};

/**
 * Check if user has access based on tier
 */
export const hasTierAccess = async (userId, creatorId, requiredTier = 'supporter') => {
  try {
    const userTier = await getUserTier(userId, creatorId);
    
    if (!userTier) return false;
    
    const tierLevels = { supporter: 1, vip: 2, superfan: 3 };
    const userLevel = tierLevels[userTier] || 0;
    const requiredLevel = tierLevels[requiredTier] || 1;
    
    return userLevel >= requiredLevel;
  } catch (error) {
    logger.error('Error checking tier access:', error);
    return false;
  }
};

/**
 * Get call discount based on tier
 */
export const getCallDiscount = (tier) => {
  const discounts = {
    supporter: 0,
    vip: 0.10, // 10%
    superfan: 0.20 // 20%
  };
  
  return discounts[tier] || 0;
};

/**
 * Get display badge details for a tier
 */
export const getTierBadge = (tier) => {
  if (!tier) return null;
  const key = String(tier).toLowerCase();
  switch (key) {
    case 'superfan':
      return {
        id: 'superfan',
        name: 'Superfan',
        icon: '👑',
        label: '👑 Superfan',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
      };
    case 'vip':
      return {
        id: 'vip',
        name: 'VIP',
        icon: '⭐',
        label: '⭐ VIP',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
      };
    case 'supporter':
      return {
        id: 'supporter',
        name: 'Supporter',
        icon: '🌱',
        label: '🌱 Supporter',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
      };
    default:
      return null;
  }
};

export default {
  getCreatorTiers,
  saveCreatorTiers,
  getUserTier,
  hasTierAccess,
  getCallDiscount,
  getTierBadge,
  DEFAULT_TIERS
};
