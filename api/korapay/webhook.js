// api/korapay/webhook.js
// Place this file in: api/korapay/webhook.js (in your project root)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();

/**
 * Process successful payment
 */
async function processSuccessfulPayment(paymentData, paymentId) {
  const { contentType, contentId, creatorId, userId, amount } = paymentData;

  try {
    switch (contentType) {
      case 'subscription':
        await db.collection('subscriptions').add({
          userId,
          creatorId,
          paymentId,
          amount,
          status: 'active',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        break;

      case 'unlock':
        await db.collection('unlocked_content').add({
          userId,
          contentId,
          creatorId,
          paymentId,
          amount,
          unlockedAt: new Date()
        });
        break;

      case 'tip':
        await db.collection('tips').add({
          fromUserId: userId,
          toCreatorId: creatorId,
          paymentId,
          amount,
          createdAt: new Date()
        });
        break;

      case 'topup':
        const userBalanceRef = db.collection('user_balances').doc(userId);
        const userBalanceDoc = await userBalanceRef.get();
        
        if (userBalanceDoc.exists) {
          const currentBalance = userBalanceDoc.data().balance || 0;
          await userBalanceRef.update({
            balance: currentBalance + amount,
            updatedAt: new Date()
          });
        } else {
          await userBalanceRef.set({
            userId,
            balance: amount,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
        break;
    }

    // Update creator's pending balance
    if (creatorId) {
      const creatorBalanceRef = db.collection('creator_balances').doc(creatorId);
      const creatorBalanceDoc = await creatorBalanceRef.get();
      
      const platformFee = amount * 0.15; // 15% platform fee
      const creatorEarning = amount - platformFee;

      if (creatorBalanceDoc.exists) {
        const currentPending = creatorBalanceDoc.data().pendingBalance || 0;
        await creatorBalanceRef.update({
          pendingBalance: currentPending + creatorEarning,
          totalEarnings: (creatorBalanceDoc.data().totalEarnings || 0) + creatorEarning,
          updatedAt: new Date()
        });
      } else {
        await creatorBalanceRef.set({
          creatorId,
          availableBalance: 0,
          pendingBalance: creatorEarning,
          totalEarnings: creatorEarning,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    console.log('Payment processed:', paymentId);
  } catch (error) {
    console.error('Error processing payment:', error);
    throw error;
  }
}

/**
 * Main webhook handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, data } = req.body;

    console.log('Webhook received:', event);

    switch (event) {
      case 'charge.success':
        const { metadata } = data;
        const firebaseDocId = metadata?.firebaseDocId;

        if (!firebaseDocId) {
          return res.status(400).json({ error: 'Missing payment reference' });
        }

        // Get payment document
        const paymentRef = db.collection('payments').doc(firebaseDocId);
        const paymentDoc = await paymentRef.get();

        if (!paymentDoc.exists) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        const paymentData = paymentDoc.data();

        // Update payment status
        await paymentRef.update({
          status: 'verified',
          verifiedAt: new Date(),
          webhookData: data,
          updatedAt: new Date()
        });

        // Process the payment
        await processSuccessfulPayment(paymentData, firebaseDocId);

        // Notify user
        await db.collection('user_notifications').add({
          userId: paymentData.userId,
          type: 'payment_success',
          message: 'Your payment has been verified!',
          paymentId: firebaseDocId,
          createdAt: new Date(),
          read: false
        });

        break;

      case 'charge.failed':
        const failedMetadata = data.metadata;
        const failedDocId = failedMetadata?.firebaseDocId;

        if (failedDocId) {
          await db.collection('payments').doc(failedDocId).update({
            status: 'failed',
            webhookData: data,
            updatedAt: new Date()
          });
        }
        break;

      default:
        console.log('Unhandled event:', event);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ success: false, error: error.message });
  }
}