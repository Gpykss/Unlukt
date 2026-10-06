// src/services/postService.js - FULL: posts + ratings + unlock + subscription access

import { getPostMillis, healPostDates } from '../utils/postTime';
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
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';

import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { createLikeNotification, createCommentNotification } from './notificationService';
import { hasActiveSubscription } from './messageService';

// ✅ Allowed ratings
const normalizeRating = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'nsfw') return 'nsfw';
  return 'sfw';
};

// Deep clean (keep your logic)
const deepClean = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClean(item)).filter((item) => item !== undefined);
  }
  // ✅ Only recurse into PLAIN objects. serverTimestamp(), Timestamp, Date, etc. are class
  // instances and must be passed through untouched — recursing into them turned createdAt
  // into an empty map, which is why every post showed "Just now" and the feed order was off.
  if (obj && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype) {
    const cleaned = {};
    Object.keys(obj).forEach((key) => {
      const value = deepClean(obj[key]);
      if (value !== undefined) cleaned[key] = value;
    });
    return cleaned;
  }
  return obj;
};

/**
 * ✅ ACCESS HELPERS
 */
export const hasUnlockedPost = async (userId, postId) => {
  try {
    if (!userId || !postId) return false;
    const ref = doc(db, 'unlocked_content', `${userId}_${postId}`);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (e) {
    console.error('❌ hasUnlockedPost error:', e);
    return false;
  }
};

export const canViewPost = async (post, viewerId) => {
  try {
    if (!post) return false;

    // Owner always sees their own content
    if (viewerId && post.userId === viewerId) return true;

    const postType = post.type || 'free';

    // Free posts — everyone can view
    if (postType === 'free') return true;

    if (!viewerId) return false;

    // ✅ Business logic: an active subscription unlocks ALL non-free posts
    // (both subscriber-only AND paid PPV). This incentivises subscribing
    // over paying per post.
    const sub = await hasActiveSubscription(viewerId, post.userId);
    if (sub) return true;

    // Non-subscribers can still individually unlock a paid post
    if (postType === 'paid') {
      const unlocked = await hasUnlockedPost(viewerId, post.id);
      return !!unlocked;
    }

    return false;
  } catch (e) {
    console.error('❌ canViewPost error:', e);
    return false;
  }
};

/**
 * Create a new post
 */
export const createPost = async (userId, postData) => {
  try {
    const postRef = doc(collection(db, 'posts'));

    // Clean images
   const cleanImages = (postData.images || [])
  .map((img) => {
    if (typeof img === 'string') {
      // ✅ Detect if URL is video based on extension
      const isVideo = /\.(mp4|mov|avi|webm|mkv)$/i.test(img);
      return { url: img, type: isVideo ? 'video' : 'image' };
    }
    
    // ✅ Properly detect video type
    const imgType = img.type || img.resourceType || 'image';
    const isVideo = imgType === 'video' || /\.(mp4|mov|avi|webm|mkv)$/i.test(img.url || '');
    
    return {
      url: img.url || '',
      type: isVideo ? 'video' : 'image', // ✅ Correctly set type
      publicId: img.publicId || '',
      width: img.width || 0,
      height: img.height || 0,
      duration: img.duration || null
    };
  })
  .filter((img) => img.url);

    const contentRating = normalizeRating(postData?.contentRating);

    const cleanPostData = {
      id: postRef.id,
      userId,

      content: postData.content || '',
      images: cleanImages,

      type: postData.type || 'free',
      price: Number(postData.price) || 0,

      // ✅ required
      contentRating,

      tags: Array.isArray(postData.tags) ? postData.tags.filter(Boolean) : [],

      likes: 0,
      comments: 0,
      shares: 0,
      likedBy: [],

      pinned: !!postData.pinned,
      archived: false,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Locked (subscribers / paid) posts with media are created by the server, so the real file
    // URLs are stored privately from the start and only blurred previews are public.
    if (cleanPostData.type !== 'free' && cleanImages.length > 0) {
      const res = await httpsCallable(functions, 'publishPost', { timeout: 60000 })({
        post: { ...cleanPostData, createdAt: null, updatedAt: null },
      });
      return {
        ...cleanPostData,
        id: res.data.id,
        images: res.data.images,
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
        updatedAt: { seconds: Math.floor(Date.now() / 1000) },
      };
    }

    const finalData = deepClean(cleanPostData);

    console.log('📝 Saving post data:', finalData);
    await setDoc(postRef, finalData);

    return {
      id: postRef.id,
      ...finalData,
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      updatedAt: { seconds: Math.floor(Date.now() / 1000) }
    };
  } catch (error) {
    console.error('❌ Error creating post:', error);
    throw error;
  }
};

/**
 * Get all posts (Feed)
 */
export const getAllPosts = async (limitCount = 20, options = {}) => {
  try {
    const { includeNSFW = true } = options;

    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));

    const querySnapshot = await getDocs(q);
    const posts = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const normalized = {
        id: docSnap.id,
        ...data,
        contentRating: normalizeRating(data?.contentRating)
      };

      if (!includeNSFW && normalized.contentRating === 'nsfw') return;
      posts.push(normalized);
    });

    healPostDates(posts); // fix old posts saved with a broken createdAt
    return posts;
  } catch (error) {
    console.error('❌ Error getting posts:', error);
    throw error;
  }
};

