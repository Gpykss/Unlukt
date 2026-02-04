// src/services/crypto.service.js - UPDATED WITH VAT SUPPORT

import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

const ADMIN_USDT_ADDRESS = import.meta.env.VITE_USDT_TRC20_ADDRESS || 'TNotConfigured';

class CryptoService {
  /**
   * Initialize USDT TRC20 payment
   */
  async initializeUSDTPayment(paymentData) {
    const { 
      amount, 
      userId, 
      userEmail, 
      userName,
      contentId, 
      contentType,
      creatorId,
      userCountry // ✅ NEW
    } = paymentData;

    try {
      console.log('🔍 Checking USDT address:', ADMIN_USDT_ADDRESS);
      
      if (!ADMIN_USDT_ADDRESS || ADMIN_USDT_ADDRESS === 'TNotConfigured') {
        throw new Error('USDT wallet address not configured. Please add VITE_USDT_TRC20_ADDRESS to your .env file');
      }

      const reference = `CRYPTO_${Date.now()}_${userId.substring(0, 8)}`;
      const usdtAmount = parseFloat(amount);

      // ✅ NEW: Calculate VAT breakdown
      let vatAmount = 0;
      let vatPercentage = 0;
      let baseAmount = usdtAmount;

      if (userCountry === 'Nigeria') {
        // If amount already includes VAT, calculate backwards
        vatPercentage = 1.5;
        baseAmount = usdtAmount / 1.015; // Remove VAT to get base
        vatAmount = usdtAmount - baseAmount; // VAT amount
        
        console.log('🇳🇬 Nigeria VAT applied:', {
          baseAmount: baseAmount.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          total: usdtAmount.toFixed(2)
        });
      }

      console.log('✅ Creating crypto payment record...');

      const paymentRecord = {
        reference,
        userId,
        userEmail,
        userName,
        contentId: contentId || null,
        contentType,
        creatorId: creatorId || null,
        
        // ✅ UPDATED: Amount breakdown
        amount: parseFloat(amount), // Total amount (including VAT if applicable)
        baseAmount: baseAmount, // ✅ NEW: Amount before VAT
        vatAmount: vatAmount, // ✅ NEW: VAT amount
        vatPercentage: vatPercentage, // ✅ NEW: VAT percentage
        
        currency: 'USD',
        cryptoAmount: usdtAmount,
        cryptoCurrency: 'USDT',
        network: 'TRC20',
        paymentMethod: 'crypto_usdt',
        status: 'pending_payment',
        
        // ✅ NEW: Country info
        userCountry: userCountry || 'Unknown',
        
        adminWalletAddress: ADMIN_USDT_ADDRESS,
        userProofUrl: null,
        transactionHash: null,
        verificationStatus: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        verifiedAt: null,
        verifiedBy: null,
        metadata: {
          platform: 'unlukt',
          source: 'web',
          hasVAT: vatAmount > 0 // ✅ NEW: Flag for VAT
        }
      };

      const docRef = await addDoc(collection(db, 'crypto_payments'), paymentRecord);

      console.log('✅ Crypto payment initialized:', docRef.id);

      return {
        success: true,
        paymentId: docRef.id,
        reference,
        walletAddress: ADMIN_USDT_ADDRESS,
        amount: usdtAmount,
        network: 'TRC20',
        currency: 'USDT',
        expiresAt: paymentRecord.expiresAt,
        instructions: {
          step1: `Send exactly ${usdtAmount} USDT to the address below`,
          step2: 'Make sure to use TRC20 network',
          step3: 'Upload proof of payment (screenshot)',
          step4: 'Admin will verify within 24-72 hours'
        }
      };
    } catch (error) {
      console.error('❌ USDT initialization error:', error);
      throw error;
    }
  }

