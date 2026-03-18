// src/pages/VideoCall/VideoCallRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, VideoOff, Mic, MicOff, Phone, Loader2, AlertCircle, ChevronUp, Wifi, Flag, LogOut, FlipHorizontal } from 'lucide-react';
import {
  joinChannel, leaveChannel, toggleMicrophone, toggleCamera,
  playLocalVideo, playRemoteMedia, getClient, switchCamera
} from '../../services/agoraService';
import { startVideoCall, endVideoCall, getCallDurationSeconds, END_CALL_REASONS } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import { generateWatermarkText, getRandomWatermarkPosition } from '../../utils/antiPiracy';
import useScreenProtection from '../../hooks/useScreenProtection';
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
    sub: 'I\'ll rejoin shortly — call stays open',
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

export default function VideoCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const initRef = useRef(false);
  const endedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [watermarkPos, setWatermarkPos] = useState(getRandomWatermarkPosition());
  const [error, setError] = useState(null);
  const [showEndMenu, setShowEndMenu] = useState(false);
  const [ending, setEnding] = useState(false);
  const [isMobile] = useState(() => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

  useScreenProtection([localVideoRef, remoteVideoRef], {
    onRecordingDetected: () => {
      alert('Screen recording detected! Call will be terminated.');
      handleEndCall(END_CALL_REASONS.ENDED);
    }
  });

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initCall();
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (inCall) {
      const interval = setInterval(() => setWatermarkPos(getRandomWatermarkPosition()), 3000);
      return () => clearInterval(interval);
    }
  }, [inCall]);

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

  // ✅ Listen for when other person also ends — navigate to summary
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
      const durationSecs = await getCallDurationSeconds(bookingId);
      setTimeRemaining(durationSecs);
      await startVideoCall(bookingId, currentUser.uid);

      const channelName = `video_${bookingId}`;
      await joinChannel(channelName, null, currentUser.uid, true, bookingId);

      const client = getClient();
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const tryPlay = () => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.innerHTML = '';
              playRemoteMedia(user, 'video', remoteVideoRef.current);
            } else setTimeout(tryPlay, 200);
          };
          tryPlay();
        }
        if (mediaType === 'audio') playRemoteMedia(user, 'audio');
      });
      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video' && remoteVideoRef.current) remoteVideoRef.current.innerHTML = '';
      });

      setInCall(true);
      setLoading(false);

      // ✅ Play local preview — retry until ref is mounted
      const tryPlay = () => {
        if (localVideoRef.current) {
          playLocalVideo(localVideoRef.current);
        } else {
          setTimeout(tryPlay, 200);
        }
      };
      setTimeout(tryPlay, 100);
    } catch (err) {
      logger.error('Error initializing video call:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleEndCall = async (reason) => {
    if (ending) return;
    setEnding(true);
    setShowEndMenu(false);

    // Technical issue — just leave Agora, call stays open
    if (reason === END_CALL_REASONS.TECHNICAL) {
      try {
        await endVideoCall(bookingId, currentUser.uid, reason);
        await cleanup();
      } catch (e) { logger.error(e); }
      navigate('/my-calls');
      return;
    }

    // Ended or Report — mark ended, go to summary
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
      <div ref={remoteVideoRef} className="absolute inset-0 bg-black" />

      {/* Local PiP — ref always mounted so preview can play */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 z-10">
        <div ref={localVideoRef} className="w-full h-full" style={{ display: videoOff ? 'none' : 'block' }} />
        {videoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <VideoOff className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {/* Watermark */}
      <motion.div key={JSON.stringify(watermarkPos)} initial={{ opacity: 0 }}
        animate={{ opacity: 0.3, ...watermarkPos }} transition={{ duration: 0.5 }}
        className="absolute text-white/30 font-mono text-sm select-none pointer-events-none z-20"
        style={{ textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
        {watermarkText}
      </motion.div>

      {/* Timer */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className={`px-6 py-3 rounded-full font-bold text-lg ${isLowTime ? 'bg-red-500 animate-pulse' : 'bg-black/50'} text-white backdrop-blur-sm`}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex items-center space-x-4 bg-black/50 backdrop-blur-md px-6 py-4 rounded-full">
          <button onClick={async () => { await toggleMicrophone(!micMuted); setMicMuted(!micMuted); }}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {micMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </button>

          {/* ✅ End call button — opens dropdown */}
          <div className="relative">
            <button onClick={() => setShowEndMenu(v => !v)} disabled={ending}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition transform hover:scale-110 relative">
              {ending
                ? <Loader2 className="w-7 h-7 text-white animate-spin" />
                : <Phone className="w-7 h-7 text-white rotate-135" />}
              {!ending && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <ChevronUp className={`w-3 h-3 text-red-500 transition-transform ${showEndMenu ? 'rotate-180' : ''}`} />
                </span>
              )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {showEndMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 w-72 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden shadow-2xl"
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

          <button onClick={async () => { await toggleCamera(videoOff); setVideoOff(!videoOff); }}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${videoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {videoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
          </button>

          {/* ✅ Flip camera — mobile only */}
          {isMobile && (
            <button onClick={async () => { try { await switchCamera(); } catch(e) { logger.error('Flip camera error:', e); } }}
              className="w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition">
              <FlipHorizontal className="w-6 h-6 text-white" />
            </button>
          )}
        </div>
      </div>

      {isLowTime && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="absolute top-20 left-1/2 transform -translate-x-1/2 z-10">
          <div className="px-6 py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg">
            ⚠️ Call ending in less than 1 minute!
          </div>
        </motion.div>
      )}
    </div>
  );
}