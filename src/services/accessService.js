import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { hasActiveSubscription } from './messageService';

export const canUserAccessPost = async (userId, post) => {
  if (!post) return false;

  // Free posts
  if (post.type === 'free') return true;

  // Creator can always see their own content
  if (post.userId === userId) return true;

  // Subscriber-only posts
  if (post.type === 'subscribers') {
    return await hasActiveSubscription(userId, post.userId);
  }

  // Paid posts (PPV)
  if (post.type === 'paid') {
    const q = query(
      collection(db, 'post_unlocks'),
      where('userId', '==', userId),
      where('postId', '==', post.id)
    );

    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  return false;
};
