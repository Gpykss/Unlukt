// src/pages/VideoCall/VoiceCallRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Phone, Loader2, AlertCircle, User, RefreshCw, ChevronUp, Wifi, Flag, LogOut } from 'lucide-react';
import {
  joinChannel, leaveChannel, toggleMicrophone, playRemoteMedia, getClient
} from '../../services/agoraService';
import { startVideoCall, endVideoCall, getCallDurationSeconds, END_CALL_REASONS } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

const END_OPTIONS = [
  {
    reason: END_CALL_REASONS.ENDED,
    label: 'End Call',
    sub: 'Call is finished for both',
    icon: LogOut,
    color: 'text-red-400',
    bg: 'hover:bg-red-500/20',
  },
  {
    reason: END_CALL_REASONS.TECHNICAL,
    label: 'Technical Issue',
    sub: "I'll rejoin shortly — call stays open",
    icon: Wifi,
    color: 'text-amber-400',
    bg: 'hover:bg-amber-500/20',
  },
  {
    reason: END_CALL_REASONS.REPORT,
    label: 'Report & End',
    sub: 'Misconduct or scam — ends call',
    icon: Flag,
    color: 'text-orange-400',
    bg: 'hover:bg-orange-500/20',
  },
];

export default function VoiceCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const initRef = useRef(false);
  const endedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [error, setError] = useState(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [showEndMenu, setShowEndMenu] = useState(false);
  const [ending, setEnding] = useState(false);

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
        if (prev <= 1) { clearInterval(timer); handleEndCall(END_CALL_REASONS.ENDED); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  // ✅ Listen for when both ended
  useEffect(() => {
    if (!inCall) return;
    const unsub = onSnapshot(doc(db, 'call_bookings', bookingId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'completed' && endedRef.current) {
        navigate(`/call-summary/${bookingId}`);
      }
    });
    return () => unsub();
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
        if (mediaType === 'audio') { playRemoteMedia(user, 'audio'); setRemoteConnected(true); }
      });
      client.on('user-unpublished', () => setRemoteConnected(false));

      setInCall(true);
      setLoading(false);
    } catch (err) {
      logger.error('Error initializing voice call:', err);
      const isPermErr = err.message?.includes('denied') || err.message?.includes('permission') || err.message?.includes('microphone');
      setIsPermissionError(isPermErr);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleEndCall = async (reason) => {
    if (ending) return;
    setEnding(true);
    setShowEndMenu(false);

    if (reason === END_CALL_REASONS.TECHNICAL) {
      try {
        await endVideoCall(bookingId, currentUser.uid, reason);
        await cleanup();
      } catch (e) { logger.error(e); }
      navigate('/my-calls');
      return;
    }

    endedRef.current = true;
    try {
      await endVideoCall(bookingId, currentUser.uid, reason);
      await cleanup();
    } catch (err) {
      logger.error('Error ending call:', err);
      await cleanup();
    }
    navigate(`/call-summary/${bookingId}`);
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
          <button onClick={() => { initRef.current = false; setLoading(true); initCall(); }}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5" /><span>Try Again</span>
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
            remoteConnected ? 'bg-green-500/20 text-green-300 border border-green-500/50' : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${remoteConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
            {remoteConnected ? 'Connected' : 'Waiting...'}
          </div>
        </div>

        <div className={`mb-12 text-6xl font-bold ${isLowTime ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {formatTime(timeRemaining)}
        </div>

        <div className="flex items-center justify-center space-x-6 mb-8">
          <button onClick={async () => { await toggleMicrophone(!micMuted); setMicMuted(!micMuted); }}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition transform hover:scale-110 shadow-xl ${micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
            {micMuted ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
          </button>

          {/* ✅ End call with dropdown */}
          <div className="relative">
            <button onClick={() => setShowEndMenu(v => !v)} disabled={ending}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition transform hover:scale-110 shadow-2xl relative">
              {ending
                ? <Loader2 className="w-9 h-9 text-white animate-spin" />
                : <Phone className="w-9 h-9 text-white rotate-135" />}
              {!ending && (
                <span className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                  <ChevronUp className={`w-3.5 h-3.5 text-red-500 transition-transform ${showEndMenu ? 'rotate-180' : ''}`} />
                </span>
              )}
            </button>

            <AnimatePresence>
              {showEndMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-24 left-1/2 -translate-x-1/2 w-72 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden shadow-2xl"
                >
                  <p className="text-xs text-gray-500 font-semibold px-4 pt-3 pb-2 uppercase tracking-wider">Why are you leaving?</p>
                  {END_OPTIONS.map(({ reason, label, sub, icon: Icon, color, bg }) => (
                    <button key={reason} onClick={() => handleEndCall(reason)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 transition ${bg}`}>
                      <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                      <div className="text-left">
                        <p className={`font-semibold text-sm ${color}`}>{label}</p>
                        <p className="text-xs text-gray-500">{sub}</p>
                      </div>
                    </button>
                  ))}
                  <button onClick={() => setShowEndMenu(false)}
                    className="w-full py-3 text-xs text-gray-600 hover:text-gray-400 transition border-t border-gray-800">
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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