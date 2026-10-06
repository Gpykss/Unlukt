import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-unlukt',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users/alice'), { username: 'alice', isCreator: true, kycStatus: 'approved' });
    await setDoc(doc(db, 'users/bob'), { username: 'bob' });
    await setDoc(doc(db, 'users/admin'), { username: 'admin', isAdmin: true });
    await setDoc(doc(db, 'users/amb'), { username: 'amb', role: 'ambassador', referralCode: 'AMB1' });
    await setDoc(doc(db, 'posts/p1'), { userId: 'alice', type: 'paid', price: 10, likes: 0, likedBy: [], createdAt: Timestamp.now() });
    await setDoc(doc(db, 'conversations/c1'), { participants: ['alice', 'admin'] });
    await setDoc(doc(db, 'conversations/c1/messages/m1'), { senderId: 'alice', price: 5, mediaUrl: 'x' });
    await setDoc(doc(db, 'call_bookings/b1'), { userId: 'bob', creatorId: 'alice', price: 20, status: 'confirmed', scheduledAt: Timestamp.now() });
    await setDoc(doc(db, 'call_bookings/b2'), { userId: 'bob', creatorId: 'alice', price: 20, status: 'confirmed', scheduledAt: Timestamp.fromMillis(Date.now() + 3 * 3600e3) });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'alice', read: false });
    await setDoc(doc(db, 'kyc/alice'), { userId: 'alice', idNumber: '123' });
    await setDoc(doc(db, 'crypto_payments/cp1'), { userId: 'bob', amount: 5, status: 'pending_payment' });
    await setDoc(doc(db, 'user_balances/bob'), { balance: 10 });
    await setDoc(doc(db, 'creator_balances/alice'), { availableBalance: 50 });
    await setDoc(doc(db, 'subscriptions/bob_alice'), { userId: 'bob', creatorId: 'alice', status: 'active' });
    await setDoc(doc(db, 'communities/com1'), { creatorId: 'alice', isPrivate: false });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('privilege escalation', () => {
  it('user cannot make themselves admin', () => assertFails(updateDoc(doc(as('bob'), 'users/bob'), { isAdmin: true })));
  it('user cannot approve own KYC', () => assertFails(updateDoc(doc(as('bob'), 'users/bob'), { kycStatus: 'approved' })));
  it('user cannot become ambassador', () => assertFails(updateDoc(doc(as('bob'), 'users/bob'), { role: 'ambassador' })));
  it('user cannot create self as admin', () => assertFails(setDoc(doc(as('carl'), 'users/carl'), { username: 'c', isAdmin: true })));
  it('normal signup works', () => assertSucceeds(setDoc(doc(as('carl'), 'users/carl'), { username: 'c', role: 'user', kycStatus: 'none' })));
  it('user can edit normal profile fields', () => assertSucceeds(updateDoc(doc(as('bob'), 'users/bob'), { bio: 'hi', displayName: 'Bob', is_live: true, scheduledLive: null })));
  it('user can become creator + submit KYC (pending)', () => assertSucceeds(updateDoc(doc(as('bob'), 'users/bob'), { isCreator: true, role: 'creator', kycStatus: 'pending' })));
  it('user can set referredBy to an ambassador', () => assertSucceeds(updateDoc(doc(as('bob'), 'users/bob'), { referredBy: 'amb' })));
  it('user cannot refer to a non-ambassador alt', () => assertFails(updateDoc(doc(as('bob'), 'users/bob'), { referredBy: 'alice' })));
  it('signup with ambassador referral works', () => assertSucceeds(setDoc(doc(as('dan'), 'users/dan'), { username: 'd', role: 'user', referredBy: 'amb' })));
  it('signup cannot steal a referral code', () => assertFails(setDoc(doc(as('eve'), 'users/eve'), { username: 'e', referralCode: 'AMB1' })));
  it('KYC submit marks pending + removes old inline data', () => assertSucceeds(updateDoc(doc(as('bob'), 'users/bob'), { kycStatus: 'pending', kycSubmittedAt: Timestamp.now() })));
  it('user cannot reset createdAt (referral window)', () => assertFails(updateDoc(doc(as('bob'), 'users/bob'), { createdAt: Timestamp.now() })));
  it('admin can approve KYC', () => assertSucceeds(updateDoc(doc(as('admin'), 'users/bob'), { kycStatus: 'approved', role: 'creator' })));
  it('others can bump follower counters by one', () => assertSucceeds(updateDoc(doc(as('bob'), 'users/alice'), { followerCount: 1 })));
  it('nobody can jump follower counts', () => assertFails(updateDoc(doc(as('bob'), 'users/alice'), { followerCount: 1000 })));
  it('owner cannot fake own followers', () => assertFails(updateDoc(doc(as('alice'), 'users/alice'), { followers: 5000 })));
  it('subscriber count is server-only', () => assertFails(updateDoc(doc(as('bob'), 'users/alice'), { subscribersCount: 1 })));
  it('owner cannot set own subscriber count', () => assertFails(updateDoc(doc(as('alice'), 'users/alice'), { subscribersCount: 999 })));
});

