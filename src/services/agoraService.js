// src/services/agoraService.js
import AgoraRTC from 'agora-rtc-sdk-ng';
import { auth } from '../config/firebase';
import logger from '../utils/logger';

const AGORA_TOKEN_URL = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/getAgoraToken';

let client = null;
let clientMode = null;
let localAudioTrack = null;
let localVideoTrack = null;

export const initializeAgoraClient = (mode = 'rtc', mountId = null) => {
  if (client) {
    logger.info(`Cleaning up existing client instance (ID: ${client.clientId}, State: ${client.connectionState}) to allocate a fresh one.`);
    try {
      if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
      client.removeAllListeners();
      if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') {
        client.leave().catch(err => logger.error('Background leave error:', err));
      }
    } catch (e) {
      logger.error('Error cleaning up previous client instance:', e);
    }
    client = null;
  }

  // h264: iPhones (Safari/WebKit — every iOS browser) send video reliably with it; Chrome/Android support it too
  client = AgoraRTC.createClient({ mode, codec: 'h264' });
  client.clientId = Math.random().toString();
  client.mountId = mountId;
  clientMode = mode;
  logger.info(`Agora client initialized in mode: ${mode} with ID: ${client.clientId} and Mount ID: ${mountId}`);
  return client;
};

const getAuthUser = () => {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) { resolve(auth.currentUser); return; }
    const timer = setTimeout(() => reject(new Error('Auth timeout — not signed in')), 5000);
    const unsub = auth.onAuthStateChanged((user) => {
      clearTimeout(timer);
      unsub();
      if (user) resolve(user);
      else reject(new Error('Not authenticated'));
    });
  });
};

export const fetchAgoraToken = async (channelName, bookingId, creatorId = null, isLivestream = false) => {
  const user = await getAuthUser();
  const idToken = await user.getIdToken(true);

  const bodyPayload = { channelName };
  if (bookingId) bodyPayload.bookingId = bookingId;
  if (creatorId) bodyPayload.creatorId = creatorId;
  if (isLivestream) bodyPayload.isLivestream = isLivestream;

  // 20s timeout + one retry: on a dropped/slow connection the user sees an error with "Try again"
  // instead of an endless spinner (a repeat request is safe — tickets are charged once per hour)
  const attempt = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      return await fetch(AGORA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(bodyPayload),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
  };
  let res;
  try {
    res = await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    try { res = await attempt(); } catch {
      throw new Error(navigator.onLine === false ? "You're offline — reconnect and try again." : 'Network is slow — could not connect. Try again.');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get Agora token');
  }

  const data = await res.json();

  if (!data.token) {
    throw new Error('Agora token is empty — check App ID and Certificate in Firebase secrets');
  }

  logger.info('Agora token fetched for channel:', channelName);
  return data;
};

export const requestMediaPermissions = async (videoEnabled = true) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: videoEnabled,
    });
    stream.getTracks().forEach(t => t.stop());
    logger.info('Media permissions granted');
    return { granted: true };
  } catch (err) {
    logger.warn('Media permission error:', err.name, err.message);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return { granted: false, reason: 'permission_denied' };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return { granted: false, reason: 'no_device' };
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return { granted: false, reason: 'device_in_use' };
    }
    return { granted: false, reason: err.message };
  }
};

export const getPermissionErrorMessage = (reason, videoEnabled = true) => {
  const device = videoEnabled ? 'microphone and camera' : 'microphone';
  switch (reason) {
    case 'permission_denied':
      return `${videoEnabled ? 'Camera and microphone' : 'Microphone'} access was denied. Please click the lock icon in your browser's address bar and allow ${device} access, then refresh and try again.`;
    case 'no_device':
      return `No ${device} was found on your device. Please connect a ${device} and try again.`;
    case 'device_in_use':
      return `Your ${device} is being used by another app. Please close other apps (like Zoom, Teams, etc.) and try again.`;
    default:
      return `Could not access your ${device}: ${reason}`;
  }
};

