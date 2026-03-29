# Firestore Database Schema - Unlukt

## Core Collections

### `users` (User Profiles)
```javascript
{
  uid: string,
  username: string,
  displayName: string,
  email: string,
  avatar: string,
  bio: string,
  banner: string,
  subscriptionPrice: number, // deprecated - use creator_tiers
  profileCompleted: boolean,
  kycStatus: 'none' | 'pending' | 'approved' | 'rejected',
  role: 'user' | 'creator' | 'admin',
  isCreator: boolean,
  isAdmin: boolean,
  showNSFW: boolean,
  followersCount: number,
  followingCount: number,
  noShowStrikes: number,
  callsSuspended: boolean,
  createdAt: timestamp,
  updatedAt: timestamp,
  isOnline: boolean,
  lastSeen: timestamp
}
```

### `creator_tiers` (3-Tier Membership System)
```javascript
{
  creatorId: string,
  enabled: boolean,
  supporter: {
    name: 'Supporter',
    price: number,
    duration: 'daily' | 'weekly' | 'monthly',
    benefits: string[],
    level: 1
  },
  vip: {
    name: 'VIP',
    price: number,
    duration: 'daily' | 'weekly' | 'monthly',
    benefits: string[],
    level: 2
  },
  superfan: {
    name: 'Superfan',
    price: number,
    duration: 'daily' | 'weekly' | 'monthly',
    benefits: string[],
    level: 3
  },
  updatedAt: timestamp
}
```

### `subscriptions` (User Subscriptions)
```javascript
{
  userId: string,
  creatorId: string,
  tier: 'supporter' | 'vip' | 'superfan',
  duration: 'daily' | 'weekly' | 'monthly',
  amount: number,
  status: 'active' | 'expired' | 'cancelled',
  paymentId: string,
  paymentType: 'crypto',
  startedAt: timestamp,
  expiresAt: timestamp,
  createdAt: timestamp
}
```

