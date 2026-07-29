// src/pages/VideoCall/LivestreamRoom.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, Loader2, AlertCircle,
  MessageSquare, Sparkles, Send, Gift, ShieldAlert, Award, Star, UserPlus
} from 'lucide-react';
import {
  joinChannel, leaveChannel, toggleMicrophone, toggleCamera,
  playLocalVideo, playRemoteMedia, getClient, changeClientRole, cleanup
} from '../../services/agoraService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';
import {
  doc, onSnapshot, collection, addDoc, query, orderBy, limit,
  setDoc, deleteDoc, updateDoc, serverTimestamp, where
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { deductFromWallet, addToWallet, getWalletBalance } from '../../services/walletService';

export default function LivestreamRoom() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const isCreator = currentUser?.uid === creatorId;

  // Video viewport refs
  const localVideoRef = useRef();
  const creatorVideoRef = useRef();
  const guestVideoRef = useRef();
  const chatEndRef = useRef();
  const initRef = useRef(false);
  const myClientIdRef = useRef(null);
  const mountIdRef = useRef(Math.random().toString());

  // States
  const [loading, setLoading] = useState(true);
  const [inRoom, setInRoom] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [ticketRemaining, setTicketRemaining] = useState(3600); // 1 hour block countdown
  const [rosesBalance, setRosesBalance] = useState(0);

  // Stream data
  const [liveRoom, setLiveRoom] = useState(null);
  const liveRoomRef = useRef(null);
  liveRoomRef.current = liveRoom;

  const [chatMessages, setChatMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [cohostRequests, setCohostRequests] = useState([]);
  const [activeCohost, setActiveCohost] = useState(null);
  const [pendingMyRequest, setPendingMyRequest] = useState(null);

  // visual overlays
  const [giftOverlay, setGiftOverlay] = useState(null);
  const [error, setError] = useState(null);
  const [creatorProfile, setCreatorProfile] = useState(null);

  // Remote users in channel
  const [remoteUsers, setRemoteUsers] = useState([]);

  // Fetch Roses Balance
  const fetchBalance = async () => {
    if (!currentUser) return;
    const bal = await getWalletBalance(currentUser.uid);
    setRosesBalance(bal);
  };

  useEffect(() => {
    fetchBalance();
  }, [currentUser?.uid]);

  // Fetch Creator Profile
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', creatorId), (snap) => {
      if (snap.exists()) {
        setCreatorProfile(snap.data());
      }
    });
    return () => unsub();
  }, [creatorId, currentUser?.uid]);

  // Initialize Room & Agora connection
  useEffect(() => {
    if (!currentUser) return;
    if (initRef.current) return;
    initRef.current = true;
    initRoom();
    return () => {
      cleanupRoom();
    };
  }, [currentUser?.uid]);

  // Listen to Firestore Room State
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'livestream_rooms', creatorId), (snap) => {
      if (snap.exists()) {
        setLiveRoom(snap.data());
      } else if (!isCreator && inRoom) {
        // If room document is deleted and fan is watching, kick out
        setError('Livestream has ended.');
        cleanupRoom();
      }
    });
    return () => unsub();
  }, [creatorId, inRoom, currentUser?.uid]);

  // Listen to Live Chat
  useEffect(() => {
    if (!currentUser) return;
    const chatQuery = query(
      collection(db, `livestream_rooms/${creatorId}/messages`),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    const unsub = onSnapshot(chatQuery, (snap) => {
      const msgs = [];
      snap.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setChatMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [creatorId, currentUser?.uid]);

  // Listen to visual gift triggers (Priority/Eternal Rose tip)
  useEffect(() => {
    if (!currentUser) return;
    const giftQuery = query(
      collection(db, `livestream_rooms/${creatorId}/visual_effects`),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(giftQuery, (snap) => {
      if (!snap.empty) {
        const giftDoc = snap.docs[0].data();
        const ageSecs = (Date.now() - (giftDoc.createdAt?.toDate?.() || Date.now())) / 1000;
        if (ageSecs < 10) {
          triggerVisualEffect(giftDoc.username, giftDoc.type);
        }
      }
    });
    return () => unsub();
  }, [creatorId, currentUser?.uid]);

  // Listen to Stage Requests (filtered by creatorId to align with security rules)
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'cohost_requests'),
        where('creatorId', '==', creatorId),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        const reqs = [];
        let active = null;
        let myPending = null;

        snap.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          if (data.status === 'pending') {
            reqs.push(data);
            if (data.userId === currentUser?.uid) {
              myPending = data;
            }
          } else if (data.status === 'accepted') {
            active = data;
          }
        });

        setCohostRequests(reqs);
        setActiveCohost(active);
        setPendingMyRequest(myPending);
      },
      (err) => {
        logger.error('Error listening to stage requests:', err);
      }
    );
    return () => unsub();
  }, [creatorId, currentUser?.uid]);

  // Enforce ticket expiration countdown for fans (filtered by user and creator)
  useEffect(() => {
    if (isCreator || !inRoom) return;

    // Listen to fan's ticket
    const checkTicket = async () => {
      const ticketsSnap = onSnapshot(
        query(
          collection(db, 'livestream_tickets'),
          where('userId', '==', currentUser.uid),
          where('creatorId', '==', creatorId)
        ),
        (snap) => {
          let latestTicket = null;
          snap.forEach((doc) => {
            const data = doc.data();
            if (!latestTicket) {
              latestTicket = data;
            } else {
              const currentExpiry = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
              const latestExpiry = latestTicket.expiresAt?.toDate?.() || new Date(latestTicket.expiresAt);
              if (currentExpiry > latestExpiry) {
                latestTicket = data;
              }
            }
          });

          if (!latestTicket) {
            setError('Entry ticket required.');
            cleanupRoom();
            return;
          }

          const expiry = latestTicket.expiresAt?.toDate?.() || new Date(latestTicket.expiresAt);
          const remaining = Math.max(0, Math.floor((expiry - new Date()) / 1000));
          setTicketRemaining(remaining);

          if (remaining <= 0) {
            setError('Your 1-hour ticket block has expired.');
            cleanupRoom();
          }
        },
        (err) => {
          logger.error('Error listening to tickets:', err);
        }
      );
      return ticketsSnap;
    };

    let ticketUnsub;
    checkTicket().then(un => { ticketUnsub = un; });

    const interval = setInterval(() => {
      setTicketRemaining(prev => {
        if (prev <= 1) {
          setError('Your 1-hour ticket block has expired.');
          cleanupRoom();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      if (ticketUnsub) ticketUnsub();
    };
  }, [inRoom, isCreator]);

  // Handle active dynamic cohost role upgrades/downgrades inside Agora client
  useEffect(() => {
    if (isCreator || !inRoom) return;

    const handleRoleTransitions = async () => {
      const client = getClient('live', mountIdRef.current);
      if (!client) return;

      if (activeCohost && activeCohost.userId === currentUser.uid) {
        logger.info('Dynamically upgrading my role to Stage Co-Host (host)');
        await changeClientRole('host');
        // Play local camera preview
        setTimeout(() => {
          if (localVideoRef.current) playLocalVideo(localVideoRef.current);
        }, 300);

        // Write guestAgoraUid to Firestore
        if (client.uid) {
          await updateDoc(doc(db, 'livestream_rooms', creatorId), {
            guestAgoraUid: client.uid
          });
          logger.info('Saved guest Agora numeric UID to Firestore:', client.uid);
        }
      } else {
        // Downgrade if we were previously co-host
        logger.info('Spectator role assigned');
        await changeClientRole('audience');
      }
    };

    handleRoleTransitions();
  }, [activeCohost, inRoom, isCreator]);

  const getStreamContainer = (agoraUid) => {
    const currentLiveRoom = liveRoomRef.current;
    const targetUidStr = String(agoraUid);
    const creatorUidStr = currentLiveRoom?.creatorAgoraUid ? String(currentLiveRoom.creatorAgoraUid) : null;
    const guestUidStr = currentLiveRoom?.guestAgoraUid ? String(currentLiveRoom.guestAgoraUid) : null;

    if (creatorUidStr && targetUidStr === creatorUidStr) {
      return creatorVideoRef.current;
    }
    if (guestUidStr && targetUidStr === guestUidStr) {
      return guestVideoRef.current;
    }

    // Role-based routing fallbacks (covers slow Firestore writes)
    if (isCreator) {
      return guestVideoRef.current;
    } else {
      return creatorVideoRef.current;
    }
  };

  // Trigger rendering when remoteUsers or UIDs change (ensures immediate layout bind)
  useEffect(() => {
    if (!inRoom) return;

    remoteUsers.forEach((user) => {
      const container = getStreamContainer(user.uid);
      if (container && user.hasVideo) {
        container.innerHTML = '';
        playRemoteMedia(user, container, true);
      }
    });
  }, [remoteUsers, liveRoom?.creatorAgoraUid, liveRoom?.guestAgoraUid, isCreator, inRoom]);

  const initRoom = async () => {
    try {
      setLoading(true);
      const channelName = `livestream_${creatorId}`;

      // Initialize database room document if creator
      if (isCreator) {
        await setDoc(doc(db, 'livestream_rooms', creatorId), {
          creatorId,
          isLive: true,
          channelName,
          createdAt: serverTimestamp(),
        });
        // Set creator status live in users profile
        await updateDoc(doc(db, 'users', creatorId), { is_live: true });
      }

      const role = isCreator ? 'host' : 'audience';
      const client = getClient('live', mountIdRef.current);
      myClientIdRef.current = client?.clientId;
      logger.info('Agora client selected for initialization:', myClientIdRef.current);

      // Register event listeners BEFORE joining to ensure no events are missed!
      client.on('user-published', async (user, mediaType) => {
        logger.info('Agora user-published event fired:', user.uid, mediaType);
        await client.subscribe(user, mediaType);
        
        // Add to remote users tracking state
        setRemoteUsers(prev => {
          if (prev.some(u => u.uid === user.uid)) return prev;
          return [...prev, user];
        });

        if (mediaType === 'video') {
          setTimeout(() => {
            const container = getStreamContainer(user.uid);
            if (container) {
              container.innerHTML = '';
              playRemoteMedia(user, container, true);
            } else {
              logger.warn('No container element found to play remote video for user:', user.uid);
            }
          }, 300);
        }
        if (mediaType === 'audio') {
          playRemoteMedia(user, null, false);
        }
      });

      client.on('user-unpublished', (user, mediaType) => {
        logger.info('Agora user-unpublished event fired:', user.uid, mediaType);
        if (mediaType === 'video') {
          const container = getStreamContainer(user.uid);
          if (container) container.innerHTML = '';
        }
      });

      client.on('user-left', (user) => {
        logger.info('Agora user-left event fired:', user.uid);
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });
      
      const res = await joinChannel(channelName, null, currentUser.uid, !isCreator ? false : true, null, role, creatorId, true, mountIdRef.current);
      if (res?.cancelled) {
        logger.info('Agora join channel was cancelled');
        return;
      }

      if (isCreator && res?.uid) {
        await updateDoc(doc(db, 'livestream_rooms', creatorId), {
          creatorAgoraUid: res.uid
        });
        logger.info('Updated livestream room with Creator Agora numeric UID:', res.uid);
      }

      setInRoom(true);
      setLoading(false);

      if (isCreator) {
        setTimeout(() => {
          if (localVideoRef.current) playLocalVideo(localVideoRef.current);
        }, 200);
      }

      // Add system greeting message to live chat
      await addChatMessage('System Alert', `Welcome to the livestream! Send tipping Roses to interact on stage!`, true);

    } catch (err) {
      if (err.message?.includes('WS_ABORT') || err.message?.includes('LEAVE') || err.message?.includes('aborted')) {
        logger.info('Ignored transient aborted connection error during unmount/remount:', err.message);
        return;
      }
      logger.error('Error entering livestream room:', err);
      if (err.message === 'INSUFFICIENT_FUNDS') {
        setError('You need to purchase an entry ticket pass to enter the stream.');
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  const cleanupRoom = async () => {
    try {
      initRef.current = false; // Reset ref so React Strict Mode re-mount is allowed to initialize
      
      const activeClient = getClient('live', mountIdRef.current);
      const isActiveInstance = !activeClient || activeClient.clientId === myClientIdRef.current;

      if (isCreator && isActiveInstance) {
        // Delete room status and toggle profile flag
        await deleteDoc(doc(db, 'livestream_rooms', creatorId));
        await updateDoc(doc(db, 'users', creatorId), { is_live: false });
        
        // Clear co-host requests
        cohostRequests.forEach(async (req) => {
          await deleteDoc(doc(db, 'cohost_requests', req.id));
        });
      }
      await leaveChannel(myClientIdRef.current);
      cleanup(myClientIdRef.current);
    } catch (e) {
      logger.error('Room cleanup error:', e);
    }
  };

  const addChatMessage = async (username, text, isSystem = false, type = 'normal') => {
    try {
      await addDoc(collection(db, `livestream_rooms/${creatorId}/messages`), {
        username,
        text,
        isSystem,
        type,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      logger.error('Error posting message:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    const name = userProfile?.displayName || userProfile?.username || 'Guest';
    await addChatMessage(name, messageText);
    setMessageText('');
  };

  // Tipping Matrix Processing
  const handleSendTip = async (amount, type) => {
    try {
      const username = userProfile?.displayName || userProfile?.username || 'Fan';
      
      if (type === 'stage_request') {
        // Call cloud function /requestCoHostStage or process via walletService + request creation
        const idToken = await currentUser.getIdToken(true);
        const res = await fetch(import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/requestCoHostStage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ creatorId, tipAmount: amount })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to place stage request');
        }

        await addChatMessage('System Tip', `${username} tipped ${amount} Roses 🌹 to request going on camera live!`, false, 'priority');
        fetchBalance();
        alert('Your Co-Host Stage request has been sent to the creator!');
        return;
      }

      // General Tipping: debit fan and credit creator
      const desc = type === 'effect' ? `Eternal Rose Visual Tip to @${creatorProfile?.username}` : `Highlighted Message Tip to @${creatorProfile?.username}`;
      await deductFromWallet(currentUser.uid, amount, desc);
      await addToWallet(creatorId, amount, 'tip');

      if (type === 'effect') {
        // Trigger fullscreen visual effect alert via visual_effects collection
        await addDoc(collection(db, `livestream_rooms/${creatorId}/visual_effects`), {
          username,
          type: 'sparkles',
          createdAt: serverTimestamp()
        });
        await addChatMessage('Eternal Rose 🌹', `${username} tipped ${amount} Roses 🌹 causing screen sparkles overlays!`, false, 'gift');
      } else {
        // Highlighted Message Banner
        await addChatMessage(username, messageText || 'Tipped Rose! 🌹', false, 'banner');
        setMessageText('');
      }

      fetchBalance();
    } catch (err) {
      alert(err.message);
    }
  };

  const triggerVisualEffect = (sender, type) => {
    setGiftOverlay({ sender, type });
    setTimeout(() => setGiftOverlay(null), 5000);
  };

  // Co-Host Requests Acceptance / Dismissal
  const handleResolveCohost = async (requestId, action) => {
    try {
      const idToken = await currentUser.getIdToken(true);
      const res = await fetch(import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/resolveCoHostRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ requestId, action })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Resolution error');
      }

    } catch (err) {
      alert(err.message);
    }
  };

  const handleEndCohostSession = async () => {
    if (!activeCohost) return;
    try {
      await updateDoc(doc(db, 'cohost_requests', activeCohost.id), { status: 'completed' });
    } catch (err) {
      logger.error('Error ending cohost session:', err);
    }
  };

  // 1-Hour Block Renewal CTAs
  const handleRenewTicket = async () => {
    try {
      const channelName = `livestream_${creatorId}`;
      const idToken = await currentUser.getIdToken(true);
      
      const res = await fetch(import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/getAgoraToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ channelName, creatorId, isLivestream: true })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Purchase rejected');
      }

      setError(null);
      fetchBalance();
      initRoom();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRetryConnection = () => {
    setError(null);
    initRef.current = false;
    initRoom();
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-rose-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-300 text-lg font-bold">Entering Live Streaming Room...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-white text-2xl font-black mb-2">Access Restrained</h2>
        <p className="text-slate-400 mb-6 text-sm leading-relaxed">{error}</p>
        
        {!isCreator && (error.includes('Ticket') || error.includes('ticket') || error.includes('funds') || error.includes('FUNDS')) ? (
          <button
            onClick={handleRenewTicket}
            className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold rounded-2xl shadow-lg transition"
          >
            Buy 1-Hour Entry Ticket (10 Roses 🌹)
          </button>
        ) : (
          <button
            onClick={handleRetryConnection}
            className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold rounded-2xl shadow-lg transition"
          >
            Retry Connection
          </button>
        )}
        
        <button
          onClick={() => navigate('/discover')}
          className="w-full mt-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition"
        >
          Back to Explore
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col lg:flex-row relative overflow-hidden">
      
      {/* Visual Overlay Sparkles Effect */}
      <AnimatePresence>
        {giftOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-rose-500/20 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center bg-black/60 px-8 py-6 rounded-3xl border border-rose-500/30">
              <Sparkles className="w-16 h-16 text-yellow-400 mx-auto mb-3 animate-bounce" />
              <h2 className="text-2xl font-black text-white">{giftOverlay.sender} tipped an ETERNAL ROSE 🌹</h2>
              <p className="text-rose-300 text-sm font-bold">Triggering Sparkles Splash Animation Overlay!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Viewport Screen */}
      <div className="flex-1 flex flex-col relative bg-black min-h-[50vh] lg:min-h-screen">
        
        {/* Creator & Guest Split Screen Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-slate-950 relative">
          
          {/* Creator Stream Screen */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
            {isCreator ? (
              <div ref={localVideoRef} className="w-full h-full object-cover" />
            ) : (
              <div
                ref={creatorVideoRef}
                className="w-full h-full object-cover"
              />
            )}
            
            {/* Creator Badge labels */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
              <span className="bg-red-500/90 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span>LIVE</span>
              </span>
              <span className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold">
                @{creatorProfile?.username || 'creator'}
              </span>
            </div>
          </div>

          {/* Active Stage Co-Host Guest Screen */}
          {activeCohost ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-rose-500 flex items-center justify-center">
              {activeCohost.userId === currentUser.uid ? (
                // Play local camera preview if guest is current user
                <div ref={localVideoRef} className="w-full h-full object-cover" />
              ) : (
                <div
                  ref={guestVideoRef}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Guest status metadata banner */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                <span className="bg-rose-50 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3 text-white" />
                  <span>ON STAGE</span>
                </span>
                <span className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold">
                  @{activeCohost.username}
                </span>
              </div>

              {isCreator && (
                <button
                  onClick={handleEndCohostSession}
                  className="absolute bottom-4 right-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl z-20 shadow-lg"
                >
                  Remove Stage Access
                </button>
              )}
            </div>
          ) : (
            // Spectator placeholder grid if no active guest cohost
            <div className="hidden md:flex flex-col items-center justify-center rounded-2xl bg-slate-900/50 border border-dashed border-slate-800 text-slate-500 p-6 text-center">
              <Award className="w-12 h-12 mb-3 text-slate-700" />
              <h4 className="font-bold text-slate-400">Dynamic Stage Access Empty</h4>
              <p className="text-xs text-slate-600 max-w-xs mt-1">
                Tip 50 Roses to join the stage co-host live camera feed with the creator!
              </p>
            </div>
          )}
        </div>

        {/* Dynamic Ticket countdown overlay for audience */}
        {!isCreator && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
            <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">Ticket Time:</span>
              <span className="text-rose-500 font-extrabold text-sm tracking-widest">
                {formatCountdown(ticketRemaining)}
              </span>
            </div>
          </div>
        )}

        {/* Footer controls section */}
        <div className="p-4 bg-slate-950 border-t border-white/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Creator controls only */}
            {isCreator && (
              <>
                <button
                  onClick={() => {
                    const muted = !micMuted;
                    setMicMuted(muted);
                    toggleMicrophone(muted);
                  }}
                  className={`p-3 rounded-2xl border transition-all ${
                    micMuted ? 'bg-red-500 border-red-500 text-white' : 'bg-slate-900 border-white/10 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => {
                    const off = !videoOff;
                    setVideoOff(off);
                    toggleCamera(!off);
                  }}
                  className={`p-3 rounded-2xl border transition-all ${
                    videoOff ? 'bg-red-500 border-red-500 text-white' : 'bg-slate-900 border-white/10 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {videoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </>
            )}
            
            {/* Leaving Room Button */}
            <button
              onClick={() => {
                cleanupRoom();
                navigate(isCreator ? '/dashboard' : '/discover');
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition flex items-center gap-2"
            >
              <Phone className="w-5 h-5 transform rotate-135" />
              <span>Leave Room</span>
            </button>
          </div>

          {/* Wallet Balance display for fan */}
          {!isCreator && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-bold">Roses Balance:</span>
              <span className="bg-rose-500/10 text-rose-500 font-extrabold text-sm border border-rose-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1">
                <span>🌹</span>
                <span>{rosesBalance.toFixed(0)}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Side-Panel: Interactive Chat & Tipping matrix */}
      <div className="w-full lg:w-96 bg-slate-900 border-l border-white/5 flex flex-col h-[50vh] lg:min-h-screen">
        
        {/* Creator Control Header: Display Stage Requests */}
        {isCreator && (
          <div className="p-4 bg-slate-950 border-b border-white/5 flex flex-col gap-3">
            <h4 className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-rose-500" />
              <span>Stage Requests Queue ({cohostRequests.length})</span>
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {cohostRequests.length > 0 ? (
                cohostRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex-shrink-0 w-44 bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-rose-500 flex-shrink-0">
                        <img
                          src={req.avatar || '/ads/default/fallback-1.webp'}
                          alt=""
                          onError={(e) => { e.target.src = '/ads/default/fallback-1.webp'; }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate text-white">{req.displayName}</p>
                        <p className="text-[10px] text-rose-300 font-bold">Tipped 🌹{req.amount}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleResolveCohost(req.id, 'accept')}
                        className="flex-1 py-1 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-[10px] font-black rounded-lg transition"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleResolveCohost(req.id, 'dismiss')}
                        className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold rounded-lg transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-600 text-xs py-2 italic font-semibold">No active camera request cards in queue.</p>
              )}
            </div>
          </div>
        )}

        {/* Live Chat Message Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end min-h-0">
          <div className="space-y-3 overflow-y-auto flex-1 scrollbar-hide pr-1">
            {chatMessages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="bg-slate-950/40 p-2.5 rounded-2xl border border-slate-800/40 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300 font-bold leading-normal">{msg.text}</p>
                  </div>
                );
              }

              if (msg.type === 'priority') {
                return (
                  <div key={msg.id} className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl">
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 font-black mb-1">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>PRIORITY STAGE TIP</span>
                    </div>
                    <p className="text-xs text-white leading-relaxed">{msg.text}</p>
                  </div>
                );
              }

              if (msg.type === 'gift') {
                return (
                  <div key={msg.id} className="bg-purple-500/10 border border-purple-500/20 p-3 rounded-2xl">
                    <div className="flex items-center gap-1.5 text-xs text-purple-400 font-black mb-1 animate-pulse">
                      <Gift className="w-3.5 h-3.5 fill-current" />
                      <span>ETERNAL ROSE SHOWER 🌹</span>
                    </div>
                    <p className="text-xs text-purple-200 leading-relaxed font-bold">{msg.text}</p>
                  </div>
                );
              }

              if (msg.type === 'banner') {
                return (
                  <div key={msg.id} className="bg-gradient-to-r from-rose-500 to-pink-600 p-3 rounded-2xl shadow-lg border border-white/10">
                    <div className="flex justify-between items-center text-[10px] text-white/95 font-extrabold uppercase tracking-wider mb-1">
                      <span>Highlighted Banner Tip (10 Roses)</span>
                      <span>🌹</span>
                    </div>
                    <p className="text-xs font-bold text-white leading-normal">{msg.text}</p>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500 font-bold">@{msg.username}</span>
                  <p className="text-xs text-slate-300 leading-normal bg-slate-950/20 px-3 py-2 rounded-2xl self-start max-w-[85%]">{msg.text}</p>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Fan Tipping Matrix & Messaging Panel */}
        {!isCreator && (
          <div className="p-4 bg-slate-950/80 border-t border-white/5 space-y-4">
            
            {/* Custom Presets Tipping Matrix */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleSendTip(10, 'banner')}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-2xl flex flex-col items-center gap-1 transition"
              >
                <span className="text-sm">🌹 10</span>
                <span className="text-[9px] text-slate-500 font-black uppercase">Banner Message</span>
              </button>
              
              <button
                disabled={!!pendingMyRequest || !!(activeCohost && activeCohost.userId === currentUser.uid)}
                onClick={() => handleSendTip(50, 'stage_request')}
                className={`py-2.5 border rounded-2xl flex flex-col items-center gap-1 transition ${
                  pendingMyRequest
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                    : 'bg-slate-900 hover:bg-slate-800 border-white/5 text-white'
                }`}
              >
                <span className="text-sm">🌹 50</span>
                <span className="text-[9px] text-slate-500 font-black uppercase">
                  {pendingMyRequest ? 'Pending Join...' : 'Request Stage'}
                </span>
              </button>

              <button
                onClick={() => handleSendTip(250, 'effect')}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-2xl flex flex-col items-center gap-1 transition"
              >
                <span className="text-sm">🌹 250</span>
                <span className="text-[9px] text-slate-500 font-black uppercase">Eternal Rose</span>
              </button>
            </div>

            {/* Chat Send Message Input */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="p-3 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white rounded-2xl transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Creator Stream Chat Input */}
        {isCreator && (
          <div className="p-4 bg-slate-950/80 border-t border-white/5">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Broadcast a system notification..."
                className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="p-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
