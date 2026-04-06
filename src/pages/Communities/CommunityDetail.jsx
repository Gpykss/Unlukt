// src/pages/Communities/CommunityDetail.jsx

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Lock, Globe, Settings, UserPlus,
  Send, Loader2, MoreVertical, X, Crown, Heart,
  Play, Wallet, AlertCircle, CheckCircle, MessageCircle,
  PlusCircle, Camera, Film, Image as ImageIcon
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import {
  getCommunity, getCommunityMembers, getCommunityPosts,
  joinCommunity, leaveCommunity, isCommunityMember, createCommunityPost,
  likeCommunityPost, addCommunityPostComment, getCommunityPostComments
} from '../../services/communityService';
import { uploadToBunny } from '../../services/bunnyUpload.service';
import { getUserProfile } from '../../services/firestoreService';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { doc, updateDoc, setDoc, serverTimestamp, collection, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';

// ✅ Watermark component — same as PostModal
function DiagonalWatermark({ username }) {
  if (!username) return null;
  const text = `@${username}`;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10">
      <svg className="w-full h-full opacity-[0.15]" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <text key={i} x="50%" y={`${10 + i * 16}%`}
            textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-35, 50%, ${10 + i * 16}%)`}
            fill="white" fontSize="13" fontWeight="bold" fontFamily="monospace" letterSpacing="2">
            {text}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function CommunityDetail() {
  const navigate = useNavigate();
  const { communityId } = useParams();
  const { currentUser } = useAuth();
  const fileInputRef = useRef();
  const textareaRef = useRef();

  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');

  const [postContent, setPostContent] = useState('');
  const [postMedia, setPostMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinType, setJoinType] = useState('monthly');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

  const isOwner = community && currentUser && community.creatorId === currentUser.uid;
  const isFree = community?.isPrivate === false;
  const canPost = isOwner || (isMember && community?.membersCanPost === true);
  const canView = isOwner || isMember || isFree;

  useEffect(() => { loadData(); }, [communityId, currentUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      const communityData = await getCommunity(communityId);
      if (!communityData) { navigate('/communities'); return; }
      setCommunity(communityData);

      if (currentUser) {
        const [memberStatus, bal] = await Promise.all([
          isCommunityMember(currentUser.uid, communityId),
          getWalletBalance(currentUser.uid)
        ]);
        setIsMember(memberStatus);
        setWalletBalance(bal);

        if (memberStatus || communityData.creatorId === currentUser.uid || communityData.isPrivate === false) {
          const [postsData, membersData] = await Promise.all([
            getCommunityPosts(communityId),
            getCommunityMembers(communityId)
          ]);
          setPosts(postsData);
          setMembers(membersData);
        }
      }
    } catch (e) {
      console.error('Error loading community:', e);
    } finally {
      setLoading(false);
    }
  };

  const getJoinPrice = () => {
    if (joinType === 'monthly') return community?.price || 9.99;
    return community?.oneTimePrice || (community?.price || 9.99) * 3;
  };

  const handleJoin = async () => {
    if (!currentUser) { navigate('/login'); return; }
    setJoinError('');
    const price = getJoinPrice();
    if (walletBalance < price) {
      setJoinError(`Insufficient balance ($${walletBalance.toFixed(2)}). Need $${price.toFixed(2)}.`);
      return;
    }
    try {
      setJoining(true);
      await deductFromWallet(currentUser.uid, price, `Community join: ${community.name}`, {
        contentType: 'community_join', communityId, joinType, creatorId: community.creatorId,
      });
      const subscriptionEnd = joinType === 'monthly' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
      await joinCommunity(currentUser.uid, communityId, { subscriptionEnd });

      const earning = price * 0.85;
      const creatorBalRef = doc(db, 'creator_balances', community.creatorId);
      const month = new Date().toLocaleString('default', { month: 'short' });
      try {
        await updateDoc(creatorBalRef, { availableBalance: increment(earning), totalEarnings: increment(earning), [`monthlyEarnings.${month}`]: increment(earning), updatedAt: serverTimestamp() });
      } catch {
        await setDoc(creatorBalRef, { creatorId: community.creatorId, availableBalance: earning, totalEarnings: earning, monthlyEarnings: { [month]: earning }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }

      setIsMember(true);
      setShowJoinModal(false);
      const [postsData, membersData] = await Promise.all([getCommunityPosts(communityId), getCommunityMembers(communityId)]);
      setPosts(postsData);
      setMembers(membersData);
    } catch (e) {
      setJoinError(e.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this community?')) return;
    try {
      await leaveCommunity(currentUser.uid, communityId);
      setIsMember(false);
      navigate('/communities');
    } catch { alert('Failed to leave'); }
  };

  const handleMediaUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (postMedia.length + files.length > 4) { alert('Max 4 files'); return; }
    try {
      setUploading(true);
      const results = await Promise.all(files.map(f => uploadToBunny(f, { folder: 'community-posts', contentType: 'media' })));
      const newMedia = results.map((r, i) => ({ url: r.cdnUrl, type: files[i].type.startsWith('video') ? 'video' : 'image' }));
      setPostMedia(prev => [...prev, ...newMedia]);
    } catch { alert('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleCreatePost = async () => {
    if (!postContent.trim() && postMedia.length === 0) return;
    try {
      setPosting(true);
      await createCommunityPost(communityId, currentUser.uid, {
        content: postContent,
        images: postMedia.filter(m => m.type === 'image').map(m => m.url),
        videos: postMedia.filter(m => m.type === 'video').map(m => m.url),
      });
      const postsData = await getCommunityPosts(communityId);
      setPosts(postsData);
      setPostContent('');
      setPostMedia([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e) {
      alert('Failed to post: ' + e.message);
    } finally {
      setPosting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
    </div>
  );

  if (!community) return null;

  const memberCount = members.length || community.memberCount || 0;

  return (
    <div className={`min-h-screen bg-gray-50 ${canPost && activeTab === 'posts' ? 'pb-36 lg:pb-24' : 'pb-20 lg:pb-8'}`}>

      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto">
          <div className="relative h-44 sm:h-56 overflow-hidden bg-gradient-to-br from-rose-300 via-pink-300 to-purple-300">
            {community.coverImage && (
              <img src={community.coverImage} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            <button onClick={() => navigate('/communities')} className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {isOwner && (
              <button onClick={() => navigate(`/community/${communityId}/settings`)} className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 transition">
                <Settings className="w-5 h-5" />
              </button>
            )}
            <div className="absolute bottom-4 left-4 right-16">
              <div className="flex items-center space-x-2 mb-1">
                {community.isPrivate ? <Lock className="w-4 h-4 text-white" /> : <Globe className="w-4 h-4 text-white" />}
                <span className="text-white text-xs font-semibold uppercase tracking-wide capitalize">{community.category}</span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight drop-shadow-md">{community.name}</h1>
              <span className="text-white text-sm flex items-center space-x-1 mt-1 drop-shadow">
                <Users className="w-3.5 h-3.5" />
                <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </span>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600 line-clamp-2 flex-1">{community.description}</p>
            {!isOwner && (
              isMember
                ? <div className="flex items-center space-x-2 flex-shrink-0">
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-sm font-semibold flex items-center space-x-1">
                      <CheckCircle className="w-4 h-4" /><span>Joined</span>
                    </span>
                    <button onClick={handleLeave} className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-xl text-xs font-medium transition whitespace-nowrap">Leave</button>
                  </div>
                : isFree
                  ? <button onClick={async () => {
                      try {
                        await joinCommunity(currentUser.uid, communityId, {});
                        setIsMember(true);
                        const [p, m] = await Promise.all([getCommunityPosts(communityId), getCommunityMembers(communityId)]);
                        setPosts(p); setMembers(m);
                      } catch (e) { alert('Failed to join: ' + e.message); }
                    }} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition flex-shrink-0 flex items-center space-x-1">
                      <UserPlus className="w-4 h-4" /><span>Join Free</span>
                    </button>
                  : <button onClick={() => setShowJoinModal(true)} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-semibold transition flex-shrink-0 flex items-center space-x-1">
                      <UserPlus className="w-4 h-4" /><span>Join ${(community.price || 9.99).toFixed(2)}/mo</span>
                    </button>
            )}
          </div>

          <div className="flex border-t border-gray-100">
            {['posts', 'members'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold capitalize transition border-b-2 ${
                  activeTab === tab ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {tab === 'members' ? `Members (${memberCount})` : 'Posts'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {!canView && !isFree ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-10 h-10 text-rose-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Members Only</h3>
            <p className="text-gray-600 mb-2">Join to access exclusive content.</p>
            <p className="text-gray-500 text-sm mb-6">From <span className="font-bold text-rose-600">${(community.price || 9.99).toFixed(2)}/month</span></p>
            <button onClick={() => setShowJoinModal(true)} className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition inline-flex items-center space-x-2">
              <UserPlus className="w-5 h-5" /><span>Join Community</span>
            </button>
          </div>
        ) : !community.isPrivate && !isMember && !isOwner ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Globe className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Public Community</h3>
            <p className="text-gray-500 text-sm mb-4">This is a free community. Join to participate.</p>
            <button onClick={async () => {
              await joinCommunity(currentUser.uid, communityId, {});
              setIsMember(true);
              const [p, m] = await Promise.all([getCommunityPosts(communityId), getCommunityMembers(communityId)]);
              setPosts(p); setMembers(m);
            }} className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition inline-flex items-center space-x-2">
              <UserPlus className="w-4 h-4" /><span>Join Free</span>
            </button>
          </div>
        ) : activeTab === 'posts' ? (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <MessageCircle className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No posts yet</p>
                {isOwner && <p className="text-sm text-gray-400 mt-1">Broadcast your first message to members</p>}
              </div>
            ) : (
              posts.map(post => (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  isOwner={isOwner}
                  communityCreatorId={community.creatorId}
                  canComment={canView}
                />
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{memberCount} {memberCount === 1 ? 'Member' : 'Members'}</h3>
            </div>
            {members.length === 0
              ? <p className="text-center text-gray-500 py-10">No members yet</p>
              : <div className="divide-y divide-gray-50">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 overflow-hidden flex items-center justify-center">
                          {member.user?.avatar?.startsWith('http')
                            ? <img src={member.user.avatar} alt="" className="w-full h-full object-cover" />
                            : <span className="text-lg">👤</span>}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1">
                            <p className="font-semibold text-gray-900 text-sm">{member.user?.name || 'User'}</p>
                            {member.role === 'admin' && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                          </div>
                          {member.user?.username && <p className="text-xs text-gray-500">@{member.user.username}</p>}
                        </div>
                      </div>
                      <button onClick={() => navigate(`/creator/${member.user?.username}`)} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition">
                        Profile
                      </button>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </div>

      {/* Sticky post bar */}
      {canPost && activeTab === 'posts' && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-30 lg:left-64">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {postMedia.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                  className="bg-white border border-b-0 border-gray-200 rounded-t-2xl px-3 pt-3 pb-2 mx-2">
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                    {postMedia.map((m, i) => (
                      <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                        {m.type === 'video'
                          ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><Film className="w-6 h-6 text-white" /></div>
                          : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                        <button onClick={() => setPostMedia(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="bg-white border-t border-gray-200 px-3 py-2.5 shadow-lg">
              <div className="flex items-end space-x-2">
                <label className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-full cursor-pointer transition">
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleMediaUpload} className="hidden" disabled={uploading} />
                  {uploading ? <Loader2 className="w-5 h-5 text-rose-400 animate-spin" /> : <PlusCircle className="w-5 h-5 text-rose-400" />}
                </label>
                <label className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-full cursor-pointer transition">
                  <input type="file" accept="image/*" capture="environment" onChange={handleMediaUpload} className="hidden" disabled={uploading} />
                  <Camera className="w-5 h-5 text-gray-400" />
                </label>
                <textarea
                  ref={textareaRef}
                  value={postContent}
                  onChange={e => {
                    setPostContent(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreatePost(); }}
                  placeholder={isOwner ? 'Broadcast to channel...' : 'Write a post...'}
                  rows={1}
                  className="flex-1 resize-none bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 leading-relaxed"
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                <button onClick={handleCreatePost} disabled={posting || (!postContent.trim() && postMedia.length === 0)}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 text-white flex items-center justify-center transition">
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowJoinModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">Join {community.name}</h2>
                <button onClick={() => setShowJoinModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className={`rounded-xl p-3 mb-5 flex items-center justify-between ${walletBalance >= getJoinPrice() ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-center space-x-2">
                  <Wallet className={`w-4 h-4 ${walletBalance >= getJoinPrice() ? 'text-green-600' : 'text-amber-600'}`} />
                  <span className="text-sm font-semibold text-gray-700">Balance: <span className={walletBalance >= getJoinPrice() ? 'text-green-700' : 'text-amber-700'}>${walletBalance.toFixed(2)}</span></span>
                </div>
                {walletBalance < getJoinPrice() && (
                  <button onClick={() => { setShowJoinModal(false); navigate('/wallet'); }} className="text-xs font-semibold text-rose-600 underline">Add Funds</button>
                )}
              </div>
              <div className="space-y-3 mb-5">
                {[
                  { type: 'monthly', label: 'Monthly', desc: 'Renews every 30 days', price: (community.price || 9.99).toFixed(2), sub: '/month', highlight: false },
                  { type: 'onetime', label: 'One-time Access', desc: 'Lifetime membership', price: (community.oneTimePrice || (community.price || 9.99) * 3).toFixed(2), sub: 'Best value', highlight: true },
                ].map(({ type, label, desc, price, sub, highlight }) => (
                  <div key={type} onClick={() => setJoinType(type)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition ${joinType === type ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div><p className="font-semibold text-gray-900">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-rose-600">${price}</p>
                      <p className={`text-xs font-medium ${highlight ? 'text-green-600' : 'text-gray-500'}`}>{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
              {joinError && (
                <div className="flex items-center space-x-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 flex-1">{joinError}</p>
                  {joinError.includes('Insufficient') && (
                    <button onClick={() => { setShowJoinModal(false); navigate('/wallet'); }} className="text-xs font-semibold text-rose-600 underline whitespace-nowrap">Top up</button>
                  )}
                </div>
              )}
              <button onClick={handleJoin} disabled={joining || walletBalance < getJoinPrice()}
                className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center space-x-2">
                {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                <span>{joining ? 'Joining...' : `Join for $${getJoinPrice().toFixed(2)}`}</span>
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">Deducted instantly from your wallet</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RenderTextWithLinks({ text }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <p className="px-4 pb-3 text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-blue-500 underline break-all hover:text-blue-600"
            onClick={e => e.stopPropagation()}>
            {part}
          </a>
        ) : <span key={i}>{part}</span>
      )}
    </p>
  );
}

function CommunityPostCard({ post, isOwner, communityCreatorId, canComment }) {
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const [author, setAuthor] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const isChannelPost = post.authorId === communityCreatorId;

  // ✅ Watermark: show on all media for non-authors
  const viewerUsername = currentUser
    ? (profile?.username || currentUser.email?.split('@')[0] || currentUser.uid.slice(0, 8))
    : null;
  const showWatermark = !!viewerUsername && post.authorId !== currentUser?.uid;

  useEffect(() => {
    getUserProfile(post.authorId).then(setAuthor).catch(() => {});
    if (currentUser && post.likedBy) setIsLiked(post.likedBy.includes(currentUser.uid));
  }, [post.authorId, post.likedBy, currentUser]);

  const handleLike = async () => {
    if (!currentUser) return;
    try {
      const liked = await likeCommunityPost(post.id, currentUser.uid);
      setIsLiked(liked);
      setLikeCount(prev => liked ? prev + 1 : prev - 1);
    } catch (e) { console.error(e); }
  };

  const handleToggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      try {
        setLoadingComments(true);
        const data = await getCommunityPostComments(post.id);
        const enriched = await Promise.all(
          data.map(async c => {
            const u = await getUserProfile(c.userId).catch(() => null);
            return { ...c, author: u };
          })
        );
        setComments(enriched);
      } catch (e) { console.error(e); }
      finally { setLoadingComments(false); }
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !currentUser) return;
    try {
      setSubmittingComment(true);
      const newComment = await addCommunityPostComment(post.id, currentUser.uid, commentText.trim());
      const u = await getUserProfile(currentUser.uid).catch(() => null);
      setComments(prev => [...prev, { ...newComment, author: u }]);
      setCommentText('');
    } catch (e) {
      alert('Failed to comment: ' + e.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const timeAgo = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      {/* Author */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center flex-shrink-0">
            {author?.profilePicture?.startsWith('http')
              ? <img src={author.profilePicture} alt="" className="w-full h-full object-cover" />
              : <span className="text-base">👤</span>}
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <p className="font-semibold text-gray-900 text-sm">{author?.displayName || '...'}</p>
              {isChannelPost && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
            </div>
            <p className="text-xs text-gray-400">{timeAgo(post.createdAt)}</p>
          </div>
        </div>
        <button className="p-1.5 hover:bg-gray-100 rounded-full transition">
          <MoreVertical className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {post.content && <RenderTextWithLinks text={post.content} />}

      {/* ✅ Images with watermark */}
      {post.images?.length > 0 && (
        <div className={`grid gap-1 px-4 pb-3 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.images.map((url, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-gray-100 relative">
              <img
                src={url} alt=""
                className="w-full h-auto object-contain"
                style={{ maxHeight: post.images.length === 1 ? '500px' : '240px' }}
              />
              {showWatermark && <DiagonalWatermark username={viewerUsername} />}
            </div>
          ))}
        </div>
      )}

      {/* ✅ Videos with watermark */}
      {post.videos?.length > 0 && (
        <div className="space-y-1 px-4 pb-3">
          {post.videos.map((url, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-gray-900 relative">
              <video src={url} controls playsInline preload="metadata" className="w-full" onClick={e => e.stopPropagation()} />
              {showWatermark && <DiagonalWatermark username={viewerUsername} />}
            </div>
          ))}
        </div>
      )}

      {/* Reaction bar */}
      <div className="px-4 py-2.5 flex items-center space-x-4 border-t border-gray-50">
        <button onClick={handleLike}
          className={`flex items-center space-x-1.5 transition ${isLiked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-500'}`}>
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500' : ''}`} />
          <span className="text-xs font-medium">{likeCount}</span>
        </button>
        <button onClick={handleToggleComments}
          className={`flex items-center space-x-1.5 transition ${showComments ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}>
          <MessageCircle className="w-4 h-4" />
          <span className="text-xs font-medium">{post.commentCount || 0}</span>
        </button>
      </div>

      {/* Comments panel */}
      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="border-t border-gray-100 overflow-hidden">
            {canComment && (
              <div className="flex items-center space-x-2 px-4 py-3 border-b border-gray-50">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs">
                  {currentUser?.photoURL ? <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" /> : '👤'}
                </div>
                <input
                  type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
                  placeholder="Write a comment..."
                  className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                <button onClick={handleSubmitComment} disabled={submittingComment || !commentText.trim()}
                  className="p-1.5 text-rose-500 hover:text-rose-600 disabled:opacity-40 transition flex-shrink-0">
                  {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
            <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
              {loadingComments ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No comments yet. Be first!</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="flex items-start space-x-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs">
                      {comment.author?.profilePicture?.startsWith('http')
                        ? <img src={comment.author.profilePicture} alt="" className="w-full h-full object-cover" />
                        : '👤'}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                      <p className="text-xs font-semibold text-gray-800">{comment.author?.displayName || 'User'}</p>
                      <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{comment.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}