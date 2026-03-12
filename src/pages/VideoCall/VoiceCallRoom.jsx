// src/pages/VideoCall/VoiceCallRoom.jsx

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, MicOff, Phone, Loader2, AlertCircle, User, RefreshCw } from 'lucide-react';
import {
  joinChannel, leaveChannel, toggleMicrophone, playRemoteMedia, getClient
} from '../../services/agoraService';
import { startVideoCall, endVideoCall, getCallDurationSeconds } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';

export default function VoiceCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const initRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [error, setError] = useState(null);
  const [isPermissionError, setIsPermissionError] = useState(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initCall();
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (!inCall || timeRemaining === null || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) { clearInterval(timer); handleEndCall(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  const initCall = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsPermissionError(false);

      const durationSecs = await getCallDurationSeconds(bookingId);
      setTimeRemaining(durationSecs);

      await startVideoCall(bookingId, currentUser.uid);

      const channelName = `voice_${bookingId}`;
      await joinChannel(channelName, null, currentUser.uid, false, bookingId);

      const client = getClient();
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          playRemoteMedia(user, 'audio');
          setRemoteConnected(true);
        }
      });
      client.on('user-unpublished', () => setRemoteConnected(false));

      setInCall(true);
      setLoading(false);
    } catch (err) {
      logger.error('Error initializing voice call:', err);
      // ✅ Detect permission errors for better UX
      const isPermErr = err.message?.includes('denied') || err.message?.includes('permission') || err.message?.includes('microphone');
      setIsPermissionError(isPermErr);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleMicToggle = async () => {
    await toggleMicrophone(!micMuted);
    setMicMuted(!micMuted);
  };

  const handleEndCall = async () => {
    try { await endVideoCall(bookingId); await cleanup(); }
    catch (err) { logger.error('Error ending call:', err); await cleanup(); }
    finally { navigate(`/call-summary/${bookingId}`); }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-blue-300 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Connecting...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-white text-2xl font-bold mb-3">
          {isPermissionError ? 'Microphone Access Required' : 'Connection Failed'}
        </h2>
        <p className="text-blue-200 mb-6 text-sm leading-relaxed">{error}</p>

        {isPermissionError && (
          <div className="bg-white/10 rounded-xl p-4 mb-6 text-left text-sm text-blue-100 space-y-2">
            <p className="font-semibold text-white">How to fix:</p>
            <p>1. Click the 🔒 lock icon in your browser's address bar</p>
            <p>2. Set <b>Microphone</b> to <b>Allow</b></p>
            <p>3. Refresh the page and try again</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => { initRef.current = false; initCall(); setLoading(true); }}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition flex items-center justify-center space-x-2"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Try Again</span>
          </button>
          <button onClick={() => navigate('/dashboard')} className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const isLowTime = timeRemaining !== null && timeRemaining < 60;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 text-center max-w-md w-full px-6">
        <motion.div
          animate={{ scale: remoteConnected ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 2, repeat: remoteConnected ? Infinity : 0, ease: 'easeInOut' }}
          className="mx-auto mb-8"
        >
          <div className="w-48 h-48 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-2xl mx-auto">
            <User className="w-24 h-24 text-white" />
          </div>
        </motion.div>

        <div className="mb-4">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${
            remoteConnected
              ? 'bg-green-500/20 text-green-300 border border-green-500/50'
              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${remoteConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
            {remoteConnected ? 'Connected' : 'Waiting...'}
          </div>
        </div>

        <div className={`mb-12 text-6xl font-bold ${isLowTime ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {formatTime(timeRemaining)}
        </div>

        <div className="flex items-center justify-center space-x-6 mb-8">
          <button onClick={handleMicToggle}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition transform hover:scale-110 shadow-xl ${
              micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}>
            {micMuted ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
          </button>

          <button onClick={handleEndCall}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition transform hover:scale-110 shadow-2xl">
            <Phone className="w-9 h-9 text-white rotate-135" />
          </button>
        </div>

        {isLowTime && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="px-6 py-3 bg-red-500/90 text-white font-bold rounded-xl shadow-lg backdrop-blur-sm">
            ⚠️ Call ending in less than 1 minute!
          </motion.div>
        )}
      </div>
    </div>
  );
}