// src/hooks/useCallRoom.js
//
// Shared engine for 1-on-1 voice & video call rooms.
//  - Attaches Agora listeners BEFORE joining (and subscribes to anyone already in the room), so
//    audio works immediately — no more "mute and unmute before the other side hears me".
//  - Handles network failure on either side: reconnecting banner, the other person dropping out
//    (call stays open, waits for them), manual rejoin, browser offline/online.
//  - Supports more than 2 people in the channel (grid of remote users).
//  - Voice → video upgrade requests, stored on the booking so they survive reconnects and stay
//    valid for the requester's whole stay in the call.
//  - Renews the Agora token before it expires (tokens are 1h, calls can be 90 min).
//  - One shared countdown for both sides, based on the booking's callStartedAt.

import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  getClient, joinChannel, leaveChannel, toggleMicrophone, toggleCamera,
  switchCamera, enableLocalVideo, getLocalVideoTrack, renewToken,
  restartLocalVideo, ensureLocalVideoPublished, isLocalVideoHealthy, getCallDiagnostics,
} from '../services/agoraService';
import {
  startVideoCall, endVideoCall, getCallDurationSeconds, END_CALL_REASONS,
} from '../services/videoCallService';
import logger from '../utils/logger';

const toMillis = (ts) => {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return null;
};

