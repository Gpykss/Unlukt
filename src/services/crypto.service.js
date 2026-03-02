// src/services/crypto.service.js - SECURE VERSION

import { db, auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

class CryptoService {
  /**
   * Initialize USDT payment via Firebase Function (SECURE)
   */
  async initializeUSDTPayment(paymentData) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      const token = await user.getIdToken();

      console.log('🔵 Calling Firebase Function to create payment...');

      // ✅ SECURE: Call YOUR backend function
      const response = await fetch(
        'https://us-central1-ogfans-2d4a6.cloudfunctions.net/createPayment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(paymentData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Payment creation failed');
      }

      const result = await response.json();

      console.log('✅ Payment created:', result.paymentId);

      return result;
    } catch (error) {
      console.error('❌ Payment initialization error:', error);
      throw error;
    }
  }

  /**
   * Check payment status
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
}

export default new CryptoService();