export const joinChannel = async (
  channelName,
  _tokenIgnored,
  uid,
  videoEnabled = true,
  bookingId = null,
  role = 'audience',
  creatorId = null,
  isLivestream = false,
  mountId = null
) => {
  const mode = isLivestream ? 'live' : 'rtc';
  const localClient = getClient(mode, mountId);
  const localClientId = localClient?.clientId;

  try {
    if (client.connectionState === 'CONNECTING') {
      // Another join on this client is in flight — wait briefly for it to settle before leaving
      await new Promise((resolve) => {
        const started = Date.now();
        const check = () => (client?.connectionState !== 'CONNECTING' || Date.now() - started > 4000)
          ? resolve() : setTimeout(check, 100);
        check();
      });
      if (!client || client.clientId !== localClientId) return { cancelled: true };
    }
    if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING' || client.connectionState === 'RECONNECTING') {
      logger.warn('Client already connected — leaving first');
      try {
        await client.leave();
      } catch (err) {
        logger.warn('Ignored error during client leave on join:', err);
      }
      if (!client || client.clientId !== localClientId) {
        logger.warn('Agora client was cleaned up or replaced during leave');
        return { cancelled: true };
      }
      if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
    }

    const shouldPublish = !isLivestream || role === 'host';

    // iOS: opening the camera, closing it, and reopening it right away often yields a black/dead
    // camera track (no local preview, nothing reaches the other side). Skip the probe there —
    // Agora's own capture below asks for permission and reports errors.
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (shouldPublish && !isIOS) {
      const perm = await requestMediaPermissions(videoEnabled);
      if (!client || client.clientId !== localClientId) {
        logger.warn('Agora client was cleaned up or replaced during permissions check');
        return { cancelled: true };
      }
      if (!perm.granted) {
        throw new Error(getPermissionErrorMessage(perm.reason, videoEnabled));
      }
    }

    const resolvedBookingId = isLivestream ? null : (bookingId || channelName.replace(/^(video|voice)_/, ''));

    logger.info('Fetching Agora token for channel:', channelName);
    const { token, appId, uid: agoraUid } = await fetchAgoraToken(channelName, resolvedBookingId, creatorId, isLivestream);
    if (!client || client.clientId !== localClientId) {
      logger.warn('Agora client was cleaned up or replaced during token fetch');
      return { cancelled: true };
    }

    if (isLivestream) {
      logger.info('Setting Agora client role to:', role);
      await client.setClientRole(role);
    }

    logger.info('Joining Agora channel:', channelName, 'Video:', videoEnabled, 'Role:', role);
    const joinedUid = await client.join(appId, channelName, token, agoraUid);
    logger.info('Joined channel. UID:', joinedUid);

    if (shouldPublish) {
      if (videoEnabled) {
        // Mic + camera in ONE capture (one permission prompt; most reliable on iPhone)
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        try {
          [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            {},
            { facingMode: isMobile ? 'user' : undefined, encoderConfig: '480p_1' }
          );
        } catch (e) {
          throw new Error(getPermissionErrorMessage(
            e?.name === 'NotAllowedError' || /PERMISSION_DENIED/.test(e?.message || '') ? 'permission_denied'
              : /NOT_READABLE|NotReadable/.test(e?.message || e?.name || '') ? 'device_in_use'
              : /DEVICE_NOT_FOUND|NotFound/.test(e?.message || e?.name || '') ? 'no_device'
              : (e?.message || 'unknown'), true));
        }
        await client.publish([localAudioTrack, localVideoTrack]);
        logger.info('Audio + video published');
      } else {
        try {
          localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        } catch (e) {
          throw new Error(getPermissionErrorMessage(
            e?.name === 'NotAllowedError' || /PERMISSION_DENIED/.test(e?.message || '') ? 'permission_denied' : (e?.message || 'unknown'), false));
        }
        await client.publish([localAudioTrack]);
        logger.info('Audio track published');
      }
    }

    return { uid: joinedUid, audioTrack: localAudioTrack, videoTrack: localVideoTrack };
  } catch (error) {
    logger.error('Failed to join Agora channel:', error);
    throw error;
  }
};

export const changeClientRole = async (newRole) => {
  if (!client) return;
  try {
    logger.info('Changing client role dynamically to:', newRole);
    await client.setClientRole(newRole);

    if (newRole === 'host') {
      localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await client.publish([localAudioTrack]);
      
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      localVideoTrack = await AgoraRTC.createCameraVideoTrack({
        optimizationMode: 'detail',
        facingMode: isMobile ? 'user' : undefined,
      });
      await client.publish([localVideoTrack]);
      logger.info('Dynamic tracks published successfully');
    } else {
      if (localAudioTrack) {
        await client.unpublish([localAudioTrack]);
        localAudioTrack.close();
        localAudioTrack = null;
      }
      if (localVideoTrack) {
        await client.unpublish([localVideoTrack]);
        localVideoTrack.close();
        localVideoTrack = null;
      }
      logger.info('Dynamic tracks unpublished and closed successfully');
    }
  } catch (err) {
    logger.error('Failed to change client role dynamically:', err);
    throw err;
  }
};

