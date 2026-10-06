// src/pages/VideoCall/VoiceCallRoom.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Phone, Loader2, AlertCircle, User, RefreshCw, ChevronUp, Wifi, Flag, LogOut,
  Video, VideoOff, FlipHorizontal, Users,
} from 'lucide-react';
import { END_CALL_REASONS } from '../../services/videoCallService';
import { getLocalVideoTrack } from '../../services/agoraService';
import { useAuth } from '../../hooks/useAuth';
import useCallRoom from '../../hooks/useCallRoom';
import CallBanners, { NetworkBars, RemoteVideoTile, VideoSlot, SwapStage } from '../../components/Call/CallBanners';

const END_OPTIONS = [
  { reason: END_CALL_REASONS.ENDED, label: 'End Call', sub: 'Call is finished for both', icon: LogOut, color: 'text-red-400', bg: 'hover:bg-red-500/20' },
  { reason: END_CALL_REASONS.TECHNICAL, label: 'Technical Issue', sub: "I'll rejoin shortly — call stays open", icon: Wifi, color: 'text-amber-400', bg: 'hover:bg-amber-500/20' },
  { reason: END_CALL_REASONS.REPORT, label: 'Report & End', sub: 'Misconduct or scam — ends call', icon: Flag, color: 'text-orange-400', bg: 'hover:bg-orange-500/20' },
];

