// src/services/korapay.service.js - FIXED FOR NGN NIGERIA PAYMENTS

import axios from 'axios';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const KORAPAY_SECRET_KEY = import.meta.env.VITE_KORAPAY_SECRET_KEY;
const KORAPAY_API_URL = 'https://api.korapay.com/merchant/api/v1';

// ✅ NGN to USD conversion rate (approximate - update regularly)
const NGN_TO_USD_RATE = 1600; // 1 USD = 1600 NGN (update this based on current rates)

class KorapayService {
  constructor() {
    if (!KORAPAY_SECRET_KEY) {
      console.error('❌ KORAPAY_SECRET_KEY not found!');
      console.error('Add this to your .env file:');
      console.error('VITE_KORAPAY_SECRET_KEY=sk_test_YOUR_KEY_HERE');
    } else {
      console.log('✅ Korapay initialized');
      console.log('🔑 API Key configured:', !!KORAPAY_SECRET_KEY);
    }
    
    this.headers = {
      'Authorization': `Bearer ${KORAPAY_SECRET_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * ✅ Convert USD to NGN
   */
  convertUSDtoNGN(usdAmount) {
    return Math.ceil(usdAmount * NGN_TO_USD_RATE); // Round up to nearest Naira
  }

  /**
   * Initialize a bank transfer payment (NGN for Nigeria users)
   */
  async initializeBankTransfer(paymentData) {
    const { 
      amount, // This is in USD
      userId, 
      userEmail, 
      userName,
      contentId, 
      contentType,
      creatorId,
      userCountry
    } = paymentData;

    try {
      // Validate API key
      if (!KORAPAY_SECRET_KEY) {
        throw new Error('Korapay API key not configured. Please check your .env file.');
      }

      // ✅ Convert USD to NGN for Nigerian users
      const ngnAmount = this.convertUSDtoNGN(amount);
      
      // Create payment reference
      const reference = `unlukt_${Date.now()}_${userId.substring(0, 8)}`;
      
      console.log('🏦 Initializing Korapay payment:', {
        reference,
        usdAmount: amount,
        ngnAmount,
        email: userEmail,
        country: userCountry
      });

      // Create payment record in Firebase FIRST
      const paymentRecord = {
        reference,
        userId,
        userEmail,
        userName,
        contentId: contentId || null,
        contentType,
        creatorId: creatorId || null,
        amountUSD: parseFloat(amount),
        amountNGN: ngnAmount,
        currency: 'NGN',
        paymentMethod: 'bank_transfer',
        status: 'pending',
        korapayResponse: null,
        accountDetails: null,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        verifiedAt: null,
        metadata: {
          platform: 'unlukt',
          source: 'web',
          userCountry: userCountry || 'Nigeria'
        }
      };

      const docRef = await addDoc(collection(db, 'payments'), paymentRecord);
      console.log('✅ Payment record created:', docRef.id);

     // ✅ Build metadata without empty strings
const metadata = {
  firebaseDocId: docRef.id,
  contentType,
  userId
};

// Only add if they have values
if (contentId) metadata.contentId = contentId;
if (creatorId) metadata.creatorId = creatorId;

const korapayPayload = {
  reference,
  amount: ngnAmount,
  currency: 'NGN',
  customer: {
    name: userName,
    email: userEmail
  },
  notification_url: `${import.meta.env.VITE_WEBHOOK_URL || window.location.origin}/api/korapay/webhook`,
  merchant_bears_cost: true,
  metadata
};

      console.log('📤 Sending request to Korapay:', korapayPayload);
      console.log('📤 Headers:', this.headers);

      const response = await axios.post(
        `${KORAPAY_API_URL}/charges/initialize`,
        korapayPayload,
        { headers: this.headers }
      );

      console.log('📥 Korapay response:', response.data);

      if (response.data.status === true || response.data.status === 'success') {
        const data = response.data.data;
        
        // Update payment record with Korapay response
const updateData = {
  korapayResponse: data,
  korapayReference: data.reference,
  checkoutUrl: data.checkout_url
};

// Only add account details if they exist (production mode)
if (data.bank_account) {
  updateData.accountDetails = {
    accountNumber: data.bank_account.account_number,
    accountName: data.bank_account.account_name,
    bankName: data.bank_account.bank_name,
    expiresAt: data.bank_account.expires_at
  };
}

await updateDoc(doc(db, 'payments', docRef.id), updateData);

        console.log('✅ Payment initialized successfully');

       // For test mode, return checkout URL
        // For production mode, return bank account details
        if (data.checkout_url) {
        return {
            success: true,
            paymentId: docRef.id,
            reference,
            checkoutUrl: data.checkout_url,
            amount: ngnAmount,
            amountUSD: amount,
            currency: 'NGN',
            mode: 'test' // Test mode uses checkout URL
        };
        } else {
        return {
            success: true,
            paymentId: docRef.id,
            reference,
            accountDetails: {
            accountNumber: data.bank_account.account_number,
            accountName: data.bank_account.account_name,
            bankName: data.bank_account.bank_name,
            expiresAt: data.bank_account.expires_at
            },
            amount: ngnAmount,
            amountUSD: amount,
            currency: 'NGN',
            expiresAt: data.bank_account.expires_at,
            mode: 'live' // Live mode uses bank account
        };
        }
      } else {
        throw new Error(response.data.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('❌ Korapay initialization error:', error);
      
      // Better error messages
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        console.error('Response status:', status);
        console.error('Response data:', data);
        
        if (status === 422) {
          // Validation error - show what field is wrong
          const errors = data.errors || data.message || 'Invalid payment data';
          throw new Error(`Validation error: ${JSON.stringify(errors)}`);
        } else if (status === 403) {
          throw new Error('Invalid Korapay API key. Please check your VITE_KORAPAY_SECRET_KEY in .env file.');
        } else if (status === 401) {
          throw new Error('Unauthorized. Your Korapay API key may have expired.');
        } else if (data?.message) {
          throw new Error(data.message);
        }
      }
      
      throw new Error(error.message || 'Failed to initialize payment');
    }
  }

  /**
   * Verify payment status with Korapay
   */
  async verifyPayment(reference) {
    try {
      const response = await axios.get(
        `${KORAPAY_API_URL}/charges/${reference}`,
        { headers: this.headers }
      );

      return response.data;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }

  /**
   * Process successful payment - unlock content, update balances, etc.
   */
  async processSuccessfulPayment(paymentData, paymentId) {
    const { contentType, contentId, creatorId, userId, amountUSD } = paymentData;
    const amount = amountUSD || paymentData.amount; // Use USD amount

    try {
      switch (contentType) {
        case 'subscription':
          await addDoc(collection(db, 'subscriptions'), {
            userId,
            creatorId,
            paymentId,
            amount,
            status: 'active',
            startedAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
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

        case 'topup':
          const userBalanceRef = doc(db, 'user_balances', userId);
          const userBalanceDoc = await getDoc(userBalanceRef);
          
          if (userBalanceDoc.exists()) {
            const currentBalance = userBalanceDoc.data().balance || 0;
            await updateDoc(userBalanceRef, {
              balance: currentBalance + amount,
              updatedAt: serverTimestamp()
            });
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

      // Update creator's balance (15% platform fee)
      if (creatorId) {
        const creatorBalanceRef = doc(db, 'creator_balances', creatorId);
        const creatorBalanceDoc = await getDoc(creatorBalanceRef);
        
        const platformFee = amount * 0.15; // 15% platform fee
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

    } catch (error) {
      console.error('Error processing successful payment:', error);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const paymentDoc = await getDoc(doc(db, 'payments', paymentId));
      
      if (!paymentDoc.exists()) {
        throw new Error('Payment not found');
      }

      return {
        success: true,
        payment: {
          id: paymentDoc.id,
          ...paymentDoc.data()
        }
      };
    } catch (error) {
      console.error('Get payment status error:', error);
      throw error;
    }
  }
}

export default new KorapayService();