describe('KYC privacy', () => {
  it('public cannot read KYC', () => assertFails(getDoc(doc(anon(), 'kyc/alice'))));
  it('other user cannot read KYC', () => assertFails(getDoc(doc(as('bob'), 'kyc/alice'))));
  it('owner reads own KYC', () => assertSucceeds(getDoc(doc(as('alice'), 'kyc/alice'))));
  it('admin reads KYC', () => assertSucceeds(getDoc(doc(as('admin'), 'kyc/alice'))));
  it('owner submits KYC', () => assertSucceeds(setDoc(doc(as('bob'), 'kyc/bob'), { userId: 'bob', idNumber: '9' })));
});

describe('contact privacy', () => {
  it('public cannot read emails', () => assertFails(getDoc(doc(anon(), 'user_private/alice'))));
  it('other users cannot read emails', () => assertFails(getDoc(doc(as('bob'), 'user_private/alice'))));
  it('owner saves own email', () => assertSucceeds(setDoc(doc(as('bob'), 'user_private/bob'), { email: 'b@x.com' })));
});

describe('posts', () => {
  it('stranger cannot change price', () => assertFails(updateDoc(doc(as('bob'), 'posts/p1'), { price: 0 })));
  it('stranger cannot hijack post', () => assertFails(updateDoc(doc(as('bob'), 'posts/p1'), { userId: 'bob' })));
  it('locked post with media must go through the server', () => assertFails(setDoc(doc(as('alice'), 'posts/p9'), { userId: 'alice', type: 'paid', price: 5, images: [{ url: 'https://x/y.jpg' }] })));
  it('free post with media ok', () => assertSucceeds(setDoc(doc(as('alice'), 'posts/p8'), { userId: 'alice', type: 'free', images: [{ url: 'https://x/y.jpg' }] })));
  it('owner cannot swap media on a locked post', () => assertFails(updateDoc(doc(as('alice'), 'posts/p1'), { images: [{ url: 'https://x/z.jpg' }] })));
  it('stranger can like', () => assertSucceeds(updateDoc(doc(as('bob'), 'posts/p1'), { likes: 1, likedBy: ['bob'] })));
  it('owner edits post', () => assertSucceeds(updateDoc(doc(as('alice'), 'posts/p1'), { price: 12 })));
  it('stranger cannot rewrite valid createdAt', () => assertFails(updateDoc(doc(as('bob'), 'posts/p1'), { createdAt: Timestamp.now() })));
});

describe('private data', () => {
  it('cannot read others conversation', () => assertFails(getDoc(doc(as('bob'), 'conversations/c1'))));
  it('participant reads conversation', () => assertSucceeds(getDoc(doc(as('admin'), 'conversations/c1'))));
  it('can check a not-yet-created conversation', () => assertSucceeds(getDoc(doc(as('bob'), 'conversations/new1'))));
  it('participant cannot change who gets paid', () => assertFails(updateDoc(doc(as('admin'), 'conversations/c1'), { creatorId: 'admin' })));
  it('cannot list others notifications', () => assertFails(getDocs(collection(as('bob'), 'notifications'))));
  it('fake payment notification blocked', () => assertFails(addDoc(collection(as('bob'), 'notifications'), { userId: 'alice', type: 'payment_verified', message: 'You got $500' })));
  it('like notification as yourself ok', () => assertSucceeds(addDoc(collection(as('bob'), 'notifications'), { userId: 'alice', type: 'like', actorId: 'bob', message: 'liked' })));
  it('can list own notifications', () => assertSucceeds(getDocs(query(collection(as('alice'), 'notifications'), where('userId', '==', 'alice')))));
  it('PPV must be sent through the server', () => assertFails(addDoc(collection(as('alice'), 'conversations/c1/messages'), { senderId: 'alice', isPPV: true, mediaUrl: 'https://x/y.jpg' })));
  it('sender cannot change PPV price after sending', () => assertFails(updateDoc(doc(as('alice'), 'conversations/c1/messages/m1'), { price: 1 })));
  it('recipient cannot change PPV price', () => assertFails(updateDoc(doc(as('admin'), 'conversations/c1/messages/m1'), { price: 0 })));
  it('recipient marks read', () => assertSucceeds(updateDoc(doc(as('admin'), 'conversations/c1/messages/m1'), { read: true })));
});