const formatTime = (s) => (s == null ? '--:--' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export default function VoiceCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const call = useCallRoom({ bookingId, mode: 'voice', currentUser, navigate });
  const [showEndMenu, setShowEndMenu] = useState(false);
  const [swapped, setSwapped] = useState(false);

  const otherLabel = call.isCreator ? 'Your fan' : 'The creator';
  const remoteConnected = call.remoteUsers.length > 0;
  const showVideo = call.videoActive;

  if (call.phase === 'connecting') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-blue-300 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Connecting...</p>
      </div>
    </div>
  );

  if (call.phase === 'error') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-white text-2xl font-bold mb-3">
          {call.isPermissionError ? 'Microphone Access Required' : 'Connection Failed'}
        </h2>
        <p className="text-blue-200 mb-6 text-sm leading-relaxed">{call.error}</p>
        {call.isPermissionError && (
          <div className="bg-white/10 rounded-xl p-4 mb-6 text-left text-sm text-blue-100 space-y-2">
            <p className="font-semibold text-white">How to fix:</p>
            <p>1. Click the 🔒 lock icon in your browser's address bar</p>
            <p>2. Set <b>Microphone</b> to <b>Allow</b></p>
            <p>3. Tap Try Again</p>
          </div>
        )}
        <div className="space-y-3">
          <button onClick={call.retry}
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

  const isLowTime = call.timeRemaining !== null && call.timeRemaining < 60;
  const localTrack = getLocalVideoTrack();
  const localNode = (
    <VideoSlot track={call.camOn ? localTrack : null} mirror className="w-full h-full"
      placeholder={<div className="absolute inset-0 flex items-center justify-center bg-gray-800"><VideoOff className="w-6 h-6 text-gray-400" /></div>} />
  );

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 to-purple-900 overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-black/30 backdrop-blur px-3 py-1.5 rounded-full text-white text-xs">
          <NetworkBars quality={call.networkQuality} />
          {call.remoteUsers.length > 1 && (<><Users className="w-3.5 h-3.5" /> {call.remoteUsers.length + 1}</>)}
        </div>
        {showVideo && (
          <div className={`px-4 py-1.5 rounded-full font-bold text-white backdrop-blur ${isLowTime ? 'bg-red-500 animate-pulse' : 'bg-black/40'}`}>
            {formatTime(call.timeRemaining)}
          </div>
        )}
        <span className="w-10" />
      </div>

      <CallBanners
        connection={call.connection} onRejoin={call.rejoin}
        droppedNotice={call.droppedNotice} networkQuality={call.networkQuality}
        needsAudioUnlock={call.needsAudioUnlock} onUnlockAudio={call.unlockAudio}
        videoUpgrade={null} currentUid={currentUser?.uid}
        onRespondVideo={call.respondVideo} otherLabel={otherLabel}
        camError={call.camError} onRetryCamera={call.retryCamera} onDismissCamError={call.dismissCamError}
      />

      {showVideo ? (
        /* ── Upgraded to video: other person big, you small — tap to swap ── */
        <div className="absolute inset-0 bg-black">
          {call.remoteUsers.length > 1 ? (
            <>
              <div className="absolute inset-0 grid gap-1 grid-cols-1 sm:grid-cols-2">
                {call.remoteUsers.map((u, i) => (
                  <RemoteVideoTile key={u.uid} user={u.user} className="w-full h-full" label={`Participant ${i + 1}`} />
                ))}
              </div>
              <div className="absolute top-16 right-4 z-10 w-28 h-40 sm:w-44 sm:h-32 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl">
                {localNode}
              </div>
            </>
          ) : (
            <SwapStage
              swapped={swapped}
              onSwap={() => setSwapped((v) => !v)}
              main={{ key: 'remote', node: call.remoteUsers.length === 0
                ? <div className="w-full h-full flex items-center justify-center text-white/70">Waiting for {otherLabel.toLowerCase()}…</div>
                : <RemoteVideoTile user={call.remoteUsers[0].user} className="w-full h-full" /> }}
              pip={{ key: 'local', node: localNode }}
            />
          )}
        </div>
      ) : (
        /* ── Voice UI ── */
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <div className="absolute inset-0 opacity-20 -z-10">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>
          <motion.div
            animate={{ scale: remoteConnected ? [1, 1.08, 1] : 1 }}
            transition={{ duration: 2, repeat: remoteConnected ? Infinity : 0, ease: 'easeInOut' }}
            className="mb-8"
          >
            <div className="w-40 h-40 sm:w-48 sm:h-48 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-2xl mx-auto">
              <User className="w-20 h-20 sm:w-24 sm:h-24 text-white" />
            </div>
          </motion.div>

          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold mb-4 ${
            remoteConnected ? 'bg-green-500/20 text-green-300 border border-green-500/50' : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'}`}>
            <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${remoteConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
            {remoteConnected
              ? (call.remoteUsers.length > 1 ? `${call.remoteUsers.length} others connected` : 'Connected')
              : 'Waiting...'}
          </div>

          <div className={`mb-28 text-5xl sm:text-6xl font-bold ${isLowTime ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {formatTime(call.timeRemaining)}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute inset-x-0 z-20 flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div className="flex items-center gap-4 bg-black/30 backdrop-blur-md px-5 py-3 rounded-full">
          <button onClick={call.toggleMic} aria-label={call.micMuted ? 'Unmute' : 'Mute'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${call.micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
            {call.micMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </button>

          {showVideo ? (
            <>
              <button onClick={call.toggleCam} aria-label="Camera"
                className={`w-14 h-14 rounded-full flex items-center justify-center transition ${call.camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {call.camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
              </button>
              <button onClick={call.flipCam} aria-label="Flip camera" className="w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center sm:hidden">
                <FlipHorizontal className="w-6 h-6 text-white" />
              </button>
            </>
          ) : null}

          <div className="relative">
            <button onClick={() => setShowEndMenu((v) => !v)} disabled={call.ending}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition shadow-2xl relative">
              {call.ending ? <Loader2 className="w-7 h-7 text-white animate-spin" /> : <Phone className="w-7 h-7 text-white rotate-135" />}
              {!call.ending && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <ChevronUp className={`w-3 h-3 text-red-500 transition-transform ${showEndMenu ? 'rotate-180' : ''}`} />
                </span>
              )}
            </button>
            <AnimatePresence>
              {showEndMenu && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-20 right-0 sm:left-1/2 sm:-translate-x-1/2 w-72 max-w-[calc(100vw-2rem)] bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
                  <p className="text-xs text-gray-500 font-semibold px-4 pt-3 pb-2 uppercase tracking-wider">Why are you leaving?</p>
                  {END_OPTIONS.map(({ reason, label, sub, icon: Icon, color, bg }) => (
                    <button key={reason} onClick={() => { setShowEndMenu(false); call.endCall(reason); }}
                      className={`w-full flex items-center space-x-3 px-4 py-3 transition ${bg}`}>
                      <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                      <div className="text-left">
                        <p className={`font-semibold text-sm ${color}`}>{label}</p>
                        <p className="text-xs text-gray-500">{sub}</p>
                      </div>
                    </button>
                  ))}
                  <button onClick={() => setShowEndMenu(false)} className="w-full py-3 text-xs text-gray-600 hover:text-gray-400 transition border-t border-gray-800">
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {isLowTime && (
        <div className="absolute bottom-32 inset-x-0 flex justify-center z-20">
          <div className="px-5 py-2 bg-red-500/90 text-white text-sm font-bold rounded-xl shadow-lg">⚠️ Call ending in less than 1 minute!</div>
        </div>
      )}
    </div>
  );
}