export default function useCallRoom({ bookingId, mode, currentUser, navigate }) {
  const channelName = `${mode}_${bookingId}`;

  const [phase, setPhase] = useState('connecting'); // connecting | in_call | error
  const [error, setError] = useState(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [connection, setConnection] = useState('connecting'); // connecting | connected | reconnecting | disconnected
  const [remoteUsers, setRemoteUsers] = useState([]); // [{ uid, hasAudio, hasVideo }]
  const [droppedNotice, setDroppedNotice] = useState(false);
  const [networkQuality, setNetworkQuality] = useState(0); // 0 unknown, 1 best … 6 down
  const [micMuted, setMicMuted] = useState(false);
  const [camOn, setCamOn] = useState(mode === 'video');
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [booking, setBooking] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [ending, setEnding] = useState(false);
  const [camError, setCamError] = useState(null); // why the camera couldn't start (with retry)
  const [localVideo, setLocalVideo] = useState(null); // current local camera track (changes after a restart)
  const [camFixing, setCamFixing] = useState(false);

  const usersRef = useRef(new Map()); // uid -> IAgoraRTCRemoteUser
  const endedRef = useRef(false);
  const startedRef = useRef(false);
  const mountCountRef = useRef(0);
  const durationRef = useRef(null);
  const videoUpgradeAppliedRef = useRef(false);
  const endCallRef = useRef(null);

  const isCreator = booking ? booking.creatorId === currentUser?.uid : false;
  const videoUpgrade = booking?.videoUpgrade || null;
  const videoActive = mode === 'video' || videoUpgrade?.status === 'accepted';

  const syncRemoteState = useCallback(() => {
    setRemoteUsers(
      Array.from(usersRef.current.values()).map((u) => ({
        uid: u.uid, hasAudio: !!u.hasAudio, hasVideo: !!u.hasVideo, user: u,
      }))
    );
  }, []);

  // ── Agora listeners (attached before join) ──────────────────────────────────
  const attachListeners = useCallback((client) => {
    client.removeAllListeners();

    client.on('user-joined', (user) => {
      usersRef.current.set(user.uid, user);
      setDroppedNotice(false);
      syncRemoteState();
    });

    client.on('user-published', async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        usersRef.current.set(user.uid, user);
        if (mediaType === 'audio') user.audioTrack?.play();
        syncRemoteState(); // video tiles play themselves once rendered
      } catch (e) {
        logger.error('subscribe failed', e);
      }
    });

    client.on('user-unpublished', (user) => {
      usersRef.current.set(user.uid, user);
      syncRemoteState();
    });

    client.on('user-left', (user, reason) => {
      usersRef.current.delete(user.uid);
      syncRemoteState();
      // ServerTimeOut = their network dropped (not a deliberate hang-up) → keep the call open
      if (reason === 'ServerTimeOut' && usersRef.current.size === 0) setDroppedNotice(true);
    });

    client.on('connection-state-change', (cur, _prev, reason) => {
      if (cur === 'CONNECTED') setConnection('connected');
      else if (cur === 'RECONNECTING') setConnection('reconnecting');
      else if (cur === 'CONNECTING') setConnection('connecting');
      else if (cur === 'DISCONNECTED' && reason !== 'LEAVE' && !endedRef.current) setConnection('disconnected');
    });

    client.on('network-quality', (q) => setNetworkQuality(q.uplinkNetworkQuality || 0));

    client.on('token-privilege-will-expire', () => {
      renewToken(channelName, bookingId).catch((e) => logger.error('Token renew failed', e));
    });
  }, [bookingId, channelName, syncRemoteState]);

  // ── Join (also used for rejoin after a network failure) ─────────────────────
  const join = useCallback(async () => {
    const client = getClient('rtc');
    attachListeners(client);
    usersRef.current.clear();
    syncRemoteState();

    const res = await joinChannel(channelName, null, currentUser.uid, mode === 'video', bookingId);
    if (res?.cancelled) return false;

    // Anyone who was already in the room before we joined
    for (const user of client.remoteUsers) {
      usersRef.current.set(user.uid, user);
      if (user.hasAudio) {
        try { await client.subscribe(user, 'audio'); user.audioTrack?.play(); } catch (e) { logger.error(e); }
      }
      if (user.hasVideo) {
        try { await client.subscribe(user, 'video'); } catch (e) { logger.error(e); }
      }
    }
    syncRemoteState();
    setConnection('connected');
    setLocalVideo(getLocalVideoTrack());
    if (micMuted) await toggleMicrophone(true);
    return true;
  }, [attachListeners, bookingId, channelName, currentUser?.uid, micMuted, mode, syncRemoteState]);

  const init = useCallback(async () => {
    try {
      setPhase('connecting');
      setError(null);
      setIsPermissionError(false);
      durationRef.current = await getCallDurationSeconds(bookingId);
      await startVideoCall(bookingId, currentUser.uid);
      const ok = await join();
      if (ok) setPhase('in_call');
    } catch (err) {
      logger.error('Error initializing call:', err);
      const msg = err?.message || 'Could not connect';
      setIsPermissionError(/denied|permission|microphone|camera/i.test(msg));
      setError(msg);
      setPhase('error');
    }
  }, [bookingId, currentUser?.uid, join]);

  const rejoin = useCallback(async () => {
    setConnection('connecting');
    try {
      await leaveChannel();
      videoUpgradeAppliedRef.current = false;
      await join();
    } catch (e) {
      logger.error('Rejoin failed', e);
      setConnection('disconnected');
    }
  }, [join]);

  // Mount / unmount (StrictMode-safe: only tear down on a real unmount)
  useEffect(() => {
    mountCountRef.current += 1;
    const myMount = mountCountRef.current;
    if (!startedRef.current) {
      startedRef.current = true;
      AgoraRTC.onAutoplayFailed = () => setNeedsAudioUnlock(true);
      init();
    }
    return () => {
      setTimeout(() => {
        if (mountCountRef.current === myMount) leaveChannel().catch(() => {});
      }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser offline / online
  useEffect(() => {
    const off = () => setConnection('reconnecting');
    const on = () => setConnection((c) => (c === 'reconnecting' ? 'connecting' : c));
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, []);

  // ── Live booking (status, shared timer start, video upgrade) ────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'call_bookings', bookingId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setBooking(data);
      if (data.status === 'completed' && endedRef.current) navigate(`/call-summary/${bookingId}`);
    });
    return () => unsub();
  }, [bookingId, navigate]);

  // Countdown from the shared start time (same on both sides and after a rejoin)
  useEffect(() => {
    if (phase !== 'in_call') return;
    const tick = () => {
      const total = durationRef.current ?? 30 * 60;
      const startedAt = toMillis(booking?.callStartedAt);
      const left = startedAt ? Math.max(0, Math.round(total - (Date.now() - startedAt) / 1000)) : total;
      setTimeRemaining(left);
      if (left <= 0 && !endedRef.current) endCallRef.current?.(END_CALL_REASONS.ENDED);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, booking?.callStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the camera mid-call; explain clearly why if it can't (and allow retry)
  const startCamera = async () => {
    setCamError(null);
    try {
      setLocalVideo(await enableLocalVideo());
      setCamOn(true);
      videoUpgradeAppliedRef.current = true;
    } catch (e) {
      videoUpgradeAppliedRef.current = false;
      logger.error('Could not start camera', e);
      const name = e?.name || '';
      const msg = String(e?.message || '');
      if (name === 'NotReadableError' || /NOT_READABLE|in use|Could not start video source/i.test(msg)) {
        setCamError('Your camera is being used by another tab or app (testing both sides on one computer does this). Close it and tap Retry.');
      } else if (name === 'NotAllowedError' || /PERMISSION_DENIED|NotAllowed|Permission/i.test(msg)) {
        setCamError('Camera access is blocked. Tap the 🔒 icon in the address bar → allow Camera, then tap Retry.');
      } else if (name === 'NotFoundError' || /DEVICE_NOT_FOUND|NotFound/i.test(msg)) {
        setCamError('No camera found on this device.');
      } else {
        setCamError(`Camera couldn't start: ${msg || 'unknown error'}`);
      }
    }
  };

  // Voice call upgraded to video → turn camera on (also re-applies after a rejoin)
  useEffect(() => {
    if (mode !== 'voice' || phase !== 'in_call' || connection !== 'connected') return;
    if (videoUpgrade?.status !== 'accepted' || videoUpgradeAppliedRef.current) return;
    videoUpgradeAppliedRef.current = true;
    startCamera();
  }, [mode, phase, connection, videoUpgrade?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video watchdog ──────────────────────────────────────────────────────────
  // iPhones sometimes hand back a camera track that never produces frames (no self-preview, the
  // other side sees nothing), and tracks can drop out of "published" after a reconnect. Every few
  // seconds: re-publish if needed, re-capture a dead camera, and re-subscribe remote video that
  // was published but never arrived.
  const restartCamera = useCallback(async () => {
    setCamFixing(true);
    setCamError(null);
    try {
      const t = await restartLocalVideo();
      setLocalVideo(t);
      setCamOn(true);
    } catch (e) {
      logger.error('Camera restart failed', e);
      setCamError(`Camera couldn't restart: ${e?.message || 'unknown error'}`);
    } finally {
      setCamFixing(false);
    }
  }, []);

  useEffect(() => {
    if (!videoActive || phase !== 'in_call' || connection !== 'connected') return;
    let badChecks = 0;
    let restarts = 0;
    const id = setInterval(async () => {
      const client = getClient('rtc');
      // Remote: published video we never got → subscribe again
      for (const u of client.remoteUsers) {
        if (u.hasVideo && !u.videoTrack) {
          try { await client.subscribe(u, 'video'); usersRef.current.set(u.uid, u); syncRemoteState(); } catch (e) { logger.warn('resubscribe video', e); }
        }
      }
      // Local
      if (!camOn || !getLocalVideoTrack()) { badChecks = 0; return; }
      try { await ensureLocalVideoPublished(); } catch (e) { logger.warn('republish video', e); }
      if (isLocalVideoHealthy()) { badChecks = 0; return; }
      badChecks += 1;
      if (badChecks >= 2 && restarts < 3) { // dead for ~6s → re-capture (max 3 automatic tries)
        badChecks = 0;
        restarts += 1;
        logger.warn('Local camera looks dead — restarting it');
        await restartCamera();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [videoActive, phase, connection, camOn, restartCamera, syncRemoteState]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const toggleMic = async () => {
    const next = !micMuted;
    await toggleMicrophone(next);
    setMicMuted(next);
  };

  const toggleCam = async () => {
    if (!getLocalVideoTrack()) return;
    const next = !camOn;
    await toggleCamera(next);
    setCamOn(next);
  };

  const flipCam = () => switchCamera().catch((e) => logger.error('Flip camera error:', e));

  const unlockAudio = () => {
    usersRef.current.forEach((u) => u.audioTrack?.play());
    setNeedsAudioUnlock(false);
  };

  // Video request: valid for the requester's whole stay (survives reconnects, never times out).
  const requestVideo = async () => {
    await updateDoc(doc(db, 'call_bookings', bookingId), {
      videoUpgrade: { status: 'requested', requestedBy: currentUser.uid, requestedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
  };

  const respondVideo = async (accept) => {
    await updateDoc(doc(db, 'call_bookings', bookingId), {
      'videoUpgrade.status': accept ? 'accepted' : 'declined',
      'videoUpgrade.respondedBy': currentUser.uid,
      'videoUpgrade.respondedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const endCall = async (reason) => {
    if (ending) return;
    setEnding(true);
    try {
      // The requester leaving for good withdraws a still-pending video request
      if (reason !== END_CALL_REASONS.TECHNICAL && videoUpgrade?.status === 'requested'
          && videoUpgrade.requestedBy === currentUser.uid) {
        await updateDoc(doc(db, 'call_bookings', bookingId), { 'videoUpgrade.status': 'withdrawn' }).catch(() => {});
      }
      if (reason !== END_CALL_REASONS.TECHNICAL) endedRef.current = true;
      await endVideoCall(bookingId, currentUser.uid, reason);
    } catch (err) {
      logger.error('Error ending call:', err);
    }
    await leaveChannel().catch(() => {});
    navigate(reason === END_CALL_REASONS.TECHNICAL ? '/my-calls' : `/call-summary/${bookingId}`);
  };
  useEffect(() => { endCallRef.current = endCall; });

  return {
    phase, error, isPermissionError, retry: init,
    connection, rejoin, droppedNotice, networkQuality,
    remoteUsers, needsAudioUnlock, unlockAudio,
    micMuted, toggleMic, camOn, toggleCam, flipCam,
    booking, isCreator, videoUpgrade, videoActive, requestVideo, respondVideo,
    camError, retryCamera: mode === 'video' ? restartCamera : startCamera, dismissCamError: () => setCamError(null),
    localVideo, restartCamera, camFixing, getDiagnostics: getCallDiagnostics,
    timeRemaining, ending, endCall,
  };
}
