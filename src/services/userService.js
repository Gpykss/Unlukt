// src/services/userService.js - Block and Report functionality

import { 
  doc, 
  setDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Block a user
 */
export const blockUser = async (blockerId, blockedId) => {
  try {
    const blockRef = doc(collection(db, 'blocks'));
    await setDoc(blockRef, {
      blockerId,
      blockedId,
      createdAt: serverTimestamp()
    });
    
    console.log(`✅ User ${blockedId} blocked by ${blockerId}`);
    return true;
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (blockerId, blockedId) => {
  try {
    const blocksRef = collection(db, 'blocks');
    const q = query(
      blocksRef, 
      where('blockerId', '==', blockerId),
      where('blockedId', '==', blockedId)
    );
    const snapshot = await getDocs(q);
    
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    console.log(`✅ User ${blockedId} unblocked by ${blockerId}`);
    return true;
  } catch (error) {
    console.error('Error unblocking user:', error);
    throw error;
  }
};

/**
 * Check if a user is blocked
 */
export const isUserBlocked = async (blockerId, blockedId) => {
  try {
    const blocksRef = collection(db, 'blocks');
    const q = query(
      blocksRef,
      where('blockerId', '==', blockerId),
      where('blockedId', '==', blockedId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking if user is blocked:', error);
    return false;
  }
};

/**
 * Report a user
 */
export const reportUser = async (reporterId, reportedId, reason) => {
  try {
    const reportRef = doc(collection(db, 'reports'));
    await setDoc(reportRef, {
      reporterId,
      reportedId,
      reason,
      type: 'user',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    
    console.log(`✅ User ${reportedId} reported by ${reporterId} for: ${reason}`);
    return true;
  } catch (error) {
    console.error('Error reporting user:', error);
    throw error;
  }
};

/**
 * Get all users blocked by a user
 */
export const getBlockedUsers = async (userId) => {
  try {
    const blocksRef = collection(db, 'blocks');
    const q = query(blocksRef, where('blockerId', '==', userId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
};