export const leaveChannel = async (clientIdToLeave = null) => {
  try {
    if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
    if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
    if (client && (!clientIdToLeave || client.clientId === clientIdToLeave) && client.connectionState !== 'DISCONNECTED') {
      await client.leave();
      logger.info('Left Agora channel. ClientID:', clientIdToLeave);
    } else {
      logger.info('Leave channel skipped. Target ID mismatch or client already disconnected. Target:', clientIdToLeave, 'Current:', client?.clientId);
    }
  } catch (error) {
    logger.error('Error leaving channel:', error);
  }
};

export const toggleMicrophone = async (muted) => {
  if (localAudioTrack) {
    // setMuted keeps the mic track published (sends silence) — no re-publish, no permission re-prompt,
    // and the other side never loses the audio subscription.
    await localAudioTrack.setMuted(muted);
    logger.info('Microphone', muted ? 'muted' : 'unmuted');
  }
};

export const toggleCamera = async (enabled) => {
  if (localVideoTrack) {
    await localVideoTrack.setEnabled(enabled);
    logger.info('Camera', enabled ? 'enabled' : 'disabled');
  }
};

export const switchCamera = async () => {
  if (!localVideoTrack) return;
  try {
    const devices = await AgoraRTC.getDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    if (videoDevices.length <= 1) return;
    const currentId = localVideoTrack.getMediaStreamTrack().getSettings().deviceId;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];
    await localVideoTrack.setDevice(nextDevice.deviceId);
    logger.info('Switched camera to device:', nextDevice.label || nextDevice.deviceId);
  } catch (err) {
    logger.error('Failed to switch camera:', err);
  }
};

/**
 * Turn the camera on mid-call (e.g. a voice call upgraded to video). Safe to call twice.
 * Returns the local video track.
 */
export const enableLocalVideo = async () => {
  if (!client) throw new Error('Not in a call');
  if (localVideoTrack) {
    await localVideoTrack.setEnabled(true);
    return localVideoTrack;
  }
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  localVideoTrack = await AgoraRTC.createCameraVideoTrack({
    optimizationMode: 'detail',
    facingMode: isMobile ? 'user' : undefined,
  });
  await client.publish([localVideoTrack]);
  logger.info('Camera enabled mid-call');
  return localVideoTrack;
};

export const getLocalVideoTrack = () => localVideoTrack;

/** Is the local camera actually producing frames? (iOS can hand back a dead/black track) */
export const isLocalVideoHealthy = () => {
  const mst = localVideoTrack?.getMediaStreamTrack?.();
  if (!mst) return false;
  return mst.readyState === 'live' && !mst.muted;
};

/**
 * Throw away the current camera track and capture a fresh one, then publish it.
 * Fixes "my camera shows nothing / the other side can't see me" without leaving the call.
 */
export const restartLocalVideo = async () => {
  if (!client) throw new Error('Not in a call');
  const old = localVideoTrack;
  localVideoTrack = null;
  if (old) {
    try { if (client.localTracks.includes(old)) await client.unpublish([old]); } catch (e) { logger.warn('unpublish old video', e); }
    try { old.close(); } catch { /* ignore */ }
  }
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  localVideoTrack = await AgoraRTC.createCameraVideoTrack({
    facingMode: isMobile ? 'user' : undefined,
    encoderConfig: '480p_1',
  });
  await client.publish([localVideoTrack]);
  logger.info('Camera restarted and republished');
  return localVideoTrack;
};

/** Make sure our camera track is actually published (it can drop after a reconnect). */
export const ensureLocalVideoPublished = async () => {
  if (!client || !localVideoTrack || client.connectionState !== 'CONNECTED') return false;
  if (client.localTracks.includes(localVideoTrack) || !localVideoTrack.enabled) return false;
  await client.publish([localVideoTrack]);
  logger.info('Re-published local video');
  return true;
};

