// src/pages/VideoCall/LivestreamRoom.jsx
//
// Creator: Live Studio setup → Go Live → stage + requests panel.
// Fans: join as viewers (no mic / no camera), see only the creator (+ any guests on stage),
//       and can: send a custom request, ask a question, request to be a guest, tip, chat.
//
// Everything is scoped to THIS session: the room doc is recreated on every Go Live, and chat /
// requests only load from the session start — so old guests or old messages never leak in.
// The creator controls who's on stage via room.stageGuests (creator-owned doc → no rules changes).

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, Loader2, AlertCircle, Send, ShieldAlert,
  Star, UserPlus, HelpCircle, Sparkles, X, Check, Radio, LogOut, Users, Share2, CalendarClock,
} from 'lucide-react';
import { shareLink, liveUrl, getScheduledLive, formatLiveTime, timeUntil } from '../../utils/share';
import {
  joinChannel, leaveChannel, toggleMicrophone, toggleCamera,
  getClient, changeClientRole, cleanup, getLocalVideoTrack,
} from '../../services/agoraService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';
import {
  doc, onSnapshot, collection, addDoc, query, orderBy, limit,
  setDoc, deleteDoc, updateDoc, serverTimestamp, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getWalletBalance } from '../../services/walletService';
import { VideoSlot } from '../../components/Call/CallBanners';
import LiveSetup, { normalizeLiveSettings } from '../../components/Live/LiveSetup';
import { playNotifySound } from '../../utils/notifySound';
import { pay, refund } from '../../services/payService';

const REQUEST_TYPES = ['stage_request', 'question', 'custom_request'];
const HIDDEN_TYPES = ['presence'];

