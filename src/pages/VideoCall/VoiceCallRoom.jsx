// src/pages/VideoCall/VoiceCallRoom.jsx - Voice Call Interface (Audio Only)

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, MicOff, Phone, Loader2, AlertCircle, User } from 'lucide-react';
import { joinChannel, leaveChannel, toggleMicrophone, playRemoteMedia, getClient, setupCallTimer } from '../../services/agoraService';
import { startVideoCall, endVideoCall } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';

export default function VoiceCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30 * 60); // 30 minutes
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    initCall();
    
    return () => {
      cleanup();
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (inCall && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleEndCall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [inCall, timeRemaining]);

  const initCall = async () => {
    try {
      setLoading(true);

      // Mark call as started
      await startVideoCall(bookingId, currentUser.uid);

      // Join Agora channel (audio only)
      const channelName = `voice_${bookingId}`;
      await joinChannel(channelName, null, currentUser.uid, false); // false = audio only

      // Listen for remote users
      const client = getClient();
      
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        
        if (mediaType === 'audio') {
          playRemoteMedia(user, 'audio');
          setRemoteConnected(true);
        }
      });

      client.on('user-unpublished', (user) => {
        logger.info('Remote user disconnected:', user.uid);
        setRemoteConnected(false);
      });

      setInCall(true);
      setLoading(false);

      // Setup 30-min auto-disconnect
      setupCallTimer(() => {
        alert('Call time limit reached (30 minutes)');
        handleEndCall();
      });

    } catch (error) {
      logger.error('Error initializing call:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const handleMicToggle = async () => {
    await toggleMicrophone(!micMuted);
    setMicMuted(!micMuted);
  };

  const handleEndCall = async () => {
    try {
      await endVideoCall(bookingId);
      await cleanup();
      navigate('/dashboard');
    } catch (error) {
      logger.error('Error ending call:', error);
      await cleanup();
      navigate('/dashboard');
    }
  };

  const cleanup = async () => {
    try {
      await leaveChannel();
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-300 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Connecting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">Connection Failed</h2>
          <p className="text-blue-200 mb-6">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 text-center max-w-md w-full px-6">
        {/* Avatar */}
        <motion.div
          animate={{
            scale: remoteConnected ? [1, 1.1, 1] : 1,
          }}
          transition={{
            duration: 2,
            repeat: remoteConnected ? Infinity : 0,
            ease: "easeInOut"
          }}
          className="mx-auto mb-8"
        >
          <div className="w-48 h-48 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-2xl">
            <User className="w-24 h-24 text-white" />
          </div>
        </motion.div>

        {/* Status */}
        <div className="mb-4">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${
            remoteConnected 
              ? 'bg-green-500/20 text-green-300 border border-green-500/50' 
              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              remoteConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'
            }`} />
            {remoteConnected ? 'Connected' : 'Waiting...'}
          </div>
        </div>

        {/* Timer */}
        <div className={`mb-12 text-6xl font-bold ${
          timeRemaining < 60 ? 'text-red-400 animate-pulse' : 'text-white'
        }`}>
          {formatTime(timeRemaining)}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center space-x-6 mb-8">
          {/* Mic Toggle */}
          <button
            onClick={handleMicToggle}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition transform hover:scale-110 shadow-xl ${
              micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {micMuted ? (
              <MicOff className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCall}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition transform hover:scale-110 shadow-2xl"
          >
            <Phone className="w-9 h-9 text-white rotate-135" />
          </button>
        </div>

        {/* Warning Message (Last Minute) */}
        {timeRemaining < 60 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-6 py-3 bg-red-500/90 text-white font-bold rounded-xl shadow-lg backdrop-blur-sm"
          >
            ⚠️ Call ending in less than 1 minute!
          </motion.div>
        )}

        {/* Info */}
        <p className="mt-8 text-blue-200 text-sm">
          Voice calls auto-disconnect after 30 minutes
        </p>
      </div>
    </div>
  );
}
