// src/services/commissionService.js
//
// Revenue split model:
//   Ambassador (own earnings)      → 90% creator  | 10% platform
//   Creator referred by ambassador → 80% creator  |  5% ambassador | 15% platform
//   Normal creator                 → 80% creator  | 20% platform
//
// Ambassador referral commission is paid for 1 year from the creator's signup date.

import {
  doc, getDoc, updateDoc, addDoc,
  collection, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Returns the revenue split for a creator given a gross amount.
 *
 * @param {string} creatorId  - Firebase UID of the creator receiving the payment
 * @param {number} gross      - The total payment amount (before any split)
 * @returns {{ creatorEarning, platformFee, ambassadorCommission, ambassadorId }}
 */
export async function getCreatorSplit(creatorId, gross) {
  try {
    const creatorSnap = await getDoc(doc(db, 'users', creatorId));
    const creator = creatorSnap.exists() ? creatorSnap.data() : {};

    const isAmbassador = creator.role === 'ambassador';
    const referredBy = creator.referredBy || null;

    // Check if still within the 1-year referral commission window
    let withinReferralPeriod = false;
    if (referredBy) {
      const signupTs = creator.createdAt;
      const signupDate = signupTs?.toDate
        ? signupTs.toDate()
        : signupTs instanceof Date
          ? signupTs
          : new Date(signupTs);
      withinReferralPeriod = (Date.now() - signupDate.getTime()) < ONE_YEAR_MS;
    }

    if (isAmbassador) {
      // Ambassador posting their own content → 90 / 10
      return {
        creatorEarning:       round(gross * 0.90),
        platformFee:          round(gross * 0.10),
        ambassadorCommission: 0,
        ambassadorId:         null,
      };
    }

    if (referredBy && withinReferralPeriod) {
      // Referred creator within 1 year → 80 / 5 (ambassador) / 15 (platform)
      return {
        creatorEarning:       round(gross * 0.80),
        platformFee:          round(gross * 0.15),
        ambassadorCommission: round(gross * 0.05),
        ambassadorId:         referredBy,
      };
    }

    // Normal creator → 80 / 20
    return {
      creatorEarning:       round(gross * 0.80),
      platformFee:          round(gross * 0.20),
      ambassadorCommission: 0,
      ambassadorId:         null,
    };
  } catch (err) {
    console.warn('commissionService: getCreatorSplit failed, defaulting to 80/20:', err.message);
    return {
      creatorEarning:       round(gross * 0.80),
      platformFee:          round(gross * 0.20),
      ambassadorCommission: 0,
      ambassadorId:         null,
    };
  }
}

/**
 * Credits the ambassador's balance and logs the commission record.
 * Safe to call — no-ops if amount <= 0 or ambassadorId is null.
 *
 * @param {string} ambassadorId
 * @param {number} amount
 * @param {string} referredCreatorId
 * @param {'subscription'|'tip'|'ppv'|'video_call'|'voice_call'|'community'} source
 */
export async function creditAmbassadorCommission(ambassadorId, amount, referredCreatorId, source) {
  if (!ambassadorId || amount <= 0) return;
  try {
    // Add to ambassador's running balance on their user doc
    await updateDoc(doc(db, 'users', ambassadorId), {
      ambassadorBalance:      increment(amount),
      totalCommissionEarned:  increment(amount),
      updatedAt:              serverTimestamp(),
    });

    // Log in referralCommissions for the dashboard
    await addDoc(collection(db, 'referralCommissions'), {
      ambassadorId,
      referredCreatorId,
      amount,
      source,
      status:    'pending',
      createdAt: serverTimestamp(),
    });

    console.log(`✅ Ambassador commission: $${amount} → ${ambassadorId} (${source})`);
  } catch (err) {
    // Non-fatal — don't block the main payment
    console.error('creditAmbassadorCommission failed (non-blocking):', err.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function round(n) {
  return parseFloat(n.toFixed(2));
}
