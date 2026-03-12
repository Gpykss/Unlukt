// src/services/agoraService.js
import AgoraRTC from 'agora-rtc-sdk-ng';
import { auth } from '../config/firebase';
import logger from '../utils/logger';

const AGORA_TOKEN_URL = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL + '/getAgoraToken';

let client = null;
let localAudioTrack = null;
let localVideoTrack = null;

export const initializeAgoraClient = () => {
  if (!client) {
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    logger.info('Agora client initialized');
  }
  return client;
};

/**
 * Wait for Firebase auth to be ready
 */
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

/**
 * Fetch a token from your Cloud Function
 */
const fetchAgoraToken = async (channelName, bookingId) => {
  const user = await getAuthUser();
  const idToken = await user.getIdToken(true);

  const res = await fetch(AGORA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ channelName, bookingId }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to get Agora token');
  }

  const data = await res.json();

  if (!data.token) {
    throw new Error('Agora token is empty — check App ID and Certificate in Firebase secrets');
  }

  logger.info('Agora token fetched for channel:', channelName);
  return data;
};

/**
 * ✅ Request mic/camera permissions BEFORE joining
 * Returns { granted: true } or { granted: false, reason: string }
 */
export const requestMediaPermissions = async (videoEnabled = true) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: videoEnabled,
    });
    // Release immediately — just needed the browser permission prompt
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

/**
 * Human-readable error message for permission failures
 */
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

/**
 * Join a call channel — requests permissions first, then fetches token
 */
export const joinChannel = async (channelName, _tokenIgnored, uid, videoEnabled = true, bookingId = null) => {
  try {
    if (!client) initializeAgoraClient();

    // ✅ Prevent double-join
    if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') {
      logger.warn('Client already connected — leaving first');
      await client.leave();
      if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
    }

    // ✅ Check permissions BEFORE doing anything else
    const perm = await requestMediaPermissions(videoEnabled);
    if (!perm.granted) {
      throw new Error(getPermissionErrorMessage(perm.reason, videoEnabled));
    }

    const resolvedBookingId = bookingId || channelName.replace(/^(video|voice)_/, '');

    logger.info('Fetching Agora token for channel:', channelName);
    const { token, appId, uid: agoraUid } = await fetchAgoraToken(channelName, resolvedBookingId);

    logger.info('Joining Agora channel:', channelName, 'Video:', videoEnabled);
    const joinedUid = await client.join(appId, channelName, token, agoraUid);
    logger.info('Joined channel. UID:', joinedUid);

    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);
    logger.info('Audio track published');

    if (videoEnabled) {
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      await client.publish([localVideoTrack]);
      logger.info('Video track published');
    }

    return { uid: joinedUid, audioTrack: localAudioTrack, videoTrack: localVideoTrack };
  } catch (error) {
    logger.error('Failed to join Agora channel:', error);
    throw error;
  }
};

export const leaveChannel = async () => {
  try {
    if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
    if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
    if (client && client.connectionState !== 'DISCONNECTED') {
      await client.leave();
      logger.info('Left Agora channel');
    }
  } catch (error) {
    logger.error('Error leaving channel:', error);
  }
};

export const toggleMicrophone = async (muted) => {
  if (localAudioTrack) {
    await localAudioTrack.setEnabled(!muted);
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
  if (localVideoTrack) {
    await localVideoTrack.switchDevice();
    logger.info('Camera switched');
  }
};

export const playRemoteMedia = (user, mediaType, videoElement = null) => {
  if (mediaType === 'video' && videoElement) {
    user.videoTrack?.play(videoElement);
    logger.info('Playing remote video for user:', user.uid);
  } else if (mediaType === 'audio') {
    user.audioTrack?.play();
    logger.info('Playing remote audio for user:', user.uid);
  }
};

export const playLocalVideo = (videoElement) => {
  if (localVideoTrack && videoElement) {
    localVideoTrack.play(videoElement);
    logger.info('Playing local video preview');
  }
};

export const getClient = () => {
  if (!client) initializeAgoraClient();
  return client;
};

export const setupCallTimer = (onTimeUp, duration = 30 * 60 * 1000) => {
  logger.info('Call timer set for', duration / 1000 / 60, 'minutes');
  return setTimeout(() => {
    logger.warn('Call duration limit reached - disconnecting');
    onTimeUp();
  }, duration);
};

export const cleanup = async () => {
  await leaveChannel();
  if (client) { client.removeAllListeners(); client = null; }
  logger.info('Agora resources cleaned up');
};

export default {
  initializeAgoraClient, joinChannel, leaveChannel,
  requestMediaPermissions, getPermissionErrorMessage,
  toggleMicrophone, toggleCamera, switchCamera,
  playRemoteMedia, playLocalVideo, getClient,
  setupCallTimer, cleanup,
};