  /**
   * Submit proof of payment
   */
  async submitProofOfPayment(paymentId, proofUrl, transactionHash = '') {
    try {
      const paymentRef = doc(db, 'crypto_payments', paymentId);
      const paymentDoc = await getDoc(paymentRef);

      if (!paymentDoc.exists()) {
        throw new Error('Payment not found');
      }

      if (paymentDoc.data().status !== 'pending_payment') {
        throw new Error('Payment is not in pending state');
      }

      await updateDoc(paymentRef, {
        userProofUrl: proofUrl,
        transactionHash: transactionHash || null,
        status: 'pending_verification',
        verificationStatus: 'pending_review',
        proofSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Create admin notification
      await addDoc(collection(db, 'admin_notifications'), {
        type: 'crypto_payment_verification',
        paymentId,
        message: `New USDT payment proof submitted for verification`,
        createdAt: serverTimestamp(),
        read: false
      });

      return {
        success: true,
        message: 'Proof submitted successfully. Admin will verify within 24-72 hours.'
      };
    } catch (error) {
      console.error('Submit proof error:', error);
      throw error;
    }
  }

  /**
   * Admin: Verify crypto payment
   */
  async verifyPayment(paymentId, adminId, approved, notes = '') {
    try {
      const paymentRef = doc(db, 'crypto_payments', paymentId);
      const paymentDoc = await getDoc(paymentRef);

      if (!paymentDoc.exists()) {
        throw new Error('Payment not found');
      }

      const paymentData = paymentDoc.data();

      if (paymentData.verificationStatus !== 'pending_review') {
        throw new Error('Payment is not pending review');
      }

      const newStatus = approved ? 'verified' : 'rejected';

      await updateDoc(paymentRef, {
        verificationStatus: newStatus,
        status: approved ? 'verified' : 'rejected',
        verifiedAt: approved ? serverTimestamp() : null,
        verifiedBy: adminId,
        adminNotes: notes,
        updatedAt: serverTimestamp()
      });
      
      if (!approved && paymentData.userProofUrl) {
        try {
          const publicId = this.extractPublicId(paymentData.userProofUrl);
          if (publicId) {
            console.log('🗑️ Payment rejected - should delete proof:', publicId);
            console.log('⚠️ Image deletion requires backend implementation');
          }
        } catch (error) {
          console.error('Error extracting public_id:', error);
        }
      }

      if (approved) {
        // ✅ Use baseAmount (before VAT) for creator earnings
        const amountForCreator = paymentData.baseAmount || paymentData.amount;
        await this.processSuccessfulPayment({
          ...paymentData,
          amount: amountForCreator // Use amount before VAT
        }, paymentId);
      }

      // Notify user
      await addDoc(collection(db, 'user_notifications'), {
        userId: paymentData.userId,
        type: approved ? 'payment_verified' : 'payment_rejected',
        message: approved 
          ? 'Your USDT payment has been verified!' 
          : `Your USDT payment was rejected. ${notes}`,
        paymentId,
        createdAt: serverTimestamp(),
        read: false
      });

      return {
        success: true,
        status: newStatus,
        message: approved ? 'Payment verified successfully' : 'Payment rejected'
      };
    } catch (error) {
      console.error('Verify payment error:', error);
      throw error;
    }
  }

  /**
   * Process successful payment
   */
  async processSuccessfulPayment(paymentData, paymentId) {
    const { contentType, contentId, creatorId, userId, amount } = paymentData;

    try {
      switch (contentType) {
        case 'subscription':
          await addDoc(collection(db, 'subscriptions'), {
            userId,
            creatorId,
            paymentId,
            amount,
            paymentType: 'crypto',
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
            paymentType: 'crypto',
            unlockedAt: serverTimestamp()
          });
          break;

        case 'tip':
          await addDoc(collection(db, 'tips'), {
            fromUserId: userId,
            toCreatorId: creatorId,
            paymentId,
            amount,
            paymentType: 'crypto',
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

      // Update creator's pending balance
      if (creatorId) {
        const creatorBalanceRef = doc(db, 'creator_balances', creatorId);
        const creatorBalanceDoc = await getDoc(creatorBalanceRef);
        
        const platformFee = amount * 0.15; // 15% platform fee
        const creatorEarning = amount - platformFee;

        if (creatorBalanceDoc.exists()) {
          const currentPending = creatorBalanceDoc.data().pendingBalance || 0;
          const currentTotal = creatorBalanceDoc.data().totalEarnings || 0;
          
          await updateDoc(creatorBalanceRef, {
            pendingBalance: currentPending + creatorEarning,
            totalEarnings: currentTotal + creatorEarning,
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
      console.error('Error processing successful crypto payment:', error);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const paymentDoc = await getDoc(doc(db, 'crypto_payments', paymentId));
      
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

  /**
   * Get pending payments for admin review
   */
  async getPendingPayments() {
    try {
      const q = query(
        collection(db, 'crypto_payments'),
        where('verificationStatus', '==', 'pending_review')
      );

      const snapshot = await getDocs(q);
      const payments = [];

      snapshot.forEach(doc => {
        payments.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        payments
      };
    } catch (error) {
      console.error('Get pending payments error:', error);
      throw error;
    }
  }

  /**
   * Extract Cloudinary public_id from URL
   */
  extractPublicId(url) {
    if (!url || !url.includes('cloudinary.com')) {
      return null;
    }
    
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    return match ? match[1] : null;
  }
}

export default new CryptoService();