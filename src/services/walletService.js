// src/services/walletService.js - Wallet balance management

import { doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const MIN_TOPUP = 12;

/**
 * Get user wallet balance in USD
 */
export const getWalletBalance = async (userId) => {
  try {
    const ref = doc(db, 'user_balances', userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 0;
    return Number(snap.data().balance || 0);
  } catch (e) {
    console.error('Error getting balance:', e);
    return 0;
  }
};

/**
 * Deduct from wallet — throws if insufficient
 */
export const deductFromWallet = async (userId, amount, description, metadata = {}) => {
  const ref = doc(db, 'user_balances', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('Wallet not found. Please add funds first.');

  const currentBalance = Number(snap.data().balance || 0);

  if (currentBalance < amount) {
    throw new Error(
      `Insufficient balance. You have $${currentBalance.toFixed(2)} but need $${Number(amount).toFixed(2)}. Please top up your wallet.`
    );
  }

  await updateDoc(ref, {
    balance: currentBalance - amount,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'transactions'), {
    userId,
    amount: -amount,
    type: 'debit',
    description,
    balanceAfter: currentBalance - amount,
    ...metadata,
    createdAt: serverTimestamp(),
  });

  return currentBalance - amount;
};

/**
 * Add funds to wallet (called after payment verified)
 */
export const addToWallet = async (userId, amount, paymentId) => {
  const ref = doc(db, 'user_balances', userId);
  const snap = await getDoc(ref);
  const currentBalance = snap.exists() ? Number(snap.data().balance || 0) : 0;

  if (snap.exists()) {
    await updateDoc(ref, {
      balance: currentBalance + amount,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      userId,
      balance: amount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await addDoc(collection(db, 'transactions'), {
    userId,
    amount,
    type: 'topup',
    description: 'Wallet top-up',
    paymentId: paymentId || null,
    balanceAfter: currentBalance + amount,
    createdAt: serverTimestamp(),
  });

  return currentBalance + amount;
};