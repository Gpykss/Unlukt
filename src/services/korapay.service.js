// src/services/korapay.service.js

import axios from 'axios';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { isKorapayCurrencySupported } from '../utils/currencySupport';

const KORAPAY_SECRET_KEY = import.meta.env.VITE_KORAPAY_SECRET_KEY;
const KORAPAY_API_URL = 'https://api.korapay.com/merchant/api/v1';

// ✅ fallback rates (ONLY used if Korapay rate fetch fails)
const FALLBACK_USD_RATES = {
  NGN: 1600,
  GHS: 15,
  KES: 150,
  ZAR: 19,
  UGX: 3900,
  TZS: 2550,
  XOF: 650,
  XAF: 650
};

class KorapayService {
  constructor() {
    this.headers = {
      Authorization: `Bearer ${KORAPAY_SECRET_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  // ✅ Try to fetch Korapay FX rate (USD -> currency)
  // If Korapay doesn't support this endpoint on your account, it will fallback automatically.
  async getUsdRateTo(currency) {
    const cur = String(currency || '').toUpperCase();

    if (cur === 'USD') return 1;

    // 1) try Korapay (best)
    try {
      // NOTE: endpoint shape may differ by Korapay product/account.
      // If this fails, we fallback to local table.
      const res = await axios.get(
        `${KORAPAY_API_URL}/rates?source=USD&destination=${cur}`,
        { headers: this.headers }
      );

      // Try common response shapes
      const data = res?.data?.data || res?.data;
      const rawRate =
        data?.rate ||
        data?.exchange_rate ||
        data?.data?.rate ||
        data?.data?.exchange_rate;

      const rate = Number(rawRate);
      if (Number.isFinite(rate) && rate > 0) {
        return rate;
      }
    } catch (e) {
      // ignore, fallback
      console.warn('Korapay rate fetch failed, using fallback:', e?.message);
    }

    // 2) fallback
    const fb = FALLBACK_USD_RATES[cur];
    if (Number.isFinite(fb) && fb > 0) return fb;

    // 3) if we can’t determine
    throw new Error(`No FX rate available for ${cur}`);
  }

  // ✅ USD -> local using Korapay rate + “10” markup (your request)
  async convertUsdToLocal(usdAmount, currency) {
    const cur = String(currency || '').toUpperCase();
    if (cur === 'USD') return Math.ceil(Number(usdAmount) || 0);

    const rate = await this.getUsdRateTo(cur);

    // ✅ “+10 added to whatever rate it is”
    const adjustedRate = rate + 10;

    const local = (Number(usdAmount) || 0) * adjustedRate;
    return Math.ceil(local);
  }

  async initializeBankTransfer(paymentData) {
    const {
      amountUSD,
      userId,
      userEmail,
      userName,
      contentId,
      contentType,
      creatorId,
      currency
    } = paymentData;

    const cur = String(currency || '').toUpperCase();

    if (!KORAPAY_SECRET_KEY) {
      throw new Error('Korapay API key not configured. Add VITE_KORAPAY_SECRET_KEY to .env');
    }

    if (!isKorapayCurrencySupported(cur)) {
      throw new Error(`Currency ${cur} not supported by Korapay for bank transfer`);
    }

    const localAmount = await this.convertUsdToLocal(amountUSD, cur);

    const reference = `unlukt_${Date.now()}_${String(userId || '').slice(0, 8)}`;

    // Create payment record first
    const paymentRecord = {
      reference,
      userId,
      userEmail,
      userName,
      contentId: contentId || null,
      contentType,
      creatorId: creatorId || null,
      amountUSD: Number(amountUSD) || 0,
      amountLocal: localAmount,
      currency: cur,
      paymentMethod: 'bank_transfer',
      status: 'pending',
      korapayResponse: null,
      accountDetails: null,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      verifiedAt: null,
      metadata: {
        platform: 'unlukt',
        source: 'web'
      }
    };

    const docRef = await addDoc(collection(db, 'payments'), paymentRecord);

    // Korapay payload
    const metadata = {
      firebaseDocId: docRef.id,
      contentType,
      userId
    };
    if (contentId) metadata.contentId = contentId;
    if (creatorId) metadata.creatorId = creatorId;

    const korapayPayload = {
      reference,
      amount: localAmount,
      currency: cur,
      customer: { name: userName, email: userEmail },
      notification_url: `${import.meta.env.VITE_WEBHOOK_URL || window.location.origin}/api/korapay/webhook`,
      merchant_bears_cost: true,
      metadata
    };

    const response = await axios.post(
      `${KORAPAY_API_URL}/charges/initialize`,
      korapayPayload,
      { headers: this.headers }
    );

    if (response.data?.status === true || response.data?.status === 'success') {
      const data = response.data.data;

      const updateData = {
        korapayResponse: data,
        korapayReference: data.reference,
        checkoutUrl: data.checkout_url || null
      };

      if (data.bank_account) {
        updateData.accountDetails = {
          accountNumber: data.bank_account.account_number,
          accountName: data.bank_account.account_name,
          bankName: data.bank_account.bank_name,
          expiresAt: data.bank_account.expires_at
        };
      }

      await updateDoc(doc(db, 'payments', docRef.id), updateData);

      return {
        success: true,
        paymentId: docRef.id,
        reference,
        currency: cur,
        amountLocal: localAmount,
        amountUSD: Number(amountUSD) || 0,
        checkoutUrl: data.checkout_url || null,
        accountDetails: updateData.accountDetails || null
      };
    }

    throw new Error(response.data?.message || 'Payment initialization failed');
  }

  async processSuccessfulPayment(paymentData, paymentId) {
    const { contentType, contentId, creatorId, userId, amountUSD } = paymentData;
    const amount = Number(amountUSD) || 0;

    switch (contentType) {
      case 'subscription':
        await addDoc(collection(db, 'subscriptions'), {
          userId,
          creatorId,
          paymentId,
          amount,
          status: 'active',
          startedAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        break;

      case 'unlock':
        await addDoc(collection(db, 'unlocked_content'), {
          userId,
          contentId,
          creatorId,
          paymentId,
          amount,
          unlockedAt: serverTimestamp()
        });
        break;

      case 'tip':
        await addDoc(collection(db, 'tips'), {
          fromUserId: userId,
          toCreatorId: creatorId,
          paymentId,
          amount,
          createdAt: serverTimestamp()
        });
        break;

      case 'topup': {
        const userBalanceRef = doc(db, 'user_balances', userId);
        const userBalanceDoc = await getDoc(userBalanceRef);

        if (userBalanceDoc.exists()) {
          const currentBalance = userBalanceDoc.data().balance || 0;
          await updateDoc(userBalanceRef, { balance: currentBalance + amount, updatedAt: serverTimestamp() });
        } else {
          await setDoc(userBalanceRef, {
            userId,
            balance: amount,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        break;
      }

      default:
        break;
    }

    // Creator earning (if applicable)
    if (creatorId) {
      const creatorBalanceRef = doc(db, 'creator_balances', creatorId);
      const creatorBalanceDoc = await getDoc(creatorBalanceRef);

      const platformFee = amount * 0.15;
      const creatorEarning = amount - platformFee;

      if (creatorBalanceDoc.exists()) {
        const currentPending = creatorBalanceDoc.data().pendingBalance || 0;
        await updateDoc(creatorBalanceRef, {
          pendingBalance: currentPending + creatorEarning,
          totalEarnings: (creatorBalanceDoc.data().totalEarnings || 0) + creatorEarning,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(creatorBalanceRef, {
          creatorId,
          availableBalance: 0,
          pendingBalance: creatorEarning,
          totalEarnings: creatorEarning,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
  }
}

export default new KorapayService();
