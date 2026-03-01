// src/services/agoraService.js - Agora RTC Integration

import AgoraRTC from 'agora-rtc-sdk-ng';
import logger from '../utils/logger';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID;

/**
 * Agora client instance
 */
let client = null;
let localAudioTrack = null;
let localVideoTrack = null;

/**
 * Initialize Agora client
 */
export const initializeAgoraClient = () => {
  if (!AGORA_APP_ID) {
    throw new Error('Agora App ID not configured. Add VITE_AGORA_APP_ID to .env');
  }
  
  if (!client) {
    client = AgoraRTC.createClient({ 
      mode: 'rtc', 
      codec: 'vp8' 
    });
    
    logger.info('Agora client initialized');
  }
  
  return client;
};

/**
 * Join a call channel
 * @param {string} channelName - Unique channel identifier
 * @param {string} token - Token from backend (null for testing without certificate)
 * @param {string} uid - User ID (optional, Agora will generate if null)
 * @param {boolean} videoEnabled - Enable video (true) or audio-only (false)
 */
export const joinChannel = async (channelName, token, uid, videoEnabled = true) => {
  try {
    if (!client) {
      initializeAgoraClient();
    }
    
    logger.info('Joining Agora channel:', channelName, 'Video:', videoEnabled);
    
    // Join the channel
    const agoraUid = await client.join(AGORA_APP_ID, channelName, token, uid);
    
    logger.success('Joined channel successfully. UID:', agoraUid);
    
    // Create and publish audio track
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);
    
    logger.success('Audio track published');
    
    // Create and publish video track (if video call)
    if (videoEnabled) {
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      await client.publish([localVideoTrack]);
      
      logger.success('Video track published');
    }
    
    return {
      uid: agoraUid,
      audioTrack: localAudioTrack,
      videoTrack: localVideoTrack
    };
  } catch (error) {
    logger.error('Failed to join Agora channel:', error);
    throw error;
  }
};

/**
 * Leave the call channel
 */
export const leaveChannel = async () => {
  try {
    // Close local tracks
    if (localAudioTrack) {
      localAudioTrack.close();
      localAudioTrack = null;
    }
    
    if (localVideoTrack) {
      localVideoTrack.close();
      localVideoTrack = null;
    }
    
    // Leave the channel
    if (client) {
      await client.leave();
      logger.success('Left Agora channel');
    }
  } catch (error) {
    logger.error('Error leaving channel:', error);
    throw error;
  }
};

/**
 * Mute/Unmute microphone
 */
export const toggleMicrophone = async (muted) => {
  if (localAudioTrack) {
    await localAudioTrack.setEnabled(!muted);
    logger.info('Microphone', muted ? 'muted' : 'unmuted');
  }
};

/**
 * Toggle camera on/off
 */
export const toggleCamera = async (enabled) => {
  if (localVideoTrack) {
    await localVideoTrack.setEnabled(enabled);
    logger.info('Camera', enabled ? 'enabled' : 'disabled');
  }
};

/**
 * Switch camera (front/back on mobile)
 */
export const switchCamera = async () => {
  if (localVideoTrack) {
    await localVideoTrack.switchDevice();
    logger.info('Camera switched');
  }
};

/**
 * Play remote user's audio/video
 * @param {HTMLElement} videoElement - DOM element to play video
 * @param {object} user - Remote user object
 * @param {string} mediaType - 'audio' or 'video'
 */
export const playRemoteMedia = (user, mediaType, videoElement = null) => {
  if (mediaType === 'video' && videoElement) {
    user.videoTrack?.play(videoElement);
    logger.info('Playing remote video for user:', user.uid);
  } else if (mediaType === 'audio') {
    user.audioTrack?.play();
    logger.info('Playing remote audio for user:', user.uid);
  }
};

/**
 * Play local video preview
 * @param {HTMLElement} videoElement - DOM element to play video
 */
export const playLocalVideo = (videoElement) => {
  if (localVideoTrack && videoElement) {
    localVideoTrack.play(videoElement);
    logger.info('Playing local video preview');
  }
};

/**
 * Get client instance (for subscribing to events)
 */
export const getClient = () => {
  if (!client) {
    initializeAgoraClient();
  }
  return client;
};

/**
 * Set up call duration timer (30 minutes auto-disconnect)
 * @param {function} onTimeUp - Callback when time is up
 * @param {number} duration - Duration in milliseconds (default: 30 minutes)
 */
export const setupCallTimer = (onTimeUp, duration = 30 * 60 * 1000) => {
  logger.info('Call timer set for', duration / 1000 / 60, 'minutes');
  
  const timer = setTimeout(() => {
    logger.warn('Call duration limit reached - disconnecting');
    onTimeUp();
  }, duration);
  
  return timer;
};

/**
 * Clean up Agora resources
 */
export const cleanup = async () => {
  await leaveChannel();
  
  if (client) {
    client.removeAllListeners();
    client = null;
  }
  
  logger.info('Agora resources cleaned up');
};

export default {
  initializeAgoraClient,
  joinChannel,
  leaveChannel,
  toggleMicrophone,
  toggleCamera,
  switchCamera,
  playRemoteMedia,
  playLocalVideo,
  getClient,
  setupCallTimer,
  cleanup
};
