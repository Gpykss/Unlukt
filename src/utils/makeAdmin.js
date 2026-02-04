// src/utils/makeAdmin.js
// This is a utility function to make users admin
// You can call this from browser console or create a temporary admin page

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Make a user an admin
 * @param {string} userId - The user's UID
 * @returns {Promise<void>}
 */
export const makeUserAdmin = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      isAdmin: true,
      adminSince: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ User is now an admin:', userId);
    return { success: true, message: 'User is now an admin' };
  } catch (error) {
    console.error('❌ Error making user admin:', error);
    throw error;
  }
};

/**
 * Remove admin privileges from a user
 * @param {string} userId - The user's UID
 * @returns {Promise<void>}
 */
export const removeAdminAccess = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      isAdmin: false,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Admin access removed from user:', userId);
    return { success: true, message: 'Admin access removed' };
  } catch (error) {
    console.error('❌ Error removing admin access:', error);
    throw error;
  }
};

// Export for browser console usage
if (typeof window !== 'undefined') {
  window.makeUserAdmin = makeUserAdmin;
  window.removeAdminAccess = removeAdminAccess;
}