// src/services/searchService.js

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  or
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Search for users by username or display name
 */
export const searchUsers = async (searchQuery) => {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const searchLower = searchQuery.toLowerCase().trim();
    const usersRef = collection(db, 'users');
    
    // Search by username
    const usernameQuery = query(
      usersRef,
      where('username', '>=', searchLower),
      where('username', '<=', searchLower + '\uf8ff'),
      limit(20)
    );
    
    const usernameSnapshot = await getDocs(usernameQuery);
    const users = new Map();
    
    usernameSnapshot.docs.forEach(doc => {
      users.set(doc.id, { id: doc.id, uid: doc.id, ...doc.data() });
    });
    
    // Also search by display name if you want
    try {
      const nameQuery = query(
        usersRef,
        where('displayName', '>=', searchQuery),
        where('displayName', '<=', searchQuery + '\uf8ff'),
        limit(20)
      );
      
      const nameSnapshot = await getDocs(nameQuery);
      nameSnapshot.docs.forEach(doc => {
        if (!users.has(doc.id)) {
          users.set(doc.id, { id: doc.id, uid: doc.id, ...doc.data() });
        }
      });
    } catch (error) {
      console.log('Display name search skipped:', error.message);
    }
    
    return Array.from(users.values());
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};

/**
 * Search for posts by caption or tags
 */
export const searchPosts = async (searchQuery) => {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const searchLower = searchQuery.toLowerCase().trim();
    const postsRef = collection(db, 'posts');
    
    // Search by caption
    const captionQuery = query(
      postsRef,
      where('caption', '>=', searchLower),
      where('caption', '<=', searchLower + '\uf8ff'),
      orderBy('caption'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    
    const snapshot = await getDocs(captionQuery);
    const posts = snapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));
    
    return posts;
  } catch (error) {
    console.error('Error searching posts:', error);
    return [];
  }
};

/**
 * Search for hashtags
 */
export const searchTags = async (searchQuery) => {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const searchLower = searchQuery.toLowerCase().trim().replace('#', '');
    const tagsRef = collection(db, 'tags');
    
    const q = query(
      tagsRef,
      where('name', '>=', searchLower),
      where('name', '<=', searchLower + '\uf8ff'),
      orderBy('name'),
      orderBy('count', 'desc'),
      limit(20)
    );
    
    const snapshot = await getDocs(q);
    const tags = snapshot.docs.map(doc => ({ 
      id: doc.id, 
      tag: doc.data().name,
      posts: doc.data().count || 0
    }));
    
    return tags;
  } catch (error) {
    console.error('Error searching tags:', error);
    return [];
  }
};

/**
 * Get trending hashtags
 */
export const getTrendingTags = async (limitCount = 10) => {
  try {
    const tagsRef = collection(db, 'tags');
    const q = query(
      tagsRef,
      orderBy('count', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const tags = snapshot.docs.map(doc => ({
      id: doc.id,
      tag: doc.data().name,
      posts: doc.data().count || 0,
      growth: '+' + Math.floor(Math.random() * 20) + '%' // Mock growth for now
    }));
    
    return tags;
  } catch (error) {
    console.error('Error getting trending tags:', error);
    return [];
  }
};

/**
 * Search everything (users, posts, tags)
 */
export const searchAll = async (searchQuery) => {
  try {
    const [users, posts, tags] = await Promise.all([
      searchUsers(searchQuery),
      searchPosts(searchQuery),
      searchTags(searchQuery)
    ]);
    
    return {
      creators: users,
      posts: posts,
      tags: tags
    };
  } catch (error) {
    console.error('Error searching all:', error);
    return {
      creators: [],
      posts: [],
      tags: []
    };
  }
};
