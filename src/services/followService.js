// src/services/followService.js - WITH DETAILED LOGGING

import { 
  collection,
  doc, 
  setDoc, 
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
  updateDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { createFollowNotification } from './notificationService';

/**
 * Follow a user - WITH NOTIFICATION AND DETAILED LOGGING
 */
export const followUser = async (followerId, followingId) => {
  try {
    console.log('🔵 Starting follow:', { followerId, followingId });
    
    // Create follow document
    const followRef = doc(collection(db, 'follows'));
    
    await setDoc(followRef, {
      followerId: followerId,
      followingId: followingId,
      createdAt: serverTimestamp()
    });
    console.log('✅ Follow document created');
    
    // Update follower count for the user being followed
    console.log('🔵 Updating follower count for:', followingId);
    const followingUserRef = doc(db, 'users', followingId);
    
    // Check if user document exists
    const followingUserDoc = await getDoc(followingUserRef);
    if (!followingUserDoc.exists()) {
      console.error('❌ User document does not exist:', followingId);
      throw new Error('User not found');
    }
    
    await updateDoc(followingUserRef, {
      followers: increment(1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Follower count updated');
    
    // Update following count for the follower
    console.log('🔵 Updating following count for:', followerId);
    const followerUserRef = doc(db, 'users', followerId);
    
    const followerUserDoc = await getDoc(followerUserRef);
    if (!followerUserDoc.exists()) {
      console.error('❌ User document does not exist:', followerId);
      throw new Error('User not found');
    }
    
    await updateDoc(followerUserRef, {
      following: increment(1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Following count updated');
    
    // ✅ CREATE FOLLOW NOTIFICATION WITH DETAILED LOGGING
    console.log('🔔 Creating follow notification...');
    try {
      const followerData = followerUserDoc.data();
      console.log('Follower data:', {
        displayName: followerData.displayName,
        username: followerData.username,
        avatar: followerData.avatar
      });
      
      const notificationId = await createFollowNotification(
        followerId,
        followingId,
        followerData
      );
      
      console.log('✅ Follow notification created with ID:', notificationId);
    } catch (notifError) {
      console.error('❌ Failed to create follow notification:', notifError);
      console.error('Error details:', notifError.message);
      console.error('Error stack:', notifError.stack);
      // Don't throw - notification failure shouldn't stop the follow
    }
    
    console.log('✅ Followed user successfully');
    return followRef.id;
  } catch (error) {
    console.error('❌ Error following user:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    throw error;
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (followerId, followingId) => {
  try {
    console.log('🔵 Starting unfollow:', { followerId, followingId });
    
    // Find the follow document
    const followsRef = collection(db, 'follows');
    const q = query(
      followsRef,
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    
    console.log('🔵 Querying follow document...');
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error('❌ Follow relationship not found');
      throw new Error('Follow relationship not found');
    }
    
    // Delete the follow document
    const followDoc = querySnapshot.docs[0];
    console.log('🔵 Deleting follow document:', followDoc.id);
    await deleteDoc(doc(db, 'follows', followDoc.id));
    console.log('✅ Follow document deleted');
    
    // Update follower count for the user being unfollowed
    console.log('🔵 Updating follower count for:', followingId);
    const followingUserRef = doc(db, 'users', followingId);
    
    const followingUserDoc = await getDoc(followingUserRef);
    if (!followingUserDoc.exists()) {
      console.error('❌ User document does not exist:', followingId);
      throw new Error('User not found');
    }
    
    await updateDoc(followingUserRef, {
      followers: increment(-1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Follower count decremented');
    
    // Update following count for the unfollower
    console.log('🔵 Updating following count for:', followerId);
    const followerUserRef = doc(db, 'users', followerId);
    
    const followerUserDoc = await getDoc(followerUserRef);
    if (!followerUserDoc.exists()) {
      console.error('❌ User document does not exist:', followerId);
      throw new Error('User not found');
    }
    
    await updateDoc(followerUserRef, {
      following: increment(-1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Following count decremented');
    
    console.log('✅ Unfollowed user successfully');
  } catch (error) {
    console.error('❌ Error unfollowing user:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    throw error;
  }
};

/**
 * Check if user is following another user
 */
export const isFollowing = async (followerId, followingId) => {
  try {
    const followsRef = collection(db, 'follows');
    const q = query(
      followsRef,
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('❌ Error checking follow status:', error);
    throw error;
  }
};

/**
 * Get followers list for a user
 */
export const getFollowers = async (userId) => {
  try {
    const followsRef = collection(db, 'follows');
    const q = query(followsRef, where('followingId', '==', userId));
    
    const querySnapshot = await getDocs(q);
    const followers = [];
    
    for (const docSnap of querySnapshot.docs) {
      const followData = docSnap.data();
      // Get follower user info
      const userDoc = await getDoc(doc(db, 'users', followData.followerId));
      if (userDoc.exists()) {
        followers.push({
          id: userDoc.id,
          ...userDoc.data()
        });
      }
    }
    
    return followers;
  } catch (error) {
    console.error('❌ Error getting followers:', error);
    throw error;
  }
};

/**
 * Get following list for a user
 */
export const getFollowing = async (userId) => {
  try {
    const followsRef = collection(db, 'follows');
    const q = query(followsRef, where('followerId', '==', userId));
    
    const querySnapshot = await getDocs(q);
    const following = [];
    
    for (const docSnap of querySnapshot.docs) {
      const followData = docSnap.data();
      // Get following user info
      const userDoc = await getDoc(doc(db, 'users', followData.followingId));
      if (userDoc.exists()) {
        following.push({
          id: userDoc.id,
          ...userDoc.data()
        });
      }
    }
    
    return following;
  } catch (error) {
    console.error('❌ Error getting following:', error);
    throw error;
  }
};

/**
 * Get posts from users that the current user follows
 */
export const getFollowingPosts = async (userId, limitCount = 20) => {
  try {
    // Get list of users the current user follows
    const followsRef = collection(db, 'follows');
    const followsQuery = query(followsRef, where('followerId', '==', userId));
    const followsSnapshot = await getDocs(followsQuery);
    
    const followingIds = followsSnapshot.docs.map(doc => doc.data().followingId);
    
    if (followingIds.length === 0) {
      return [];
    }
    
    // Get posts from followed users
    const postsRef = collection(db, 'posts');
    const postsQuery = query(
      postsRef,
      where('userId', 'in', followingIds.slice(0, 10)) // Firestore limit of 10 for 'in' queries
    );
    
    const postsSnapshot = await getDocs(postsQuery);
    const posts = [];
    
    postsSnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort by date
    posts.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
    
    return posts.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting following posts:', error);
    throw error;
  }
};

/**
 * Get follower count for a user
 */
export const getFollowerCount = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().followers || 0;
    }
    return 0;
  } catch (error) {
    console.error('❌ Error getting follower count:', error);
    return 0;
  }
};

/**
 * Get following count for a user
 */
export const getFollowingCount = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().following || 0;
    }
    return 0;
  } catch (error) {
    console.error('❌ Error getting following count:', error);
    return 0;
  }
};
