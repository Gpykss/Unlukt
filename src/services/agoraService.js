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

export const joinChannel = async (channelName, _tokenIgnored, uid, videoEnabled = true, bookingId = null) => {
  try {
    if (!client) initializeAgoraClient();

    if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') {
      logger.warn('Client already connected — leaving first');
      await client.leave();
      if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
    }

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

    // ✅ No constraints — maximum device compatibility including mobile
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);
    logger.info('Audio track published');

    if (videoEnabled) {
      // ✅ Use ideal/min instead of exact — mobile browsers reject strict constraints
      localVideoTrack = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: {
          width: { ideal: 640, min: 320 },
          height: { ideal: 480, min: 240 },
          frameRate: { ideal: 15, min: 5 },
          bitrateMin: 200,
          bitrateMax: 800,
        },
        optimizationMode: 'motion',
      });
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

// ✅ Fixed — waits for track to exist before playing
export const playLocalVideo = (videoElement) => {
  if (!videoElement) return;
  if (localVideoTrack) {
    localVideoTrack.play(videoElement);
    logger.info('Playing local video preview');
    return;
  }
  // If track not ready yet, retry after short delay (mobile is slower)
  const retry = setInterval(() => {
    if (localVideoTrack) {
      localVideoTrack.play(videoElement);
      logger.info('Playing local video preview (delayed)');
      clearInterval(retry);
    }
  }, 200);
  // Give up after 5 seconds
  setTimeout(() => clearInterval(retry), 5000);
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