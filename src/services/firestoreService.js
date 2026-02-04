// src/services/firestoreService.js - Complete with KYC Functions

import { 
  collection,
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  updateDoc, 
  query,
  where,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// =====================================================
// USER PROFILE FUNCTIONS
// =====================================================

/**
 * Get user profile by userId
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
export const getUserProfile = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string') {
      console.error('❌ Invalid userId:', userId);
      return null;
    }

    const cleanUserId = userId.trim();
    
    if (!cleanUserId) {
      console.error('❌ Empty userId after trim');
      return null;
    }

    const userDoc = await getDoc(doc(db, 'users', cleanUserId));
    
    if (userDoc.exists()) {
      return {
        id: userDoc.id,
        ...userDoc.data()
      };
    } else {
      console.warn('⚠️ User not found:', cleanUserId);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
};

/**
 * Get user profile by username - IMPROVED VERSION
 * @param {string} username - Username (with or without @)
 * @returns {Promise<Object|null>}
 */
export const getUserByUsername = async (username) => {
  try {
    if (!username || typeof username !== 'string') {
      console.error('❌ Invalid username:', username);
      return null;
    }

    const cleanUsername = username.replace('@', '').trim().toLowerCase();
    
    if (!cleanUsername) {
      console.error('❌ Empty username after cleaning');
      return null;
    }

    // Try exact match first
    const q = query(
      collection(db, 'users'),
      where('username', '==', cleanUsername)
    );

    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      return {
        id: userDoc.id,
        ...userDoc.data()
      };
    }

    // If not found, try getting all users and match manually (fallback for users without proper username field)
    const allUsersSnapshot = await getDocs(collection(db, 'users'));
    
    for (const doc of allUsersSnapshot.docs) {
      const userData = doc.data();
      const userUsername = (userData.username || userData.displayName || '').toLowerCase();
      
      if (userUsername === cleanUsername || userUsername === `@${cleanUsername}`) {
        return {
          id: doc.id,
          ...userData
        };
      }
    }

    console.warn('⚠️ User not found with username:', cleanUsername);
    return null;
  } catch (error) {
    console.error('❌ Error getting user by username:', error);
    return null;
  }
};

/**
 * Create or update user profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data
 * @returns {Promise<void>}
 */
export const updateUserProfile = async (userId, profileData) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }

    const cleanUserId = userId.trim();
    
    if (!cleanUserId) {
      throw new Error('Empty userId');
    }

    const userRef = doc(db, 'users', cleanUserId);
    
    await updateDoc(userRef, {
      ...profileData,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Profile updated:', cleanUserId);
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    throw error;
  }
};

/**
 * Create new user profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data
 * @returns {Promise<void>}
 */
export const createUserProfile = async (userId, profileData) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }

    const cleanUserId = userId.trim();
    
    if (!cleanUserId) {
      throw new Error('Empty userId');
    }

    const userRef = doc(db, 'users', cleanUserId);
    
    await setDoc(userRef, {
      ...profileData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Profile created:', cleanUserId);
  } catch (error) {
    console.error('❌ Error creating profile:', error);
    throw error;
  }
};

// =====================================================
// KYC MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Get pending KYC applications
 * @returns {Promise<Array>}
 */
