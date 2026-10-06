// src/services/followService.js

import { getPostMillis, healPostDates } from '../utils/postTime';
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
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { createFollowNotification } from './notificationService';
import { sendCreatorAutoMessage } from './messageService';

export const followUser = async (followerId, followingId) => {
  try {
    console.log('🔵 Starting follow:', { followerId, followingId });

    // Create follow document
    const followRef = doc(collection(db, 'follows'));
    await setDoc(followRef, {
      followerId,
      followingId,
      createdAt: serverTimestamp()
    });
    console.log('✅ Follow document created');

    // Update follower count for the user being followed
    const followingUserRef = doc(db, 'users', followingId);
    const followingUserDoc = await getDoc(followingUserRef);
    if (!followingUserDoc.exists()) throw new Error('User not found');

    const followingData = followingUserDoc.data();
    const currentFollowers = typeof followingData.followers === 'number' 
      ? followingData.followers 
      : (typeof followingData.followersCount === 'number' ? followingData.followersCount : 0);

    await updateDoc(followingUserRef, {
      followers: increment(1),
      followersCount: increment(1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Follower count updated');

    // Update following count for the follower
    const followerUserRef = doc(db, 'users', followerId);
    const followerUserDoc = await getDoc(followerUserRef);
    if (!followerUserDoc.exists()) throw new Error('User not found');

    const followerDataObj = followerUserDoc.data();
    const currentFollowing = typeof followerDataObj.following === 'number'
      ? followerDataObj.following
      : (typeof followerDataObj.followingCount === 'number' ? followerDataObj.followingCount : 0);

    await updateDoc(followerUserRef, {
      following: increment(1),
      followingCount: increment(1),
      updatedAt: serverTimestamp()
    });
    console.log('✅ Following count updated');

    // Create follow notification
    try {
      const followerData = followerUserDoc.data();
      await createFollowNotification(followerId, followingId, followerData);
      console.log('✅ Follow notification created');
    } catch (notifError) {
      console.error('❌ Failed to create follow notification:', notifError.message);
      // Don't throw — notification failure shouldn't stop the follow
    }

    // Send automated welcome message from creator if enabled
    try {
      await sendCreatorAutoMessage(followingId, followerId, 'follow');
    } catch (autoMsgErr) {
      console.warn('⚠️ Automated follow message error:', autoMsgErr);
    }

    console.log('✅ Followed successfully');
    return followRef.id;
  } catch (error) {
    console.error('❌ Error following user:', error);
    throw error;
  }
};

export const unfollowUser = async (followerId, followingId) => {
  try {
    console.log('🔵 Starting unfollow:', { followerId, followingId });

    // Find and delete the follow document
    const followsRef = collection(db, 'follows');
    const q = query(
      followsRef,
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) throw new Error('Follow relationship not found');

    await deleteDoc(doc(db, 'follows', querySnapshot.docs[0].id));
    console.log('✅ Follow document deleted');

    // Decrement follower count — never go below 0
    const followingUserRef = doc(db, 'users', followingId);
    const followingUserDoc = await getDoc(followingUserRef);
    if (!followingUserDoc.exists()) throw new Error('User not found');

    const followingData = followingUserDoc.data();
    const currentFollowers = typeof followingData.followers === 'number'
      ? followingData.followers
      : (typeof followingData.followersCount === 'number' ? followingData.followersCount : 0);
    const nextFollowers = Math.max(0, currentFollowers - 1);

    await updateDoc(followingUserRef, {
      followers: nextFollowers,
      followersCount: nextFollowers,
      updatedAt: serverTimestamp()
    });
    console.log('✅ Follower count decremented');

    // Decrement following count — never go below 0
    const followerUserRef = doc(db, 'users', followerId);
    const followerUserDoc = await getDoc(followerUserRef);
    if (!followerUserDoc.exists()) throw new Error('User not found');

    const followerDataObj = followerUserDoc.data();
    const currentFollowing = typeof followerDataObj.following === 'number'
      ? followerDataObj.following
      : (typeof followerDataObj.followingCount === 'number' ? followerDataObj.followingCount : 0);
    const nextFollowing = Math.max(0, currentFollowing - 1);

    await updateDoc(followerUserRef, {
      following: nextFollowing,
      followingCount: nextFollowing,
      updatedAt: serverTimestamp()
    });
    console.log('✅ Following count decremented');

    console.log('✅ Unfollowed successfully');
  } catch (error) {
    console.error('❌ Error unfollowing user:', error);
    throw error;
  }
};

/**
 * Real-time subscription to follow relationship between current user and target creator
 */
export const subscribeToFollowStatus = (followerId, followingId, callback) => {
  if (!followerId || !followingId || followerId === followingId) {
    callback(false);
    return () => {};
  }
  try {
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    return onSnapshot(q, (snapshot) => {
      callback(!snapshot.empty);
    }, (err) => {
      console.warn('Real-time follow status warning:', err);
    });
  } catch (err) {
    console.error('Error setting up follow status subscription:', err);
    return () => {};
  }
};

export const isFollowing = async (followerId, followingId) => {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('❌ Error checking follow status:', error);
    throw error;
  }
};

export const getFollowers = async (userId) => {
  try {
    const q = query(collection(db, 'follows'), where('followingId', '==', userId));
    const snapshot = await getDocs(q);
    const followers = [];
    for (const docSnap of snapshot.docs) {
      const userDoc = await getDoc(doc(db, 'users', docSnap.data().followerId));
      if (userDoc.exists()) followers.push({ id: userDoc.id, ...userDoc.data() });
    }
    return followers;
  } catch (error) {
    console.error('❌ Error getting followers:', error);
    throw error;
  }
};

export const getFollowing = async (userId) => {
  try {
    const q = query(collection(db, 'follows'), where('followerId', '==', userId));
    const snapshot = await getDocs(q);
    const following = [];
    for (const docSnap of snapshot.docs) {
      const userDoc = await getDoc(doc(db, 'users', docSnap.data().followingId));
      if (userDoc.exists()) following.push({ id: userDoc.id, ...userDoc.data() });
    }
    return following;
  } catch (error) {
    console.error('❌ Error getting following:', error);
    throw error;
  }
};

export const getFollowingPosts = async (userId, limitCount = 20) => {
  try {
    const followsQuery = query(collection(db, 'follows'), where('followerId', '==', userId));
    const followsSnapshot = await getDocs(followsQuery);
    const followingIds = followsSnapshot.docs.map(d => d.data().followingId);

    if (followingIds.length === 0) return [];

    const postsQuery = query(
      collection(db, 'posts'),
      where('userId', 'in', followingIds.slice(0, 10))
    );
    const postsSnapshot = await getDocs(postsQuery);
    const posts = postsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    posts.sort((a, b) => getPostMillis(b) - getPostMillis(a));
    healPostDates(posts);

    return posts.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting following posts:', error);
    throw error;
  }
};

export const getFollowerCount = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists() ? (userDoc.data().followers || 0) : 0;
  } catch (error) {
    console.error('❌ Error getting follower count:', error);
    return 0;
  }
};

export const getFollowingCount = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists() ? (userDoc.data().following || 0) : 0;
  } catch (error) {
    console.error('❌ Error getting following count:', error);
    return 0;
  }
};