// src/services/communityService.js - Complete Community Service

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc,
  deleteDoc,
  query, 
  where, 
  orderBy,
  limit,
  increment,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Create a new community
 */
export const createCommunity = async (creatorId, communityData) => {
  try {
    const communityRef = doc(collection(db, 'communities'));
    const community = {
      id: communityRef.id,
      creatorId,
      name: communityData.name,
      description: communityData.description || '',
      coverImage: communityData.coverImage || null,
      price: communityData.price || 9.99,
      memberCount: 0,
      isPrivate: communityData.isPrivate !== false, // Default to private
      category: communityData.category || 'general',
      rules: communityData.rules || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(communityRef, community);

    // Update user's communities count
    const userRef = doc(db, 'users', creatorId);
    await updateDoc(userRef, {
      communitiesCount: increment(1)
    });

    console.log('✅ Community created:', communityRef.id);
    return { id: communityRef.id, ...community };
  } catch (error) {
    console.error('Error creating community:', error);
    throw error;
  }
};

/**
 * Get all communities
 */
export const getCommunities = async (filters = {}) => {
  try {
    const communitiesRef = collection(db, 'communities');
    let q = query(communitiesRef, orderBy('memberCount', 'desc'));

    // Apply filters
    if (filters.category) {
      q = query(communitiesRef, where('category', '==', filters.category));
    }

    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting communities:', error);
    return [];
  }
};

/**
 * Get a single community
 */
export const getCommunity = async (communityId) => {
  try {
    const communityRef = doc(db, 'communities', communityId);
    const communityDoc = await getDoc(communityRef);

    if (communityDoc.exists()) {
      return {
        id: communityDoc.id,
        ...communityDoc.data()
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting community:', error);
    return null;
  }
};

/**
 * Join a community (subscribe)
 */
export const joinCommunity = async (userId, communityId, subscriptionData = {}) => {
  try {
    const memberRef = doc(collection(db, 'community_members'));
    const member = {
      id: memberRef.id,
      communityId,
      userId,
      role: 'member',
      joinedAt: serverTimestamp(),
      subscriptionStatus: 'active',
      subscriptionEnd: subscriptionData.subscriptionEnd || null,
      lastActive: serverTimestamp()
    };

    await setDoc(memberRef, member);

    // Increment member count
    const communityRef = doc(db, 'communities', communityId);
    await updateDoc(communityRef, {
      memberCount: increment(1)
    });

    // Update user's joined communities count
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      communitiesJoined: increment(1)
    });

    console.log('✅ User joined community:', communityId);
    return member;
  } catch (error) {
    console.error('Error joining community:', error);
    throw error;
  }
};

/**
 * Leave a community
 */
export const leaveCommunity = async (userId, communityId) => {
  try {
    const membersRef = collection(db, 'community_members');
    const q = query(
      membersRef,
      where('userId', '==', userId),
      where('communityId', '==', communityId)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);

      // Decrement member count
      const communityRef = doc(db, 'communities', communityId);
      await updateDoc(communityRef, {
        memberCount: increment(-1)
      });

      // Update user's joined communities count
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        communitiesJoined: increment(-1)
      });

      console.log('✅ User left community:', communityId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error leaving community:', error);
    throw error;
  }
};

/**
 * Check if user is a member
 */
export const isCommunityMember = async (userId, communityId) => {
  try {
    const membersRef = collection(db, 'community_members');
    const q = query(
      membersRef,
      where('userId', '==', userId),
      where('communityId', '==', communityId),
      where('subscriptionStatus', '==', 'active')
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking membership:', error);
    return false;
  }
};

/**
 * Get community members
 */
export const getCommunityMembers = async (communityId) => {
  try {
    const membersRef = collection(db, 'community_members');
    const q = query(
      membersRef,
      where('communityId', '==', communityId),
      orderBy('joinedAt', 'desc')
    );
    const snapshot = await getDocs(q);

    // Get user info for each member
    const members = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const memberData = docSnap.data();
        const userDoc = await getDoc(doc(db, 'users', memberData.userId));
        const userData = userDoc.exists() ? userDoc.data() : {};

        return {
          id: docSnap.id,
          ...memberData,
          user: {
            id: memberData.userId,
            name: userData.displayName || 'User',
            username: userData.username || '',
            avatar: userData.avatar || '👤'
          }
        };
      })
    );

    return members;
  } catch (error) {
    console.error('Error getting members:', error);
    return [];
  }
};

/**
 * Create a community post
 */
export const createCommunityPost = async (communityId, authorId, postData) => {
  try {
    const postRef = doc(collection(db, 'community_posts'));
    const post = {
      id: postRef.id,
      communityId,
      authorId,
      content: postData.content || '',
      images: postData.images || [],
      videos: postData.videos || [],
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp()
    };

    await setDoc(postRef, post);
    console.log('✅ Community post created:', postRef.id);
    return post;
  } catch (error) {
    console.error('Error creating community post:', error);
    throw error;
  }
};

/**
 * Get community posts
 */
export const getCommunityPosts = async (communityId) => {
  try {
    const postsRef = collection(db, 'community_posts');
    const q = query(
      postsRef,
      where('communityId', '==', communityId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting community posts:', error);
    return [];
  }
};

/**
 * Update community
 */
export const updateCommunity = async (communityId, updates) => {
  try {
    const communityRef = doc(db, 'communities', communityId);
    await updateDoc(communityRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Community updated:', communityId);
    return true;
  } catch (error) {
    console.error('Error updating community:', error);
    throw error;
  }
};

/**
 * Delete community
 */
export const deleteCommunity = async (communityId) => {
  try {
    // Delete all members
    const membersRef = collection(db, 'community_members');
    const membersQuery = query(membersRef, where('communityId', '==', communityId));
    const membersSnapshot = await getDocs(membersQuery);
    await Promise.all(membersSnapshot.docs.map(doc => deleteDoc(doc.ref)));

    // Delete all posts
    const postsRef = collection(db, 'community_posts');
    const postsQuery = query(postsRef, where('communityId', '==', communityId));
    const postsSnapshot = await getDocs(postsQuery);
    await Promise.all(postsSnapshot.docs.map(doc => deleteDoc(doc.ref)));

    // Delete community
    await deleteDoc(doc(db, 'communities', communityId));

    console.log('✅ Community deleted:', communityId);
    return true;
  } catch (error) {
    console.error('Error deleting community:', error);
    throw error;
  }
};

/**
 * Get user's communities
 */
export const getUserCommunities = async (userId) => {
  try {
    const membersRef = collection(db, 'community_members');
    const q = query(
      membersRef,
      where('userId', '==', userId),
      where('subscriptionStatus', '==', 'active')
    );
    const snapshot = await getDocs(q);

    // Get full community data
    const communities = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const memberData = docSnap.data();
        const community = await getCommunity(memberData.communityId);
        return {
          ...community,
          membershipId: docSnap.id,
          role: memberData.role,
          joinedAt: memberData.joinedAt
        };
      })
    );

    return communities.filter(Boolean);
  } catch (error) {
    console.error('Error getting user communities:', error);
    return [];
  }
};

/**
 * Get communities created by user
 */
export const getCreatorCommunities = async (creatorId) => {
  try {
    const communitiesRef = collection(db, 'communities');
    const q = query(
      communitiesRef,
      where('creatorId', '==', creatorId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting creator communities:', error);
    return [];
  }
};