const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function LivestreamRoom() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const isCreator = currentUser?.uid === creatorId;
  const myName = userProfile?.username || userProfile?.displayName || 'fan';

  const chatEndRef = useRef();
  const initRef = useRef(false);
  const myClientIdRef = useRef(null);
  const mountIdRef = useRef(Math.random().toString());
  const mountCountRef = useRef(0);
  const primedMsgsRef = useRef(false);
  const wasOnStageRef = useRef(false);

  // Session / connection
  const [setupDone, setSetupDone] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [error, setError] = useState(null);
  const [ended, setEnded] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [ticketRemaining, setTicketRemaining] = useState(3600);
  const [rosesBalance, setRosesBalance] = useState(0);

  // Data
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [liveRoom, setLiveRoom] = useState(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [localTick, setLocalTick] = useState(0);
  const [focusKey, setFocusKey] = useState(null);

  // UI
  const [messageText, setMessageText] = useState('');
  const [customTip, setCustomTip] = useState('');
  const [sheet, setSheet] = useState(null); // 'request' | 'question' | 'guest'
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const upsertRemote = (user) => setRemoteUsers((prev) => [...prev.filter((u) => u.uid !== user.uid), user]);
  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3500); };

  const settings = normalizeLiveSettings(liveRoom?.settings || creatorProfile?.liveSettings);
  const isFreeLive = liveRoom?.settings ? liveRoom.settings.entryFree !== false : creatorProfile?.livestreamFree !== false;
  const stageGuests = liveRoom?.stageGuests || [];
  const iAmOnStage = !isCreator && stageGuests.some((g) => g.userId === currentUser?.uid);
  const sessionStartMs = liveRoom?.createdAt?.toMillis?.() || null;

  // ── Balance & creator profile ────────────────────────────────────────────
  const fetchBalance = async () => {
    if (!currentUser) return;
    try { setRosesBalance(await getWalletBalance(currentUser.uid)); } catch { /* ignore */ }
  };
  useEffect(() => { fetchBalance(); }, [currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(doc(db, 'users', creatorId), (snap) => snap.exists() && setCreatorProfile(snap.data()));
  }, [creatorId, currentUser?.uid]);

  // ── Room doc ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(doc(db, 'livestream_rooms', creatorId), (snap) => {
      const data = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
      setLiveRoom(data);
      setRoomLoaded(true);
    });
  }, [creatorId, currentUser?.uid]);

  // Fan: join automatically once the creator is live; show "ended" if the room goes away
  useEffect(() => {
    if (isCreator || !roomLoaded) return;
    if (liveRoom?.isLive && !initRef.current && !ended) {
      initRef.current = true;
      initRoom();
    }
    if (!liveRoom && inRoom) {
      setEnded(true);
      teardown();
    }
  }, [roomLoaded, liveRoom?.isLive, isCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real unmount only (StrictMode-safe): leave Agora, creator ends the session
  useEffect(() => {
    mountCountRef.current += 1;
    const myMount = mountCountRef.current;
    return () => {
      setTimeout(() => { if (mountCountRef.current === myMount && initRef.current) teardown(); }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session messages (chat + requests) ───────────────────────────────────
  useEffect(() => {
    if (!currentUser || !sessionStartMs) return;
    primedMsgsRef.current = false;
    const q = query(
      collection(db, `livestream_rooms/${creatorId}/messages`),
      where('createdAt', '>=', Timestamp.fromMillis(sessionStartMs - 5000)),
      orderBy('createdAt', 'asc'),
      limit(200)
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      if (primedMsgsRef.current && isCreator) {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== 'added') return;
          const m = ch.doc.data();
          if (REQUEST_TYPES.includes(m.type)) playNotifySound(m.amount > 0 ? 'money' : 'request');
          else if (m.type === 'tip') playNotifySound('money');
          // A guest left the stage on their own → take them off
          if (m.type === 'stage_leave' && m.userId) removeGuest(m.userId, true);
        });
      }
      primedMsgsRef.current = true;
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
  }, [creatorId, currentUser?.uid, sessionStartMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paid entry: ticket countdown (free lives skip this) ──────────────────
  useEffect(() => {
    if (isFreeLive || isCreator || !inRoom) return;
    let latestExpiry = null;
    const unsub = onSnapshot(
      query(collection(db, 'livestream_tickets'), where('userId', '==', currentUser.uid), where('creatorId', '==', creatorId)),
      (snap) => {
        snap.forEach((d) => {
          const e = d.data().expiresAt?.toDate?.() || new Date(d.data().expiresAt);
          if (!latestExpiry || e > latestExpiry) latestExpiry = e;
        });
        if (!latestExpiry) return;
        setTicketRemaining(Math.max(0, Math.floor((latestExpiry - new Date()) / 1000)));
      },
      () => {}
    );
    const t = setInterval(() => {
      setTicketRemaining((prev) => {
        if (prev <= 1) { setError('Your 1-hour ticket has expired.'); teardown(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { clearInterval(t); unsub(); };
  }, [inRoom, isCreator, isFreeLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guest on stage: go on camera (mic starts MUTED), or back to viewer ───
  useEffect(() => {
    if (isCreator || !inRoom) return;
    (async () => {
      try {
        if (iAmOnStage && !wasOnStageRef.current) {
          wasOnStageRef.current = true;
          await changeClientRole('host');
          await toggleMicrophone(true);
          setMicMuted(true);
          setVideoOff(false);
          setLocalTick((t) => t + 1);
          const client = getClient('live', mountIdRef.current);
          if (client?.uid != null) {
            await addMsg({ type: 'presence', agoraUid: String(client.uid) });
          }
          flash("You're on stage! Your mic is muted — tap the mic to talk.");
        } else if (!iAmOnStage && wasOnStageRef.current) {
          wasOnStageRef.current = false;
          await changeClientRole('audience');
          setLocalTick((t) => t + 1);
          flash('You left the stage — you\'re watching again.');
        }
      } catch (e) {
        logger.error('Stage role change failed', e);
      }
    })();
  }, [iAmOnStage, inRoom, isCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join / leave ─────────────────────────────────────────────────────────
  const initRoom = async (creatorSettings = null) => {
    try {
      setLoading(true);
      setError(null);
      const channelName = `livestream_${creatorId}`;

      if (isCreator) {
        // New session every time: stage empty, settings snapshot, fresh start time
        await setDoc(doc(db, 'livestream_rooms', creatorId), {
          creatorId,
          isLive: true,
          channelName,
          title: creatorSettings?.title || '',
          settings: creatorSettings || settings,
          stageGuests: [],
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', creatorId), {
          is_live: true,
          scheduledLive: null,
          liveSettings: creatorSettings || settings,
          livestreamFree: (creatorSettings || settings).entryFree,
          livestreamPrice: (creatorSettings || settings).entryPrice,
        });
      }

      const client = getClient('live', mountIdRef.current);
      myClientIdRef.current = client?.clientId;
      client.removeAllListeners();
      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') user.audioTrack?.play();
          upsertRemote(user);
        } catch (e) { logger.error('subscribe failed', e); }
      });
      client.on('user-unpublished', (user) => upsertRemote(user));
      client.on('user-left', (user) => setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid)));

      // Viewers join as audience: no mic, no camera
      const res = await joinChannel(channelName, null, currentUser.uid, isCreator, null,
        isCreator ? 'host' : 'audience', creatorId, true, mountIdRef.current);
      if (res?.cancelled) return;

      if (isCreator && res?.uid != null) {
        await updateDoc(doc(db, 'livestream_rooms', creatorId), { creatorAgoraUid: res.uid });
      }

      for (const user of client.remoteUsers) {
        try {
          if (user.hasAudio) { await client.subscribe(user, 'audio'); user.audioTrack?.play(); }
          if (user.hasVideo) await client.subscribe(user, 'video');
          upsertRemote(user);
        } catch (e) { logger.error(e); }
      }

      setInRoom(true);
      setLoading(false);
      setLocalTick((t) => t + 1);

      if (isCreator) {
        const bits = [];
        if (settings.requestsEnabled || creatorSettings?.requestsEnabled) bits.push('send a request');
        if (settings.questionsEnabled || creatorSettings?.questionsEnabled) bits.push('ask a question');
        if (settings.guestEnabled || creatorSettings?.guestEnabled) bits.push('ask to join on camera');
        await addMsg({ type: 'system', text: `🔴 @${myName} is live!${bits.length ? ` You can ${bits.join(', ')}.` : ''}` });
      } else {
        await addMsg({ type: 'join', text: `@${myName} joined` });
      }
    } catch (err) {
      if (/WS_ABORT|LEAVE|aborted/.test(err.message || '')) return;
      logger.error('Error entering livestream room:', err);
      initRef.current = false;
      setError(err.message === 'INSUFFICIENT_FUNDS'
        ? 'You need an entry ticket to watch this live.'
        : (err.message || 'Could not join the live'));
      setLoading(false);
    }
  };

  const teardown = async () => {
    try {
      initRef.current = false;
      if (isCreator) {
        await deleteDoc(doc(db, 'livestream_rooms', creatorId)).catch(() => {});
        await updateDoc(doc(db, 'users', creatorId), { is_live: false }).catch(() => {});
      }
      await leaveChannel(myClientIdRef.current);
      cleanup(myClientIdRef.current);
    } catch (e) {
      logger.error('Room cleanup error:', e);
    }
    setInRoom(false);
  };

  const leaveRoom = async () => {
    await teardown();
    navigate(isCreator ? '/dashboard' : '/discover');
  };

  const goLive = async (s) => {
    setGoingLive(true);
    setSetupDone(true);
    initRef.current = true;
    await initRoom(s);
    setGoingLive(false);
  };

  // ── Messages & payments ──────────────────────────────────────────────────
  const addMsg = (data) => addDoc(collection(db, `livestream_rooms/${creatorId}/messages`), {
    userId: currentUser.uid,
    username: myName,
    avatar: userProfile?.profilePicture || userProfile?.avatar || null,
    createdAt: serverTimestamp(),
    ...data,
  });

  // Paid (or free) fan actions go through the server: it reads the creator's live prices, charges
  // the wallet with the standard split, and posts the message — so prices can't be faked.
  const livePay = async (action, data = {}) => {
    const res = await pay('live', { creatorId, action, ...data });
    fetchBalance();
    return res;
  };

  const sendChat = async (e) => {
    e.preventDefault();
    const text = messageText.trim();
    if (!text) return;
    setMessageText('');
    await addMsg({ type: isCreator ? 'system' : 'chat', text }).catch(() => {});
  };

  const sendTip = async (e) => {
    e.preventDefault();
    const amount = Math.floor(Number(customTip));
    if (!(amount >= 1)) return;
    setBusy(true);
    try {
      await livePay('tip', { amount });
      setCustomTip('');
    } catch (err) { flash(err.message); } finally { setBusy(false); }
  };

  const submitRequest = async ({ label, amount, text }) => {
    setBusy(true);
    try {
      await livePay('request', { label, amount, text: text || '', expectedPrice: amount });
      setSheet(null);
      flash('Request sent ✨');
    } catch (err) { flash(err.message); } finally { setBusy(false); }
  };

  const submitQuestion = async (text) => {
    setBusy(true);
    try {
      await livePay('question', { text, expectedPrice: settings.questionPrice });
      setSheet(null);
      flash('Question sent ❓');
    } catch (err) { flash(err.message); } finally { setBusy(false); }
  };

  const submitGuestRequest = async () => {
    setBusy(true);
    try {
      await livePay('guest', { expectedPrice: settings.guestPrice });
      setSheet(null);
      flash('Request sent — wait for the creator to accept');
    } catch (err) { flash(err.message); } finally { setBusy(false); }
  };

  const leaveStage = async () => {
    await addMsg({ type: 'stage_leave', text: 'left the stage' }).catch(() => {});
  };

  // Creator actions
  const setMsgStatus = (m, status) =>
    updateDoc(doc(db, `livestream_rooms/${creatorId}/messages`, m.id), { status }).catch(() => {});

  const acceptGuest = async (m) => {
    if (stageGuests.length >= settings.maxGuests) { flash(`Stage is full (${settings.maxGuests} max). Remove someone first.`); return; }
    if (stageGuests.some((g) => g.userId === m.userId)) { setMsgStatus(m, 'accepted'); return; }
    await updateDoc(doc(db, 'livestream_rooms', creatorId), {
      stageGuests: [...stageGuests, { userId: m.userId, username: m.username, avatar: m.avatar || null }],
    });
    await setMsgStatus(m, 'accepted');
  };

  const declineMsg = async (m) => {
    if (m.amount > 0) {
      // Server refunds the fan in full and takes the creator's (and ambassador's) share back
      try { await refund('live', { messageId: m.id }); } catch (e) { flash(e.message); logger.error('Refund failed', e); }
      return;
    }
    await setMsgStatus(m, 'declined');
  };

  const removeGuest = async (userId, silent = false) => {
    const current = liveRoomRef.current?.stageGuests || [];
    if (!current.some((g) => g.userId === userId)) return;
    await updateDoc(doc(db, 'livestream_rooms', creatorId), {
      stageGuests: current.filter((g) => g.userId !== userId),
    }).catch(() => {});
    if (!silent) flash('Guest removed from stage');
  };
  const liveRoomRef = useRef(null);
  liveRoomRef.current = liveRoom;

  const shareLive = async () => {
    const sched = getScheduledLive(creatorProfile);
    const name = creatorProfile?.displayName || `@${creatorProfile?.username || 'creator'}`;
    const text = inRoom
      ? `${name} is live on Unlukt right now 🔴 Join me:`
      : sched ? `${name} goes live on Unlukt ${formatLiveTime(sched.date)} 🔴 Save the link:` : `Join ${name}'s live on Unlukt 🔴`;
    const r = await shareLink({ url: liveUrl(creatorId), title: 'Unlukt Live', text });
    if (r === 'copied') flash('Live link copied — paste it anywhere');
    return r;
  };

  const [shareNote, setShareNote] = useState('');
  const scheduleLive = async (date, s) => {
    if (!(date instanceof Date) || isNaN(date.getTime()) || date.getTime() < Date.now()) return;
    await updateDoc(doc(db, 'users', creatorId), {
      scheduledLive: { at: Timestamp.fromDate(date), title: s?.title || '' },
      liveSettings: s,
      livestreamFree: s.entryFree,
      livestreamPrice: s.entryPrice,
    });
    setShareNote('Scheduled! Tap "Share live link" to send it to your fans.');
  };
  const cancelSchedule = async () => {
    await updateDoc(doc(db, 'users', creatorId), { scheduledLive: null }).catch(() => {});
    setShareNote('');
  };

  const handleRenewTicket = async () => {
    try {
      const idToken = await currentUser.getIdToken(true);
      const res = await fetch(import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/getAgoraToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ channelName: `livestream_${creatorId}`, creatorId, isLivestream: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Purchase rejected');
      setError(null);
      fetchBalance();
      initRef.current = true;
      initRoom();
    } catch (err) { flash(err.message); }
  };

  // ── Derived lists ────────────────────────────────────────────────────────
  const visibleMsgs = messages.filter((m) => !HIDDEN_TYPES.includes(m.type));
  const pending = messages.filter((m) => REQUEST_TYPES.includes(m.type) && m.status === 'pending');
  const pendingGuests = pending.filter((m) => m.type === 'stage_request');
  const pendingOther = pending.filter((m) => m.type !== 'stage_request');
  const myPendingGuest = pendingGuests.find((m) => m.userId === currentUser?.uid);
  const presence = useMemo(() => {
    const map = {};
    messages.forEach((m) => { if (m.type === 'presence' && m.userId) map[m.userId] = String(m.agoraUid); });
    return map;
  }, [messages]);

  // ── Stage feeds ──────────────────────────────────────────────────────────
  const localTrack = localTick >= 0 ? getLocalVideoTrack() : null;
  const creatorUidStr = liveRoom?.creatorAgoraUid != null ? String(liveRoom.creatorAgoraUid) : null;
  const guestUidSet = new Set(Object.values(presence));
  const remoteCreator = isCreator ? null
    : remoteUsers.find((u) => String(u.uid) === creatorUidStr)
      || remoteUsers.find((u) => !guestUidSet.has(String(u.uid))) || null;
  const used = new Set(remoteCreator ? [remoteCreator.uid] : []);

  const placeholder = (text) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 bg-slate-900">
      <VideoOff className="w-6 h-6" /><span>{text}</span>
    </div>
  );
  const feed = (isLocal, remote, waiting) => (
    <VideoSlot
      track={isLocal ? (videoOff ? null : localTrack) : (remote?.hasVideo ? remote.videoTrack : null)}
      mirror={isLocal}
      className="w-full h-full"
      placeholder={placeholder(isLocal ? 'Your camera is off' : waiting)}
    />
  );

  const feeds = [{
    key: 'creator',
    label: `@${creatorProfile?.username || 'creator'}`,
    node: feed(isCreator, remoteCreator, "Waiting for the creator's camera…"),
  }];
  stageGuests.forEach((g) => {
    const isMe = g.userId === currentUser?.uid;
    let remote = null;
    if (!isMe) {
      remote = remoteUsers.find((u) => String(u.uid) === presence[g.userId] && !used.has(u.uid))
        || remoteUsers.find((u) => !used.has(u.uid) && String(u.uid) !== creatorUidStr) || null;
      if (remote) used.add(remote.uid);
    }
    feeds.push({ key: g.userId, label: isMe ? 'You' : `@${g.username}`, node: feed(isMe, remote, 'Guest connecting…') });
  });
  const defaultKey = isCreator && feeds.length > 1 ? feeds[1].key : 'creator';
  const mainKey = feeds.some((f) => f.key === focusKey) ? focusKey : defaultKey;
  const mainFeed = feeds.find((f) => f.key === mainKey);
  const thumbs = feeds.filter((f) => f.key !== mainKey);

  // ── Screens ──────────────────────────────────────────────────────────────
  if (isCreator && !setupDone) {
    return (
      <LiveSetup
        uid={creatorId}
        initial={creatorProfile?.liveSettings}
        creatorName={creatorProfile?.displayName || creatorProfile?.username}
        busy={goingLive}
        onBack={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/dashboard'))}
        onGoLive={goLive}
        onDone={() => navigate('/dashboard')}
        scheduled={getScheduledLive(creatorProfile)}
        onSchedule={scheduleLive}
        onCancelSchedule={cancelSchedule}
        onShare={async () => { const r = await shareLive(); if (r === 'copied') setShareNote('Link copied — share it with your fans.'); }}
        shareNote={shareNote}
      />
    );
  }

  if (!isCreator && roomLoaded && !liveRoom && !inRoom && !error) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-900 flex items-center justify-center"><Radio className="w-8 h-8 text-slate-500" /></div>
          {(() => {
            const sched = !ended && getScheduledLive(creatorProfile);
            return sched ? (
              <>
                <h2 className="text-white text-xl font-black mb-1">{sched.title || `@${creatorProfile?.username} is going live`}</h2>
                <p className="text-rose-300 font-bold flex items-center justify-center gap-1.5"><CalendarClock className="w-4 h-4" /> {formatLiveTime(sched.date)}</p>
                <p className="text-slate-400 text-sm mt-1 mb-6">Starts {timeUntil(sched.date)} — keep this page open and you'll join automatically.</p>
              </>
            ) : (
              <>
                <h2 className="text-white text-xl font-black mb-2">{ended ? 'The live has ended' : `@${creatorProfile?.username || 'This creator'} isn't live right now`}</h2>
                <p className="text-slate-400 text-sm mb-6">{ended ? 'Thanks for watching!' : "You'll join automatically as soon as they go live."}</p>
              </>
            );
          })()}
          {!ended && (
            <button onClick={shareLive} className="w-full mb-3 py-3 bg-white/10 text-white font-bold rounded-2xl flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4" /> Share live link
            </button>
          )}
          <button onClick={() => navigate(`/creator/${creatorProfile?.username || creatorId}`)}
            className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl">View profile</button>
          <button onClick={() => navigate('/discover')} className="w-full mt-3 py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl">Back to Discover</button>
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <AlertCircle className="w-14 h-14 text-rose-500 mx-auto mb-4" />
        <h2 className="text-white text-xl font-black mb-2">Can't join the live</h2>
        <p className="text-slate-400 mb-6 text-sm leading-relaxed">{error}</p>
        {!isCreator && /ticket|funds/i.test(error) ? (
          <button onClick={handleRenewTicket} className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl">
            Buy 1-hour ticket ({settings.entryPrice} 🌹)
          </button>
        ) : (
          <button onClick={() => { setError(null); initRef.current = true; initRoom(isCreator ? settings : null); }}
            className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl">Try again</button>
        )}
        <button onClick={() => navigate('/discover')} className="w-full mt-3 py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl">Back to Discover</button>
      </div>
    </div>
  );

  if (loading || !inRoom) return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-14 h-14 text-rose-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-300 font-bold">{isCreator ? 'Going live…' : 'Joining the live…'}</p>
      </div>
    </div>
  );

  // ── Live UI ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 lg:static lg:min-h-screen bg-slate-950 text-white flex flex-col lg:flex-row overflow-hidden">
      {/* Stage */}
      <div className="relative bg-black h-[56%] lg:h-auto lg:flex-1 lg:min-h-screen flex-shrink-0">
        <div key={`main-${mainKey}`} className="absolute inset-0">{mainFeed?.node}</div>

        {/* Other feeds — tap to make big */}
        {thumbs.length > 0 && (
          <div className="absolute top-14 right-3 z-10 flex flex-col gap-2">
            {thumbs.map((f) => (
              <button key={`thumb-${f.key}`} onClick={() => setFocusKey(f.key)} aria-label={`Show ${f.label} big`}
                className="relative w-24 h-32 sm:w-36 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-slate-900 active:scale-95 transition">
                {f.node}
                <span className="absolute bottom-1 left-1 right-1 text-[10px] font-bold bg-black/60 rounded-full px-1.5 py-0.5 truncate">{f.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="bg-red-500/90 text-[10px] font-black tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
            </span>
            <span className="bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs font-bold truncate max-w-[45vw]">
              {liveRoom?.title || `@${creatorProfile?.username || 'creator'}`}
            </span>
            {stageGuests.length > 0 && (
              <span className="bg-rose-500/80 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1">
                <Star className="w-3 h-3" /> {stageGuests.length}/{settings.maxGuests} on stage
              </span>
            )}
          </div>
          <button onClick={shareLive} aria-label="Share live link"
            className="pointer-events-auto w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Share2 className="w-4 h-4" />
          </button>
          {!isCreator && !isFreeLive && (
            <span className="bg-slate-900/80 backdrop-blur border border-white/10 px-3 py-1.5 rounded-xl text-xs font-extrabold text-rose-400 tracking-widest">
              {formatCountdown(ticketRemaining)}
            </span>
          )}
        </div>

        <AnimatePresence>
          {notice && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-14 left-3 right-32 z-20 bg-black/75 backdrop-blur text-white text-xs font-semibold px-3 py-2 rounded-xl">
              {notice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="absolute bottom-3 inset-x-3 z-20 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {(isCreator || iAmOnStage) && (
              <>
                <button onClick={() => { const m = !micMuted; setMicMuted(m); toggleMicrophone(m); }} aria-label={micMuted ? 'Unmute' : 'Mute'}
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur ${micMuted ? 'bg-red-500' : 'bg-black/50'}`}>
                  {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={() => { const off = !videoOff; setVideoOff(off); toggleCamera(!off); }} aria-label="Camera"
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur ${videoOff ? 'bg-red-500' : 'bg-black/50'}`}>
                  {videoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </>
            )}
            {iAmOnStage && (
              <button onClick={leaveStage} className="h-11 px-3 bg-black/50 backdrop-blur text-xs font-bold rounded-full flex items-center gap-1">
                <LogOut className="w-4 h-4" /> Leave stage
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isCreator && (
              <span className="h-11 px-3 bg-black/50 backdrop-blur text-rose-400 font-extrabold text-sm rounded-full flex items-center">🌹 {Number(rosesBalance || 0).toFixed(2)}</span>
            )}
            <button onClick={leaveRoom}
              className="h-11 px-4 bg-red-600 hover:bg-red-700 font-bold rounded-full flex items-center gap-1.5 text-sm">
              <Phone className="w-4 h-4 rotate-135" /> {isCreator ? 'End live' : 'Leave'}
            </button>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-full lg:w-96 bg-slate-900 border-l border-white/5 flex flex-col flex-1 min-h-0 lg:flex-none lg:h-screen">
        {/* Creator: stage + requests queue */}
        {isCreator && (stageGuests.length > 0 || pending.length > 0) && (
          <div className="p-3 bg-slate-950 border-b border-white/5 space-y-2 max-h-[35%] overflow-y-auto">
            {stageGuests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stageGuests.map((g) => (
                  <span key={g.userId} className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 rounded-full pl-2.5 pr-1 py-1 text-xs font-bold">
                    <Users className="w-3.5 h-3.5 text-rose-400" /> @{g.username}
                    <button onClick={() => removeGuest(g.userId)} aria-label={`Remove @${g.username}`} className="p-1 rounded-full hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            {[...pendingGuests, ...pendingOther].map((m) => (
              <div key={m.id} className="bg-slate-900 border border-white/10 rounded-2xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-rose-300 truncate">
                    {m.type === 'stage_request' ? '🎥 GUEST REQUEST' : m.type === 'question' ? '❓ QUESTION' : `✨ ${m.label || 'REQUEST'}`}
                    <span className="text-slate-400 font-bold"> · @{m.username}</span>
                  </p>
                  {m.amount > 0 && <span className="text-xs font-black text-rose-400 flex-shrink-0">🌹 {m.amount}</span>}
                </div>
                {m.type !== 'stage_request' && m.text && <p className="text-xs text-slate-200 mt-1">{m.text}</p>}
                <div className="flex gap-1.5 mt-2">
                  {m.type === 'stage_request' ? (
                    <button onClick={() => acceptGuest(m)} disabled={stageGuests.length >= settings.maxGuests}
                      className="flex-1 py-1.5 bg-rose-500 disabled:opacity-40 text-[11px] font-black rounded-lg flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {stageGuests.length >= settings.maxGuests ? `Stage full (${settings.maxGuests})` : 'Bring on stage'}
                    </button>
                  ) : (
                    <button onClick={() => setMsgStatus(m, 'done')}
                      className="flex-1 py-1.5 bg-emerald-600 text-[11px] font-black rounded-lg flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {m.type === 'question' ? 'Answered' : 'Done'}
                    </button>
                  )}
                  <button onClick={() => declineMsg(m)} className="px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-bold rounded-lg">
                    Decline{m.amount > 0 ? ' & refund' : ''}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {visibleMsgs.map((m) => <ChatItem key={m.id} m={m} />)}
          <div ref={chatEndRef} />
        </div>

        {/* Fan actions */}
        {!isCreator && (
          <div className="p-3 bg-slate-950/80 border-t border-white/5 space-y-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <div className="grid grid-cols-3 gap-2">
              {settings.requestsEnabled && (
                <ActionBtn icon={Sparkles} label="Custom request" onClick={() => setSheet('request')} />
              )}
              {settings.questionsEnabled && (
                <ActionBtn icon={HelpCircle} label="Ask a question" sub={settings.questionPrice > 0 ? `🌹 ${settings.questionPrice}` : 'Free'} onClick={() => setSheet('question')} />
              )}
              {settings.guestEnabled && (
                <ActionBtn icon={UserPlus}
                  label={iAmOnStage ? 'On stage' : myPendingGuest ? 'Requested…' : 'Be a guest'}
                  sub={iAmOnStage || myPendingGuest ? '' : settings.guestPrice > 0 ? `🌹 ${settings.guestPrice}` : 'Free'}
                  disabled={iAmOnStage || !!myPendingGuest}
                  onClick={() => setSheet('guest')} />
              )}
            </div>

            <form onSubmit={sendTip} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">🌹</span>
                <input type="number" inputMode="numeric" min="1" step="1" value={customTip} onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="Type tip amount"
                  className="w-full bg-slate-900 border border-white/10 rounded-2xl pl-8 pr-3 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500" />
              </div>
              <button type="submit" disabled={busy || !(Number(customTip) >= 1)}
                className="px-4 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-xs font-bold rounded-2xl">Tip</button>
            </form>

            <form onSubmit={sendChat} className="flex gap-2">
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Say something…"
                className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500" />
              <button type="submit" aria-label="Send" className="p-3 bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        )}

        {isCreator && (
          <div className="p-3 bg-slate-950/80 border-t border-white/5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <form onSubmit={sendChat} className="flex gap-2">
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Post an announcement to everyone…"
                className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500" />
              <button type="submit" aria-label="Send" className="p-3 bg-rose-600 hover:bg-rose-700 rounded-2xl"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        )}
      </div>

      {/* Fan action sheets */}
      <AnimatePresence>
        {sheet && (
          <FanSheet
            mode={sheet}
            settings={settings}
            busy={busy}
            balance={rosesBalance}
            stageFull={stageGuests.length >= settings.maxGuests}
            onClose={() => setSheet(null)}
            onRequest={submitRequest}
            onQuestion={submitQuestion}
            onGuest={submitGuestRequest}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Small pieces ───────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, label, sub, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="min-h-[56px] py-2 px-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition">
      <Icon className="w-4 h-4 text-rose-400" />
      <span className="text-[11px] font-bold leading-tight text-center">{label}</span>
      {sub ? <span className="text-[10px] text-slate-500 font-bold">{sub}</span> : null}
    </button>
  );
}

function ChatItem({ m }) {
  const statusTag = m.status && m.status !== 'pending' ? (
    <span className={`ml-1 text-[10px] font-black uppercase ${m.status === 'declined' ? 'text-slate-500' : 'text-emerald-400'}`}>
      · {m.status === 'accepted' ? 'on stage' : m.status === 'done' ? (m.type === 'question' ? 'answered' : 'done') : m.status}
    </span>
  ) : null;

  if (m.type === 'system' || m.isSystem) return (
    <div className="bg-slate-950/40 p-2.5 rounded-2xl border border-slate-800/40 flex items-start gap-2">
      <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-rose-300 font-bold leading-normal">{m.text}</p>
    </div>
  );
  if (m.type === 'join' || m.type === 'stage_leave') return (
    <p className="text-[11px] text-slate-500 text-center">{m.type === 'join' ? '👋' : '🎬'} @{m.username} {m.type === 'join' ? 'joined' : 'left the stage'}</p>
  );
  if (m.type === 'tip' || m.type === 'gift') return (
    <div className="bg-purple-500/10 border border-purple-500/20 px-3 py-2 rounded-2xl">
      <p className="text-xs text-purple-200 font-bold">🌹 @{m.username} {m.text || `tipped ${m.amount} 🌹`}</p>
    </div>
  );
  if (m.type === 'question') return (
    <div className="bg-gradient-to-r from-amber-500/15 to-rose-500/15 border border-amber-400/30 p-3 rounded-2xl">
      <p className="text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1">❓ Question · @{m.username}{m.amount > 0 ? ` · 🌹 ${m.amount}` : ''}{statusTag}</p>
      <p className="text-sm font-semibold text-white">{m.text}</p>
    </div>
  );
  if (m.type === 'custom_request') return (
    <div className="bg-gradient-to-r from-rose-500 to-pink-600 p-3 rounded-2xl shadow-lg">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/90 mb-1">✨ {m.label} · @{m.username} · 🌹 {m.amount}{statusTag}</p>
      {m.text ? <p className="text-xs font-bold text-white">{m.text}</p> : null}
    </div>
  );
  if (m.type === 'stage_request') return (
    <div className="bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-2xl">
      <p className="text-xs text-rose-200 font-bold">🎥 @{m.username} wants to join on camera{m.amount > 0 ? ` · 🌹 ${m.amount}` : ''}{statusTag}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500 font-bold">@{m.username}</span>
      <p className="text-xs text-slate-200 leading-normal bg-slate-950/40 px-3 py-2 rounded-2xl self-start max-w-[85%]">{m.text}</p>
    </div>
  );
}

function FanSheet({ mode, settings, busy, balance, stageFull, onClose, onRequest, onQuestion, onGuest }) {
  const [picked, setPicked] = useState(null); // menu item index or 'custom'
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');

  const menu = settings.requestMenu || [];
  const req = picked === 'custom'
    ? { label: 'Custom request', amount: Math.floor(Number(amount)) }
    : picked != null ? { label: menu[picked].label, amount: menu[picked].price } : null;
  const reqValid = req && (picked !== 'custom' || (req.amount >= settings.customRequestMin && text.trim()));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !busy && onClose()}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-slate-900 border border-white/10 text-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg">
            {mode === 'request' ? '✨ Custom request' : mode === 'question' ? '❓ Ask a question' : '🎥 Join on camera'}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        {mode === 'request' && (
          <>
            <div className="space-y-2 mb-3">
              {menu.map((item, i) => (
                <button key={i} onClick={() => setPicked(i)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-bold ${picked === i ? 'border-rose-500 bg-rose-500/10' : 'border-white/10 bg-slate-950'}`}>
                  <span>{item.label}</span><span className="text-rose-400">🌹 {item.price}</span>
                </button>
              ))}
              {settings.allowCustomRequest && (
                <button onClick={() => setPicked('custom')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-bold ${picked === 'custom' ? 'border-rose-500 bg-rose-500/10' : 'border-white/10 bg-slate-950'}`}>
                  <span>Something else…</span><span className="text-slate-400">from 🌹 {settings.customRequestMin}</span>
                </button>
              )}
              {!menu.length && !settings.allowCustomRequest && <p className="text-sm text-slate-400">No requests on the menu right now.</p>}
            </div>
            {picked != null && (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={200}
                  placeholder={picked === 'custom' ? 'What would you like?' : 'Add a note (optional)'}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm mb-2 focus:outline-none focus:border-rose-500" />
                {picked === 'custom' && (
                  <input type="number" inputMode="numeric" min={settings.customRequestMin} value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Offer (min 🌹 ${settings.customRequestMin})`}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm mb-2 focus:outline-none focus:border-rose-500" />
                )}
              </>
            )}
            <button disabled={busy || !reqValid} onClick={() => onRequest({ label: req.label, amount: req.amount, text: text.trim() })}
              className="w-full min-h-[48px] mt-2 rounded-2xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 font-black flex items-center justify-center">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : req ? `Send request · 🌹 ${req.amount || 0}` : 'Pick a request'}
            </button>
          </>
        )}

        {mode === 'question' && (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={200} autoFocus
              placeholder="Type your question…"
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:border-rose-500" />
            <p className="text-xs text-slate-400 mt-2">Your question is highlighted for the creator.</p>
            <button disabled={busy || !text.trim()} onClick={() => onQuestion(text.trim())}
              className="w-full min-h-[48px] mt-3 rounded-2xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 font-black flex items-center justify-center">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : settings.questionPrice > 0 ? `Ask · 🌹 ${settings.questionPrice}` : 'Ask for free'}
            </button>
          </>
        )}

        {mode === 'guest' && (
          <>
            <p className="text-sm text-slate-300">
              Ask to join the live on camera. If the creator accepts, you'll go on stage with your <b>mic muted</b> — tap the mic when you're ready to talk.
            </p>
            {stageFull && <p className="text-xs text-amber-300 mt-2">The stage is full right now — you'll be in the queue.</p>}
            {settings.guestPrice > 0 && <p className="text-xs text-slate-400 mt-2">Refunded if the creator declines.</p>}
            <button disabled={busy} onClick={onGuest}
              className="w-full min-h-[48px] mt-4 rounded-2xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 font-black flex items-center justify-center">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : settings.guestPrice > 0 ? `Request · 🌹 ${settings.guestPrice}` : 'Request to join (free)'}
            </button>
          </>
        )}
        <p className="text-[11px] text-slate-500 text-center mt-3">Balance: 🌹 {Number(balance || 0).toFixed(2)}</p>
      </motion.div>
    </div>
  );
}