export const getPendingKYCApplications = async () => {
  try {
    // Simple query - NO orderBy to avoid index requirement
    const q = query(
      collection(db, 'users'),
      where('kycStatus', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    
    const applications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort in JavaScript instead of Firestore
    applications.sort((a, b) => {
      const dateA = a.kycSubmittedAt?.toDate?.() || new Date(0);
      const dateB = b.kycSubmittedAt?.toDate?.() || new Date(0);
      return dateB - dateA; // Newest first
    });

    console.log(`✅ Fetched ${applications.length} pending KYC applications`);

    return applications;
  } catch (error) {
    console.error('❌ Error getting pending KYC applications:', error);
    return [];
  }
};

/**
 * Get all KYC submissions (with optional status filter)
 * @param {string} status - Filter by status ('pending', 'approved', 'rejected', or null for all)
 * @returns {Promise<Array>}
 */
export const getKYCSubmissions = async (status = null) => {
  try {
    let q;
    
    if (status) {
      // Simple query - NO orderBy
      q = query(
        collection(db, 'users'),
        where('kycStatus', '==', status)
      );
    } else {
      // Get all users who have submitted KYC
      q = query(
        collection(db, 'users'),
        where('kycSubmittedAt', '!=', null)
      );
    }

    const snapshot = await getDocs(q);
    
    const submissions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort in JavaScript instead of Firestore
    submissions.sort((a, b) => {
      const dateA = a.kycSubmittedAt?.toDate?.() || new Date(0);
      const dateB = b.kycSubmittedAt?.toDate?.() || new Date(0);
      return dateB - dateA; // Newest first
    });

    console.log(`✅ Fetched ${submissions.length} KYC submissions`);

    return submissions;
  } catch (error) {
    console.error('❌ Error getting KYC submissions:', error);
    return [];
  }
};

/**
 * Check if username is available
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} - True if available, false if taken
 */
export const checkUsernameAvailability = async (username) => {
  try {
    if (!username || typeof username !== 'string') {
      console.error('❌ Invalid username:', username);
      return false;
    }

    const cleanUsername = username.replace('@', '').trim().toLowerCase();
    
    if (!cleanUsername) {
      console.error('❌ Empty username after cleaning');
      return false;
    }

    // Check minimum length (e.g., 3 characters)
    if (cleanUsername.length < 3) {
      return false;
    }

    const q = query(
      collection(db, 'users'),
      where('username', '==', cleanUsername)
    );

    const snapshot = await getDocs(q);
    
    // If snapshot is empty, username is available
    const isAvailable = snapshot.empty;
    
    console.log(`✅ Username "${cleanUsername}" is ${isAvailable ? 'available' : 'taken'}`);
    
    return isAvailable;
  } catch (error) {
    console.error('❌ Error checking username availability:', error);
    return false;
  }
};

/**
 * Get KYC details for a specific user
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
export const getKYCDetails = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      return {
        id: userDoc.id,
        displayName: userData.displayName || '',
        username: userData.username || '',
        email: userData.email || '',
        kycStatus: userData.kycStatus || 'not_submitted',
        kycData: userData.kycData || {},
        kycSubmittedAt: userData.kycSubmittedAt || null,
        kycReviewedAt: userData.kycReviewedAt || null,
        kycRejectionReason: userData.kycRejectionReason || '',
        profilePicture: userData.profilePicture || '',
        createdAt: userData.createdAt || null
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting KYC details:', error);
    return null;
  }
};

/**
 * Approve KYC submission
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const approveKYC = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      kycStatus: 'approved',
      kycReviewedAt: serverTimestamp(),
      kycRejectionReason: '', // Clear any previous rejection reason
      role: 'creator', // Upgrade user to creator role
      updatedAt: serverTimestamp()
    });

    console.log('✅ KYC approved for user:', userId);
  } catch (error) {
    console.error('❌ Error approving KYC:', error);
    throw error;
  }
};

/**
 * Reject KYC submission
 * @param {string} userId - User ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<void>}
 */
export const rejectKYC = async (userId, reason) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new Error('Rejection reason is required');
    }

    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      kycStatus: 'rejected',
      kycRejectionReason: reason.trim(),
      kycReviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ KYC rejected for user:', userId);
  } catch (error) {
    console.error('❌ Error rejecting KYC:', error);
    throw error;
  }
};

/**
 * Submit KYC documents (called by user)
 * @param {string} userId - User ID
 * @param {Object} kycData - KYC data (fullName, dateOfBirth, address, etc.)
 * @returns {Promise<void>}
 */
export const submitKYC = async (userId, kycData) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    
    if (!kycData || typeof kycData !== 'object') {
      throw new Error('KYC data is required');
    }

    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      kycStatus: 'pending',
      kycData: kycData,
      kycSubmittedAt: serverTimestamp(),
      kycReviewedAt: null,
      kycRejectionReason: '',
      updatedAt: serverTimestamp()
    });

    console.log('✅ KYC submitted for user:', userId);
  } catch (error) {
    console.error('❌ Error submitting KYC:', error);
    throw error;
  }
};

/**
 * Submit KYC application (alias for submitKYC)
 * @param {string} userId - User ID
 * @param {Object} kycData - KYC application data
 * @returns {Promise<void>}
 */
export const submitKYCApplication = async (userId, kycData) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    
    if (!kycData || typeof kycData !== 'object') {
      throw new Error('KYC data is required');
    }

    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      kycStatus: 'pending',
      kycData: kycData,
      kycSubmittedAt: serverTimestamp(),
      kycReviewedAt: null,
      kycRejectionReason: '',
      updatedAt: serverTimestamp()
    });

    console.log('✅ KYC application submitted for user:', userId);
  } catch (error) {
    console.error('❌ Error submitting KYC application:', error);
    throw error;
  }
};

/**
 * Get KYC statistics
 * @returns {Promise<Object>}
 */
export const getKYCStats = async () => {
  try {
    const allSubmissions = await getKYCSubmissions();
    
    const stats = {
      total: allSubmissions.length,
      pending: allSubmissions.filter(s => s.kycStatus === 'pending').length,
      approved: allSubmissions.filter(s => s.kycStatus === 'approved').length,
      rejected: allSubmissions.filter(s => s.kycStatus === 'rejected').length
    };

    console.log('✅ KYC stats:', stats);

    return stats;
  } catch (error) {
    console.error('❌ Error getting KYC stats:', error);
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
};