/**
 * Get posts by user ID
 */
export const getUserPosts = async (userId) => {
  try {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, where('userId', '==', userId));

    const querySnapshot = await getDocs(q);
    const posts = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      posts.push({
        id: docSnap.id,
        ...data,
        contentRating: normalizeRating(data?.contentRating)
      });
    });

    const getTimestamp = (p) => getPostMillis(p);


    posts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return getTimestamp(b) - getTimestamp(a);
    });

    healPostDates(posts);
    return posts;
  } catch (error) {
    console.error('❌ Error getting user posts:', error);
    return [];
  }
};

/**
 * Get single post by ID
 */
export const getPostById = async (postId) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) return null;

    const data = postSnap.data();
    return {
      id: postSnap.id,
      ...data,
      contentRating: normalizeRating(data?.contentRating)
    };
  } catch (error) {
    console.error('❌ Error getting post:', error);
    throw error;
  }
};

/**
 * Update a post
 */
export const updatePost = async (postId, updates) => {
  try {
    const postRef = doc(db, 'posts', postId);

    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    if (updateData.contentRating !== undefined) {
      updateData.contentRating = normalizeRating(updateData.contentRating);
    }

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    await updateDoc(postRef, updateData);
    return updateData;
  } catch (error) {
    console.error('❌ Error updating post:', error);
    throw error;
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId) => {
  try {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  } catch (error) {
    console.error('❌ Error deleting post:', error);
    throw error;
  }
};

/**
 * Like a post
 */
export const likePost = async (postId, userId, postOwnerId, userProfile) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error('Post not found');

    const postData = postSnap.data();

    await updateDoc(postRef, {
      likes: increment(1),
      likedBy: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });

    if (userId !== postData.userId) {
      try {
        let actorData = userProfile;
        if (!actorData || !actorData.displayName) {
          const uDoc = await getDoc(doc(db, 'users', userId));
          if (uDoc.exists()) actorData = uDoc.data();
        }
        const postImage = postData.images?.[0]?.url || null;
        await createLikeNotification(userId, postData.userId, actorData, postId, postImage);
      } catch (notifError) {
        console.error('⚠️ Like notification failed:', notifError);
      }
    }
  } catch (error) {
    console.error('❌ Error liking post:', error);
    throw error;
  }
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId, userId) => {
  try {
    const postRef = doc(db, 'posts', postId);

    await updateDoc(postRef, {
      likes: increment(-1),
      likedBy: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Error unliking post:', error);
    throw error;
  }
};

/**
 * Share a post
 */
export const sharePost = async (postId) => {
  try {
    const postRef = doc(db, 'posts', postId);

    await updateDoc(postRef, {
      shares: increment(1),
      updatedAt: serverTimestamp()
    });

    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error('Post not found');
    return postSnap.data();
  } catch (error) {
    console.error('❌ Error sharing post:', error);
    throw error;
  }
};

// In-flight comment cache to prevent duplicate submissions from rapid clicks or enter key repeats
const recentCommentsCache = new Map();

/**
 * Add comment
 */
export const addComment = async (postId, userId, commentText, userProfile) => {
  const trimmed = (commentText || '').trim();
  if (!trimmed) throw new Error('Comment cannot be empty');

  // Prevent duplicate submissions within 3 seconds
  const dedupKey = `${postId}_${userId}_${trimmed.toLowerCase()}`;
  const now = Date.now();
  if (recentCommentsCache.has(dedupKey)) {
    const cached = recentCommentsCache.get(dedupKey);
    if (now - cached.time < 3000) {
      console.warn('⚠️ Duplicate comment submission blocked (in-flight or duplicate within 3s)');
      return cached.result;
    }
  }

  try {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error('Post not found');
    const postData = postSnap.data();

    // Determine commenter tier with creator (PRD 16.2)
    let userTier = null;
    if (userId === postData.userId) {
      userTier = 'creator';
    } else {
      try {
        const subSnap = await getDoc(doc(db, 'subscriptions', `${userId}_${postData.userId}`));
        if (subSnap.exists()) {
          const sub = subSnap.data();
          if (sub.status === 'active') {
            userTier = sub.tier || 'supporter';
          }
        }
      } catch (tierErr) {
        console.warn('Could not fetch commenter tier:', tierErr);
      }
    }

    const commentRef = doc(collection(db, 'posts', postId, 'comments'));

    const comment = {
      id: commentRef.id,
      userId,
      text: trimmed,
      userName: userProfile?.displayName || 'Anonymous',
      userAvatar: userProfile?.avatar || null,
      userTier: userTier || null,
      createdAt: serverTimestamp()
    };

    await setDoc(commentRef, comment);

    await updateDoc(postRef, {
      comments: increment(1),
      updatedAt: serverTimestamp()
    });

    if (userId !== postData.userId) {
      try {
        const postImage = postData.images?.[0]?.url || null;
        await createCommentNotification(userId, postData.userId, userProfile, postId, trimmed, postImage);
      } catch (notifError) {
        console.error('⚠️ Comment notification failed:', notifError);
      }
    }

    const result = { id: commentRef.id, ...comment, createdAt: new Date() };
    recentCommentsCache.set(dedupKey, { time: Date.now(), result });
    if (recentCommentsCache.size > 200) {
      for (const [k, v] of recentCommentsCache) {
        if (Date.now() - v.time > 10000) recentCommentsCache.delete(k);
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    throw error;
  }
};

/**
 * Get comments for a post
 */
export const getPostComments = async (postId) => {
  try {
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const comments = [];

    querySnapshot.forEach((docSnap) => {
      comments.push({ id: docSnap.id, ...docSnap.data() });
    });

    return comments;
  } catch (error) {
    console.error('❌ Error getting comments:', error);
    throw error;
  }
};

/**
 * Real-time subscription to comments for a post
 */
export const subscribeToPostComments = (postId, callback, onError) => {
  if (!postId) return () => {};
  try {
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    return onSnapshot(q, (snapshot) => {
      const comments = [];
      snapshot.forEach((docSnap) => {
        comments.push({ id: docSnap.id, ...docSnap.data() });
      });
      callback(comments);
    }, (error) => {
      console.warn('Real-time comments subscription warning:', error);
      if (onError) onError(error);
    });
  } catch (error) {
    console.error('❌ Error setting up comments subscription:', error);
    return () => {};
  }
};

/**
 * Real-time subscription to a single post document (for instant like/comment count updates)
 */
export const subscribeToPost = (postId, callback, onError) => {
  if (!postId) return () => {};
  try {
    const postRef = doc(db, 'posts', postId);
    return onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() });
      }
    }, (error) => {
      console.warn('Real-time post subscription warning:', error);
      if (onError) onError(error);
    });
  } catch (error) {
    console.error('❌ Error setting up post subscription:', error);
    return () => {};
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (postId, commentId, userId) => {
  try {
    const commentRef = doc(db, 'posts', postId, 'comments', commentId);

    const commentSnap = await getDoc(commentRef);
    if (!commentSnap.exists()) throw new Error('Comment not found');
    if (commentSnap.data().userId !== userId) throw new Error('Not authorized');

    await deleteDoc(commentRef);

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: increment(-1),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Error deleting comment:', error);
    throw error;
  }
};
