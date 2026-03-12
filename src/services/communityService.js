// src/services/communityService.js

import { 
  collection, doc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, increment, serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db } from '../config/firebase';

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
      oneTimePrice: communityData.oneTimePrice || null,
      memberCount: 0,
      isPrivate: communityData.isPrivate !== false,
      category: communityData.category || 'general',
      rules: communityData.rules || [],
      membersCanPost: communityData.membersCanPost || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(communityRef, community);
    await updateDoc(doc(db, 'users', creatorId), { communitiesCount: increment(1) });
    return { id: communityRef.id, ...community };
  } catch (error) {
    console.error('Error creating community:', error);
    throw error;
  }
};

export const getCommunities = async (filters = {}) => {
  try {
    const communitiesRef = collection(db, 'communities');
    // No orderBy to avoid needing an index — sort in JS
    const snapshot = await getDocs(communitiesRef);
    let results = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (filters.category) {
      results = results.filter(c => c.category === filters.category);
    }
    // Sort by memberCount descending
    results.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
    if (filters.limit) results = results.slice(0, filters.limit);
    return results;
  } catch (error) {
    console.error('Error getting communities:', error);
    return [];
  }
};

export const getCommunity = async (communityId) => {
  try {
    const snap = await getDoc(doc(db, 'communities', communityId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Error getting community:', error);
    return null;
  }
};

export const joinCommunity = async (userId, communityId, subscriptionData = {}) => {
  try {
    const memberRef = doc(db, 'community_members', `${userId}_${communityId}`);
    // Check if already a member — don't duplicate or increment count
    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      console.log('Already a member, skipping join');
      return existing.data();
    }
    const member = {
      id: `${userId}_${communityId}`,
      communityId,
      userId,
      role: 'member',
      joinedAt: serverTimestamp(),
      subscriptionStatus: 'active',
      subscriptionEnd: subscriptionData.subscriptionEnd || null,
      lastActive: serverTimestamp()
    };
    await setDoc(memberRef, member);
    await updateDoc(doc(db, 'communities', communityId), { memberCount: increment(1) });
    await updateDoc(doc(db, 'users', userId), { communitiesJoined: increment(1) });
    return member;
  } catch (error) {
    console.error('Error joining community:', error);
    throw error;
  }
};

export const leaveCommunity = async (userId, communityId) => {
  try {
    // Direct delete using deterministic ID
    await deleteDoc(doc(db, 'community_members', `${userId}_${communityId}`));
    await updateDoc(doc(db, 'communities', communityId), { memberCount: increment(-1) });
    await updateDoc(doc(db, 'users', userId), { communitiesJoined: increment(-1) });
    return true;
  } catch (error) {
    console.error('Error leaving community:', error);
    throw error;
  }
};

export const isCommunityMember = async (userId, communityId) => {
  try {
    // Simple getDoc — no query, no composite index needed
    const snap = await getDoc(doc(db, 'community_members', `${userId}_${communityId}`));
    if (!snap.exists()) return false;
    const data = snap.data();
    // Check active + not expired
    if (data.subscriptionStatus !== 'active') return false;
    if (data.subscriptionEnd) {
      const end = data.subscriptionEnd.toDate ? data.subscriptionEnd.toDate() : new Date(data.subscriptionEnd);
      if (end < new Date()) return false;
    }
    return true;
  } catch (error) {
    console.error('Error checking membership:', error);
    return false;
  }
};

export const getCommunityMembers = async (communityId) => {
  try {
    // Single where clause — no composite index needed
    const snap = await getDocs(query(
      collection(db, 'community_members'),
      where('communityId', '==', communityId)
    ));
    // Sort in JS
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.joinedAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.joinedAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      });

    // Deduplicate by userId — old random-ID docs may coexist with new deterministic ones
    const seenUsers = new Set();
    const deduped = sorted.filter(m => {
      if (seenUsers.has(m.userId)) return false;
      seenUsers.add(m.userId);
      return true;
    });

    const members = await Promise.all(deduped.map(async (memberData) => {
      const userDoc = await getDoc(doc(db, 'users', memberData.userId));
      const userData = userDoc.exists() ? userDoc.data() : {};
      return {
        ...memberData,
        user: {
          id: memberData.userId,
          name: userData.displayName || 'User',
          username: userData.username || '',
          avatar: userData.profilePicture || userData.avatar || null
        }
      };
    }));
    return members;
  } catch (error) {
    console.error('Error getting members:', error);
    return [];
  }
};

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
      likedBy: [],
      commentCount: 0,
      createdAt: serverTimestamp()
    };
    await setDoc(postRef, post);
    return post;
  } catch (error) {
    console.error('Error creating community post:', error);
    throw error;
  }
};