### `posts` (Content Feed)
```javascript
{
  id: string,
  userId: string,
  content: string,
  images: [{ url, type, width, height }],
  type: 'free' | 'paid',
  price: number,
  contentRating: 'sfw' | 'nsfw',
  tags: string[],
  likes: number,
  comments: number,
  shares: number,
  likedBy: string[],
  pinned: boolean,
  archived: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### `creator_availability` (Call Availability)
```javascript
{
  creatorId: string,
  status: 'available' | 'busy' | 'offline',
  videoCallPrice: number, // min $10
  voiceCallPrice: number, // min $5
  callsEnabled: boolean,
  lastUpdated: timestamp
}
```

### `video_calls` (Call Bookings)
```javascript
{
  id: string,
  fanId: string,
  creatorId: string,
  type: 'video' | 'voice',
  price: number,
  duration: 30, // minutes
  status: 'pending_payment' | 'awaiting_payment' | 'confirmed' | 'in_progress' | 'completed' | 'no_show',
  scheduledTime: timestamp,
  paymentId: string,
  channelName: string,
  creatorJoined: boolean,
  startedAt: timestamp,
  endedAt: timestamp,
  refundRequested: boolean,
  createdAt: timestamp
}
```

### `conversations` (DM Conversations)
```javascript
{
  id: string,
  participants: [userId1, userId2],
  participantDetails: {
    userId1: { displayName, avatar, username },
    userId2: { displayName, avatar, username }
  },
  lastMessage: { text, createdAt, senderId },
  unreadCount: { userId1: number, userId2: number },
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### `conversations/{id}/messages` (Messages Subcollection)
```javascript
{
  senderId: string,
  content: string,
  mediaUrl: string,
  mediaType: 'text' | 'image' | 'video',
  isPPV: boolean, // Pay-per-view locked message
  unlockPrice: number,
  unlockedBy: string[], // userIds who unlocked
  readBy: string[],
  createdAt: timestamp
}
```

### `ppv_unlocks` (PPV Message Unlocks)
```javascript
{
  conversationId: string,
  messageId: string,
  userId: string,
  creatorId: string,
  amount: number,
  status: 'pending_payment' | 'completed',
  createdAt: timestamp,
  unlockedAt: timestamp
}
```

### `crypto_payments` (USDT Payments)
```javascript
{
  reference: string,
  userId: string,
  userEmail: string,
  userName: string,
  contentId: string,
  contentType: 'subscription' | 'unlock' | 'tip' | 'video_call' | 'ppv_message',
  creatorId: string,
  amount: number,
  baseAmount: number, // before VAT
  vatAmount: number,
  vatPercentage: number,
  userCountry: string,
  currency: 'USD',
  cryptoCurrency: 'USDT',
  network: 'TRC20',
  paymentMethod: 'crypto_usdt',
  status: 'pending_payment' | 'pending_verification' | 'verified' | 'rejected',
  adminWalletAddress: string,
  userProofUrl: string,
  transactionHash: string,
  verificationStatus: 'pending' | 'pending_review' | 'verified' | 'rejected',
  verifiedBy: string,
  verifiedAt: timestamp,
  createdAt: timestamp,
  expiresAt: timestamp
}
```

### `communities` (Telegram-style Communities)
```javascript
{
  id: string,
  creatorId: string,
  name: string,
  description: string,
  coverImage: string,
  price: number,
  memberCount: number,
  isPrivate: boolean,
  category: string,
  rules: string[],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### `community_members` (Community Subscriptions)
```javascript
{
  communityId: string,
  userId: string,
  role: 'member' | 'moderator',
  subscriptionStatus: 'active' | 'expired',
  subscriptionEnd: timestamp,
  joinedAt: timestamp,
  lastActive: timestamp
}
```

### `unlocked_content` (Single Post Unlocks)
```javascript
{
  userId: string,
  contentId: string,
  creatorId: string,
  paymentId: string,
  amount: number,
  paymentType: 'crypto',
  unlockedAt: timestamp
}
```

### `creator_balances` (Creator Earnings)
```javascript
{
  creatorId: string,
  availableBalance: number, // can withdraw
  pendingBalance: number, // locked for 3-5 days
  totalEarnings: number,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### `payout_requests` (Creator Withdrawals)
```javascript
{
  creatorId: string,
  amount: number,
  method: 'crypto',
  status: 'pending' | 'reviewing' | 'approved' | 'paid' | 'rejected',
  requestedAt: timestamp,
  paidAt: timestamp,
  holdUntil: timestamp, // fraud check period
  walletAddress: string,
  txHash: string
}
```

### `ngn_payments` (Nigerian Bank Transfer Payments) ✅ NEW
```javascript
{
  userId: string,
  userEmail: string,
  amountUSD: number,          // USD amount requested
  amountNGN: number,          // NGN equivalent shown to user
  reference: string,          // e.g. UNLUKT-ABC123-XY45
  proofUrl: string,           // Firebase Storage URL of screenshot
  status: 'pending' | 'approved' | 'rejected',
  bankName: string,           // e.g. 'Opay'
  accountNo: string,          // your account number
  adminNote: string,          // optional rejection reason
  reviewedBy: string,         // admin uid
  reviewedAt: timestamp,
  createdAt: timestamp
}
```

### `settings` (Platform-wide Config) ✅ NEW
```javascript
// Document ID: 'ngn_rate'
{
  rate: number,       // base NGN per $1 USD (e.g. 1550)
  buffer: number,     // extra NGN added on top (e.g. 25)
  effective: number,  // rate + buffer (cached for quick reads)
  updatedAt: timestamp
}
```

### `notifications` (User Notifications)
```javascript
{
  userId: string,
  type: 'like' | 'comment' | 'follow' | 'subscription' | 'payment_verified',
  message: string,
  fromUserId: string,
  contentId: string,
  read: boolean,
  createdAt: timestamp
}
```

## Indexes Needed

```javascript
// users
- username (ASC)
- email (ASC)
- kycStatus (ASC)

// subscriptions
- userId, status (ASC)
- creatorId, status (ASC)
- expiresAt (ASC)

// posts
- userId, createdAt (DESC)
- contentRating, createdAt (DESC)

// video_calls
- fanId, status (ASC)
- creatorId, status (ASC)
- status, scheduledTime (ASC)

// crypto_payments
- userId, status (ASC)
- verificationStatus (ASC)
- status, createdAt (DESC)

// conversations
- participants (array-contains)

// communities
- category, memberCount (DESC)
// ngn_payments
- userId, status (ASC)
- status, createdAt (DESC)

// settings
// No indexes needed (single document reads)
```

## Deprecated/Unused Collections

- ❌ `payments` (replaced by crypto_payments)
- ❌ `subscriptions` without tier field (update existing)