describe('money docs', () => {
  it('booking price cannot be changed', () => assertFails(updateDoc(doc(as('bob'), 'call_bookings/b1'), { price: 0 })));
  it('booking status can be changed by party', () => assertSucceeds(updateDoc(doc(as('alice'), 'call_bookings/b1'), { status: 'in_progress', creatorEnteredCallAt: Timestamp.now() })));
  it('creator cannot "complete" a call that never started', () => assertFails(updateDoc(doc(as('alice'), 'call_bookings/b1'), { status: 'completed' })));
  it('call cannot start hours early', () => assertFails(updateDoc(doc(as('alice'), 'call_bookings/b2'), { status: 'in_progress' })));
  it("creator cannot mark the fan as joined", () => assertFails(updateDoc(doc(as('alice'), 'call_bookings/b1'), { userEnteredCallAt: Timestamp.now() })));
  it('party cannot mark a booking refunded', () => assertFails(updateDoc(doc(as('bob'), 'call_bookings/b1'), { status: 'refunded' })));
  it('nobody books a call from the browser', () => assertFails(setDoc(doc(as('bob'), 'call_bookings/new'), { userId: 'bob', creatorId: 'alice', price: 0, status: 'confirmed' })));
  it('stranger cannot list bookings', () => assertFails(getDocs(query(collection(as('carl'), 'call_bookings'), where('creatorId', '==', 'alice')))));
  it('creator lists own bookings', () => assertSucceeds(getDocs(query(collection(as('alice'), 'call_bookings'), where('creatorId', '==', 'alice')))));
  it('crypto payment cannot be forged', () => assertFails(setDoc(doc(as('bob'), 'crypto_payments/f1'), { userId: 'bob', reference: 'X', contentType: 'unlock' })));
  it('crypto payment not editable by user', () => assertFails(updateDoc(doc(as('bob'), 'crypto_payments/cp1'), { contentType: 'unlock' })));
  it('NGN payment cannot be created as approved', () => assertFails(setDoc(doc(as('bob'), 'ngn_payments/x'), { userId: 'bob', status: 'approved', amount: 100 })));
  it('NGN payment created pending', () => assertSucceeds(setDoc(doc(as('bob'), 'ngn_payments/y'), { userId: 'bob', status: 'pending', amount: 100 })));
 it('user cannot set own balance', () => assertFails(updateDoc(doc(as('bob'), 'user_balances/bob'), { balance: 1000000 })));
  it('creator cannot set own earnings', () => assertFails(updateDoc(doc(as('alice'), 'creator_balances/alice'), { availableBalance: 1000000 })));
  it('user reads own balance', () => assertSucceeds(getDoc(doc(as('bob'), 'user_balances/bob'))));
  it("user cannot read others' balance", () => assertFails(getDoc(doc(as('carl'), 'user_balances/bob'))));
  it('admin can correct a balance', () => assertSucceeds(updateDoc(doc(as('admin'), 'user_balances/bob'), { balance: 12 })));
  it('free subscription cannot be self-created', () => assertFails(setDoc(doc(as('carl'), 'subscriptions/carl_alice'), { userId: 'carl', creatorId: 'alice', status: 'active' })));
  it('fan can cancel subscription', () => assertSucceeds(updateDoc(doc(as('bob'), 'subscriptions/bob_alice'), { status: 'cancelled' })));
  it('fan cannot extend subscription', () => assertFails(updateDoc(doc(as('bob'), 'subscriptions/bob_alice'), { expiresAt: Timestamp.now() })));
  it('community membership cannot be self-created', () => assertFails(setDoc(doc(as('bob'), 'community_members/bob_com1'), { userId: 'bob', communityId: 'com1', subscriptionStatus: 'active' })));
  it('PPV cannot be self-unlocked', () => assertFails(updateDoc(doc(as('admin'), 'conversations/c1/messages/m1'), { unlockedBy: ['admin'] })));
  it('fake live tip blocked', () => assertFails(addDoc(collection(as('bob'), 'livestream_rooms/alice/messages'), { userId: 'bob', type: 'tip', amount: 100 })));
  it('ambassador balance cannot be self-set', () => assertFails(updateDoc(doc(as('amb'), 'users/amb'), { ambassadorBalance: 500 })));
  it('negative tip rejected', () => assertFails(setDoc(doc(as('bob'), 'tips/t1'), { fromUserId: 'bob', toCreatorId: 'alice', amount: -50 })));
  it('payout requests only via the server', () => assertFails(setDoc(doc(as('alice'), 'payout_requests/r1'), { creatorId: 'alice', status: 'pending', amount: 10 })));
  it('live message must be from you', () => assertFails(addDoc(collection(as('bob'), 'livestream_rooms/alice/messages'), { userId: 'alice', type: 'tip', amount: 100 })));
  it('live message from you ok', () => assertSucceeds(addDoc(collection(as('bob'), 'livestream_rooms/alice/messages'), { userId: 'bob', type: 'chat', text: 'hi' })));
});