/** Snapshot of what's really happening with the media — shown in the call's info panel. */
export const getCallDiagnostics = () => {
  const mst = localVideoTrack?.getMediaStreamTrack?.();
  const settings = mst?.getSettings?.() || {};
  let localStats = {};
  let remoteStats = {};
  try { localStats = client?.getLocalVideoStats?.() || {}; } catch { /* ignore */ }
  try { remoteStats = client?.getRemoteVideoStats?.() || {}; } catch { /* ignore */ }
  return {
    browser: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90),
    connection: client?.connectionState || 'none',
    myUid: client?.uid ?? null,
    published: (client?.localTracks || []).map((t) => t.trackMediaType || (t.getMediaStreamTrack?.()?.kind)),
    camera: localVideoTrack ? {
      state: mst?.readyState || '?', muted: !!mst?.muted, enabled: localVideoTrack.enabled !== false,
      size: settings.width ? `${settings.width}x${settings.height}` : '?',
      sendKbps: localStats.sendBitrate ? Math.round(localStats.sendBitrate / 1000) : 0,
      sendFps: localStats.sendFrameRate || 0,
    } : null,
    mic: localAudioTrack ? { muted: !!localAudioTrack.muted, enabled: localAudioTrack.enabled !== false } : null,
    remotes: (client?.remoteUsers || []).map((u) => {
      const st = remoteStats[u.uid] || {};
      return {
        uid: u.uid, hasVideo: !!u.hasVideo, hasAudio: !!u.hasAudio, subscribedVideo: !!u.videoTrack,
        recvKbps: st.receiveBitrate ? Math.round(st.receiveBitrate / 1000) : 0,
        recvFps: st.receiveFrameRate || 0, renderFps: st.renderFrameRate || 0,
        size: st.receiveResolutionWidth ? `${st.receiveResolutionWidth}x${st.receiveResolutionHeight}` : '-',
      };
    }),
  };
};

/** Refresh the Agora token before it expires (tokens last 1h; calls can run 90 min). */
export const renewToken = async (channelName, bookingId) => {
  if (!client) return;
  const { token } = await fetchAgoraToken(channelName, bookingId);
  await client.renewToken(token);
  logger.info('Agora token renewed');
};

export const playRemoteMedia = (user, containerId, videoEnabled = true) => {
  if (!user) return;
  if (videoEnabled && user.hasVideo) {
    user.videoTrack?.play(containerId);
    logger.info('Playing remote video track for user:', user.uid);
  }
  if (user.hasAudio) {
    user.audioTrack?.play();
    logger.info('Playing remote audio track for user:', user.uid);
  }
};

export const playLocalVideo = (containerId) => {
  if (localVideoTrack) {
    localVideoTrack.play(containerId);
    logger.info('Playing local video track');
  }
};

export const getClient = (mode = 'rtc', mountId = null) => {
  if (!client || (mountId && client.mountId !== mountId)) {
    initializeAgoraClient(mode, mountId);
  }
  return client;
};

export const setupCallTimer = (onTimeUp, duration = 30 * 60 * 1000) => {
  logger.info('Call timer set for', duration / 1000 / 60, 'minutes');
  return setTimeout(() => {
    logger.warn('Call duration limit reached - disconnecting');
    onTimeUp();
  }, duration);
};

export const cleanup = async (clientIdToCleanup = null) => {
  const clientToLeave = client;
  
  if (client && (!clientIdToCleanup || client.clientId === clientIdToCleanup)) {
    client.removeAllListeners();
    client = null;
    clientMode = null;
    logger.info('Agora global client reference released immediately.');
  }

  // Perform leaving asynchronously in the background
  if (clientToLeave && (!clientIdToCleanup || clientToLeave.clientId === clientIdToCleanup)) {
    try {
      if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
      if (clientToLeave.connectionState !== 'DISCONNECTED') {
        await clientToLeave.leave();
        logger.info('Background client leave completed. ClientID:', clientIdToCleanup);
      }
    } catch (err) {
      logger.error('Error leaving client in background:', err);
    }
  } else {
    logger.info('Agora background cleanup skipped or target ID mismatch. Target:', clientIdToCleanup, 'Current:', clientToLeave?.clientId);
  }
};

export default {
  initializeAgoraClient, joinChannel, leaveChannel,
  requestMediaPermissions, getPermissionErrorMessage,
  toggleMicrophone, toggleCamera, switchCamera, enableLocalVideo, getLocalVideoTrack, renewToken, fetchAgoraToken,
  restartLocalVideo, ensureLocalVideoPublished, isLocalVideoHealthy, getCallDiagnostics,
  playRemoteMedia, playLocalVideo, getClient,
  setupCallTimer, cleanup, changeClientRole,
};