export const getCommunityPosts = async (communityId) => {
  try {
    // Single where only — sort in JS to avoid composite index
    const snap = await getDocs(query(
      collection(db, 'community_posts'),
      where('communityId', '==', communityId)
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      })
      .slice(0, 50);
  } catch (error) {
    console.error('Error getting community posts:', error);
    return [];
  }
};

export const updateCommunity = async (communityId, updates) => {
  try {
    await updateDoc(doc(db, 'communities', communityId), {
      ...updates,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error updating community:', error);
    throw error;
  }
};

export const deleteCommunity = async (communityId) => {
  try {
    const membersSnap = await getDocs(query(collection(db, 'community_members'), where('communityId', '==', communityId)));
    await Promise.all(membersSnap.docs.map(d => deleteDoc(d.ref)));
    const postsSnap = await getDocs(query(collection(db, 'community_posts'), where('communityId', '==', communityId)));
    await Promise.all(postsSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'communities', communityId));
    return true;
  } catch (error) {
    console.error('Error deleting community:', error);
    throw error;
  }
};

export const getUserCommunities = async (userId) => {
  try {
    // Single where — no composite index
    const snap = await getDocs(query(
      collection(db, 'community_members'),
      where('userId', '==', userId)
    ));
    const active = snap.docs
      .map(d => d.data())
      .filter(d => d.subscriptionStatus === 'active');

    const communities = await Promise.all(
      active.map(async (memberData) => {
        const community = await getCommunity(memberData.communityId);
        if (!community) return null;
        return { ...community, membershipId: memberData.id, role: memberData.role, joinedAt: memberData.joinedAt };
      })
    );
    return communities.filter(Boolean);
  } catch (error) {
    console.error('Error getting user communities:', error);
    return [];
  }
};

export const getCreatorCommunities = async (creatorId) => {
  try {
    // Single where — sort in JS
    const snap = await getDocs(query(
      collection(db, 'communities'),
      where('creatorId', '==', creatorId)
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      });
  } catch (error) {
    console.error('Error getting creator communities:', error);
    return [];
  }
};

export const likeCommunityPost = async (postId, userId) => {
  try {
    const postRef = doc(db, 'community_posts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error('Post not found');
    const likedBy = postSnap.data().likedBy || [];
    if (likedBy.includes(userId)) {
      await updateDoc(postRef, { likeCount: increment(-1), likedBy: arrayRemove(userId) });
      return false;
    } else {
      await updateDoc(postRef, { likeCount: increment(1), likedBy: arrayUnion(userId) });
      return true;
    }
  } catch (error) {
    console.error('Error liking post:', error);
    throw error;
  }
};

export const addCommunityPostComment = async (postId, userId, commentText) => {
  try {
    const commentRef = doc(collection(db, 'community_posts', postId, 'comments'));
    const comment = { id: commentRef.id, postId, userId, text: commentText, createdAt: serverTimestamp() };
    await setDoc(commentRef, comment);
    await updateDoc(doc(db, 'community_posts', postId), { commentCount: increment(1) });
    return comment;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
};

export const getCommunityPostComments = async (postId) => {
  try {
    const snap = await getDocs(collection(db, 'community_posts', postId, 'comments'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      });
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
};