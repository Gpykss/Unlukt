// src/pages/VideoCall/VideoCallRoom.jsx

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, VideoOff, Mic, MicOff, Phone, Loader2, AlertCircle } from 'lucide-react';
import {
  joinChannel, leaveChannel, toggleMicrophone, toggleCamera,
  playLocalVideo, playRemoteMedia, getClient
} from '../../services/agoraService';
import { startVideoCall, endVideoCall, getCallDurationSeconds } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import { generateWatermarkText, getRandomWatermarkPosition } from '../../utils/antiPiracy';
import useScreenProtection from '../../hooks/useScreenProtection';
import logger from '../../utils/logger';

export default function VideoCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();

  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null); // set after booking loaded
  const [watermarkPos, setWatermarkPos] = useState(getRandomWatermarkPosition());
  const [error, setError] = useState(null);

  useScreenProtection([localVideoRef, remoteVideoRef], {
    onRecordingDetected: () => {
      alert('Screen recording detected! Call will be terminated.');
      handleEndCall();
    }
  });

  useEffect(() => {
    initCall();
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (inCall) {
      const interval = setInterval(() => setWatermarkPos(getRandomWatermarkPosition()), 3000);
      return () => clearInterval(interval);
    }
  }, [inCall]);

  // Timer — only starts once timeRemaining is set and call is in progress
  useEffect(() => {
    if (!inCall || timeRemaining === null || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleEndCall();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  const initCall = async () => {
    try {
      setLoading(true);

      // 1. Get booked duration first
      const durationSecs = await getCallDurationSeconds(bookingId);
      setTimeRemaining(durationSecs);

      // 2. Mark as in_progress (works for both user and creator)
      await startVideoCall(bookingId, currentUser.uid);

      // 3. Join Agora channel
      const channelName = `video_${bookingId}`;
      await joinChannel(channelName, null, currentUser.uid, true);
      playLocalVideo(localVideoRef.current);

      const client = getClient();
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') playRemoteMedia(user, 'video', remoteVideoRef.current);
        if (mediaType === 'audio') playRemoteMedia(user, 'audio');
      });

      setInCall(true);
      setLoading(false);
    } catch (err) {
      logger.error('Error initializing video call:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleMicToggle = async () => {
    await toggleMicrophone(!micMuted);
    setMicMuted(!micMuted);
  };

  const handleVideoToggle = async () => {
    await toggleCamera(videoOff);
    setVideoOff(!videoOff);
  };

  const handleEndCall = async () => {
    try {
      await endVideoCall(bookingId);
      await cleanup();
    } catch (err) {
      logger.error('Error ending call:', err);
      await cleanup();
    } finally {
      navigate(`/call-summary/${bookingId}`);
    }
  };

  const cleanup = async () => {
    try { await leaveChannel(); } catch (e) { logger.error('Cleanup error:', e); }
  };

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-rose-500 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Connecting...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">Connection Failed</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition">
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const watermarkText = generateWatermarkText(currentUser.uid, userProfile?.email);
  const isLowTime = timeRemaining !== null && timeRemaining < 60;

  return (
    <div className="min-h-screen bg-gray-900 relative overflow-hidden">
      {/* Remote Video */}
      <div ref={remoteVideoRef} className="absolute inset-0 bg-black" />

      {/* Local Video PiP */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 z-10">
        <div ref={localVideoRef} className="w-full h-full" />
        {videoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <VideoOff className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {/* Watermark */}
      <motion.div
        key={JSON.stringify(watermarkPos)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3, ...watermarkPos }}
        transition={{ duration: 0.5 }}
        className="absolute text-white/30 font-mono text-sm select-none pointer-events-none z-20"
        style={{ textShadow: '0 0 10px rgba(0,0,0,0.5)' }}
      >
        {watermarkText}
      </motion.div>

      {/* Timer */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className={`px-6 py-3 rounded-full font-bold text-lg ${
          isLowTime ? 'bg-red-500 animate-pulse' : 'bg-black/50'
        } text-white backdrop-blur-sm`}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex items-center space-x-4 bg-black/50 backdrop-blur-md px-6 py-4 rounded-full">
          <button onClick={handleMicToggle}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}>
            {micMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </button>

          <button onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition transform hover:scale-110">
            <Phone className="w-7 h-7 text-white rotate-135" />
          </button>

          <button onClick={handleVideoToggle}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              videoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}>
            {videoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
          </button>
        </div>
      </div>

      {isLowTime && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-20 left-1/2 transform -translate-x-1/2 z-10"
        >
          <div className="px-6 py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg">
            ⚠️ Call ending in less than 1 minute!
          </div>
        </motion.div>
      )}
    </div>
  );
}