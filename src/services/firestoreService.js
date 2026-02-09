// src/services/firestoreService.js - UPDATED createUserProfile

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
 * Create new user profile with automatic username generation
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

    // ✅ GENERATE USERNAME if not provided
    let username = profileData.username;
    
    if (!username) {
      // Try to create username from displayName
      if (profileData.displayName) {
        // Create clean username from display name
        username = profileData.displayName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') // Remove special characters
          .slice(0, 15); // Limit length
        
        // Check if username already exists
        const usernameExists = await getUserByUsername(username);
        if (usernameExists) {
          // Add random number if taken
          username = `${username}${Math.floor(Math.random() * 1000)}`;
        }
      } else {
        // Fallback: use first 8 characters of UID
        username = cleanUserId.substring(0, 8);
      }
    }

    const userRef = doc(db, 'users', cleanUserId);
    
    const userData = {
      uid: cleanUserId,
      username: username, // ✅ Ensure username is always set
      displayName: profileData.displayName || '',
      email: profileData.email || '',
      avatar: profileData.avatar || '👤',
      bio: profileData.bio || '',
      location: profileData.location || '',
      website: profileData.website || '',
      banner: profileData.banner || '🎨',
      profileCompleted: profileData.profileCompleted !== undefined ? profileData.profileCompleted : false,
      kycStatus: profileData.kycStatus || 'none',
      role: profileData.role || 'user',
      subscriptionPrice: profileData.subscriptionPrice || 9.99,
      followers: 0,
      followersCount: 0,
      following: 0,
      followingCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isOnline: false,
      lastSeen: serverTimestamp()
    };

    await setDoc(userRef, userData);
    console.log('✅ Profile created:', cleanUserId, 'with username:', username);
  } catch (error) {
    console.error('❌ Error creating profile:', error);
    throw error;
  }
};

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
        uid: userDoc.id, // ✅ Add uid field
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

    const q = query(
      collection(db, 'users'),
      where('username', '==', cleanUsername)
    );

    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      return {
        id: userDoc.id,
        uid: userDoc.id, // ✅ Add uid field
        ...userDoc.data()
      };
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

    if (cleanUsername.length < 3) {
      return false;
    }

    const q = query(
      collection(db, 'users'),
      where('username', '==', cleanUsername)
    );

    const snapshot = await getDocs(q);
    
    const isAvailable = snapshot.empty;
    
    console.log(`✅ Username "${cleanUsername}" is ${isAvailable ? 'available' : 'taken'}`);
    
    return isAvailable;
  } catch (error) {
    console.error('❌ Error checking username availability:', error);
    return false;
  }
};

// =====================================================
// KYC MANAGEMENT FUNCTIONS (keep all existing code)
// =====================================================

export const getPendingKYCApplications = async () => {
  try {
    const q = query(
      collection(db, 'users'),
      where('kycStatus', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    
    const applications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    applications.sort((a, b) => {
      const dateA = a.kycSubmittedAt?.toDate?.() || new Date(0);
      const dateB = b.kycSubmittedAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });

    console.log(`✅ Fetched ${applications.length} pending KYC applications`);

    return applications;
  } catch (error) {
    console.error('❌ Error getting pending KYC applications:', error);
    return [];
  }
};

export const getKYCSubmissions = async (status = null) => {
  try {
    let q;
    
    if (status) {
      q = query(
        collection(db, 'users'),
        where('kycStatus', '==', status)
      );
    } else {
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

    submissions.sort((a, b) => {
      const dateA = a.kycSubmittedAt?.toDate?.() || new Date(0);
      const dateB = b.kycSubmittedAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });

    console.log(`✅ Fetched ${submissions.length} KYC submissions`);

    return submissions;
  } catch (error) {
    console.error('❌ Error getting KYC submissions:', error);
    return [];
  }
};

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

export const approveKYC = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      kycStatus: 'approved',
      kycReviewedAt: serverTimestamp(),
      kycRejectionReason: '',
      role: 'creator',
      updatedAt: serverTimestamp()
    });

    console.log('✅ KYC approved for user:', userId);
  } catch (error) {
    console.error('❌ Error approving KYC:', error);
    throw error;
  }
};

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