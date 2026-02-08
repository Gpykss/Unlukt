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
  arrayRemove
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  createLikeNotification,
  createCommentNotification 
} from './notificationService';

// ==========================================
// POST OPERATIONS
// ==========================================

/**
 * Create a new post
 */
export const createPost = async (userId, postData) => {
  try {
    const postRef = doc(collection(db, 'posts'));
    
    // Deep clean function to remove undefined values
    const deepClean = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => deepClean(item)).filter(item => item !== undefined);
      }
      if (obj && typeof obj === 'object') {
        const cleaned = {};
        Object.keys(obj).forEach(key => {
          const value = deepClean(obj[key]);
          if (value !== undefined) {
            cleaned[key] = value;
          }
        });
        return cleaned;
      }
      return obj;
    };
    
    // Clean the images array
    const cleanImages = (postData.images || []).map(img => {
      if (typeof img === 'string') {
        return { url: img, type: 'image' };
      }
      return {
        url: img.url || '',
        type: img.type || img.resourceType || 'image',
        publicId: img.publicId || '',
        width: img.width || 0,
        height: img.height || 0,
        duration: img.duration || null
      };
    }).filter(img => img.url);
    
    // Build clean post data
    const cleanPostData = {
      id: postRef.id,
      userId: userId,
      content: postData.content || '',
      images: cleanImages,
      type: postData.type || 'free',
      price: Number(postData.price) || 0,
      tags: Array.isArray(postData.tags) ? postData.tags.filter(Boolean) : [],
      likes: 0,
      comments: 0,
      shares: 0,
      likedBy: [],
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    // Deep clean to remove any nested undefined values
    const finalData = deepClean(cleanPostData);
    
    console.log('📝 Saving post data:', finalData);
    
    await setDoc(postRef, finalData);
    console.log('✅ Post created successfully');
    
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
export const getAllPosts = async (limitCount = 20) => {
  try {
    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const posts = [];
    
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    
    return posts;
  } catch (error) {
    console.error('❌ Error getting posts:', error);
    throw error;
  }
};

/**
 * Get posts by user ID (without index requirement)
 */
export const getUserPosts = async (userId) => {
  try {
    console.log('🔍 Fetching posts for user:', userId);
    
    const postsRef = collection(db, 'posts');
    
    const q = query(
      postsRef,
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const posts = [];
    
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    
    // Helper function to get timestamp
    const getTimestamp = (post) => {
      if (!post.createdAt) return 0;
      if (post.createdAt.toDate && typeof post.createdAt.toDate === 'function') {
        return post.createdAt.toDate().getTime();
      }
      if (post.createdAt.seconds) {
        return post.createdAt.seconds * 1000;
      }
      if (post.createdAt instanceof Date) {
        return post.createdAt.getTime();
      }
      if (typeof post.createdAt === 'number') {
        return post.createdAt;
      }
      return 0;
    };
    
    // Sort: Pinned posts first, then by date (newest first)
    posts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return getTimestamp(b) - getTimestamp(a);
    });
    
    console.log(`✅ Found ${posts.length} posts for user ${userId}`);
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
    
    if (postSnap.exists()) {
      return { id: postSnap.id, ...postSnap.data() };
    } else {
      return null;
    }
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
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    await updateDoc(postRef, updateData);
    console.log('✅ Post updated successfully');
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
    console.log('✅ Post deleted successfully');
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
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postSnap.data();
    
    await updateDoc(postRef, {
      likes: increment(1),
      likedBy: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Post liked');
    
    // ✅ CREATE NOTIFICATION - Only if not liking own post
    if (userId !== postData.userId) {
      try {
        const postImage = postData.images?.[0]?.url || null;
        await createLikeNotification(
          userId,
          postData.userId,
          userProfile,
          postId,
          postImage
        );
        console.log('✅ Like notification created');
      } catch (notifError) {
        console.error('⚠️ Failed to create notification (non-critical):', notifError);
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
    
    console.log('✅ Post unliked');
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
    
    console.log('✅ Post shared');
    
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    return postSnap.data();
  } catch (error) {
    console.error('❌ Error sharing post:', error);
    throw error;
  }
};

/**
 * Add comment to post - WITH NOTIFICATION
 */
export const addComment = async (postId, userId, commentText, userProfile) => {
  try {
    const commentRef = doc(collection(db, 'posts', postId, 'comments'));
    
    const comment = {
      id: commentRef.id,
      userId: userId,
      text: commentText,
      userName: userProfile?.displayName || 'Anonymous',
      userAvatar: userProfile?.avatar || null,
      createdAt: serverTimestamp()
    };
    
    // Save comment first
    await setDoc(commentRef, comment);
    console.log('✅ Comment saved to subcollection');
    
    // Get post data for notification
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postSnap.data();
    
    // Increment comment count on post
    await updateDoc(postRef, {
      comments: increment(1),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Comment count updated');
    
    // ✅ CREATE NOTIFICATION - Only if not commenting on own post
    if (userId !== postData.userId) {
      try {
        const postImage = postData.images?.[0]?.url || null;
        await createCommentNotification(
          userId,
          postData.userId,
          userProfile,
          postId,
          commentText,
          postImage
        );
        console.log('✅ Comment notification created');
      } catch (notifError) {
        console.error('⚠️ Failed to create notification (non-critical):', notifError);
      }
    }
    
    return { id: commentRef.id, ...comment, createdAt: new Date() };
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    console.error('Error details:', error.message);
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
    
    querySnapshot.forEach((doc) => {
      comments.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Loaded ${comments.length} comments for post ${postId}`);
    return comments;
  } catch (error) {
    console.error('❌ Error getting comments:', error);
    throw error;
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (postId, commentId, userId) => {
  try {
    const commentRef = doc(db, 'posts', postId, 'comments', commentId);
    
    const commentSnap = await getDoc(commentRef);
    if (!commentSnap.exists()) {
      throw new Error('Comment not found');
    }
    
    if (commentSnap.data().userId !== userId) {
      throw new Error('Not authorized to delete this comment');
    }
    
    await deleteDoc(commentRef);
    
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: increment(-1),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Comment deleted');
  } catch (error) {
    console.error('❌ Error deleting comment:', error);
    throw error;
  }
};
