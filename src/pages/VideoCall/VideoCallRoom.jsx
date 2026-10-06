// src/pages/VideoCall/VideoCallRoom.jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, Loader2, AlertCircle, ChevronUp, Wifi, Flag, LogOut,
  FlipHorizontal, RefreshCw, Users, Info, X,
} from 'lucide-react';
import { END_CALL_REASONS } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import useCallRoom from '../../hooks/useCallRoom';
import CallBanners, { NetworkBars, RemoteVideoTile, VideoSlot, SwapStage } from '../../components/Call/CallBanners';
import { generateWatermarkText, getRandomWatermarkPosition } from '../../utils/antiPiracy';
import useScreenProtection from '../../hooks/useScreenProtection';

const END_OPTIONS = [
  { reason: END_CALL_REASONS.ENDED, label: 'End Call', sub: 'Call is finished for both', icon: LogOut, color: 'text-red-400', bg: 'hover:bg-red-500/20' },
  { reason: END_CALL_REASONS.TECHNICAL, label: 'Technical Issue', sub: "I'll rejoin shortly — call stays open", icon: Wifi, color: 'text-amber-400', bg: 'hover:bg-amber-500/20' },
  { reason: END_CALL_REASONS.REPORT, label: 'Report & End', sub: 'Misconduct or scam — ends call', icon: Flag, color: 'text-orange-400', bg: 'hover:bg-orange-500/20' },
];

const formatTime = (s) => (s == null ? '--:--' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export default function VideoCallRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const call = useCallRoom({ bookingId, mode: 'video', currentUser, navigate });

  const remoteAreaRef = useRef(null);
  const [showEndMenu, setShowEndMenu] = useState(false);
  const [swapped, setSwapped] = useState(false); // false = other person big (like WhatsApp)
  const [watermarkPos, setWatermarkPos] = useState(getRandomWatermarkPosition());
  const [showInfo, setShowInfo] = useState(false);
  const [diag, setDiag] = useState(null);

  useScreenProtection([remoteAreaRef], {
    onRecordingDetected: () => {
      alert('Screen recording detected! Call will be terminated.');
      call.endCall(END_CALL_REASONS.ENDED);
    },
  });

  const inCall = call.phase === 'in_call';
  const otherLabel = call.isCreator ? 'Your fan' : 'The creator';

  useEffect(() => {
    if (!inCall) return;
    const i = setInterval(() => setWatermarkPos(getRandomWatermarkPosition()), 3000);
    return () => clearInterval(i);
  }, [inCall]);

  // Call info panel: live media diagnostics (refreshes every second while open)
  useEffect(() => {
    if (!showInfo) return;
    const read = () => setDiag(call.getDiagnostics());
    read();
    const i = setInterval(read, 1000);
    return () => clearInterval(i);
  }, [showInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (call.phase === 'connecting') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-rose-500 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Connecting...</p>
      </div>
    </div>
  );

  if (call.phase === 'error') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">{call.isPermissionError ? 'Camera / Mic Access Required' : 'Connection Failed'}</h2>
        <p className="text-gray-400 mb-6 text-sm">{call.error}</p>
        <div className="space-y-3">
          <button onClick={call.retry} className="w-full px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5" /> Try Again
          </button>
          <button onClick={() => navigate('/dashboard')} className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const watermarkText = generateWatermarkText(currentUser.uid, currentUser.email || userProfile?.username || 'user');
  const isLowTime = call.timeRemaining !== null && call.timeRemaining < 60;
  const many = call.remoteUsers.length > 1;
  const localTrack = call.localVideo;

  const localNode = (
    <VideoSlot
      track={call.camOn ? localTrack : null}
      mirror
      className="w-full h-full"
      placeholder={<div className="absolute inset-0 flex items-center justify-center bg-gray-800"><VideoOff className="w-7 h-7 text-gray-400" /></div>}
    />
  );
  const remoteNode = call.remoteUsers.length === 0 ? (
    <div className="w-full h-full flex items-center justify-center text-white/60 text-sm px-4 text-center">
      Waiting for {otherLabel.toLowerCase()}…
    </div>
  ) : (
    <RemoteVideoTile user={call.remoteUsers[0].user} className="w-full h-full" />
  );

  return (
    <div className="fixed inset-0 bg-gray-900 overflow-hidden">
      {/* Stage: other person big, you small — tap the small tile to swap */}
      <div ref={remoteAreaRef} className="absolute inset-0 bg-black">
        {many ? (
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
            main={{ key: 'remote', node: remoteNode }}
            pip={{ key: 'local', node: localNode }}
          />
        )}
      </div>

      {/* Watermark */}
      <motion.div key={JSON.stringify(watermarkPos)} initial={{ opacity: 0 }}
        animate={{ opacity: 0.3, ...watermarkPos }} transition={{ duration: 0.5 }}
        className="absolute text-white/30 font-mono text-sm select-none pointer-events-none z-20"
        style={{ textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
        {watermarkText}
      </motion.div>

      {/* Top bar: network + timer */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full text-white text-xs">
          <NetworkBars quality={call.networkQuality} />
          {many && (<><Users className="w-3.5 h-3.5" /> {call.remoteUsers.length + 1}</>)}
        </div>
        <div className={`px-5 py-2 rounded-full font-bold text-base sm:text-lg ${isLowTime ? 'bg-red-500 animate-pulse' : 'bg-black/50'} text-white backdrop-blur-sm`}>
          {formatTime(call.timeRemaining)}
        </div>
        <button onClick={() => setShowInfo((v) => !v)} aria-label="Call info"
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white">
          <Info className="w-5 h-5" />
        </button>
      </div>

      {showInfo && (
        <div className="absolute top-16 inset-x-3 sm:left-auto sm:right-4 sm:w-96 z-30 bg-black/85 backdrop-blur rounded-2xl p-4 text-[11px] text-white font-mono space-y-2 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between font-sans">
            <p className="text-sm font-bold">Call info</p>
            <button onClick={() => setShowInfo(false)} aria-label="Close" className="p-1"><X className="w-4 h-4" /></button>
          </div>
          {diag && (
            <>
              <p>connection: <b>{diag.connection}</b> · me: {String(diag.myUid)}</p>
              <p>published: <b>{diag.published.join(', ') || 'nothing'}</b></p>
              <p>my camera: {diag.camera
                ? <b className={diag.camera.state === 'live' && !diag.camera.muted ? 'text-green-400' : 'text-red-400'}>
                    {diag.camera.state}{diag.camera.muted ? ' (no frames)' : ''}{diag.camera.enabled ? '' : ' (off)'} · {diag.camera.size} · {diag.camera.sendKbps}kbps {diag.camera.sendFps}fps
                  </b>
                : <b className="text-red-400">none</b>}</p>
              <p>my mic: {diag.mic ? (diag.mic.muted ? 'muted' : 'on') : 'none'}</p>
              {diag.remotes.length === 0 && <p className="text-amber-300">other side: not in the call</p>}
              {diag.remotes.map((r) => (
                <p key={r.uid}>other ({String(r.uid).slice(0, 6)}): video <b className={r.hasVideo ? 'text-green-400' : 'text-red-400'}>{r.hasVideo ? 'published' : 'NOT published'}</b>
                  {r.hasVideo && <> · {r.subscribedVideo ? 'received' : 'not received'} · {r.size} · {r.recvKbps}kbps {r.renderFps}fps</>} · audio {r.hasAudio ? 'on' : 'off'}</p>
              ))}
              <p className="text-white/50 break-all">{diag.browser}</p>
            </>
          )}
          <button onClick={call.restartCamera} disabled={call.camFixing}
            className="w-full mt-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-60 font-sans font-bold text-sm flex items-center justify-center gap-2">
            {call.camFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Restart my camera
          </button>
          <p className="font-sans text-white/60 text-xs">If the other person can't see you, tap this on <b>your</b> phone. Screenshot this panel on both sides if it still fails.</p>
        </div>
      )}

      <CallBanners
        connection={call.connection} onRejoin={call.rejoin}
        droppedNotice={call.droppedNotice} networkQuality={call.networkQuality}
        needsAudioUnlock={call.needsAudioUnlock} onUnlockAudio={call.unlockAudio}
        videoUpgrade={null} currentUid={currentUser?.uid} otherLabel={otherLabel}
        camError={call.camError} onRetryCamera={call.retryCamera} onDismissCamError={call.dismissCamError}
      />

      {/* Controls */}
      <div className="absolute inset-x-0 z-20 flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div className="flex items-center gap-3 sm:gap-4 bg-black/50 backdrop-blur-md px-5 py-3 rounded-full">
          <button onClick={call.toggleMic} aria-label={call.micMuted ? 'Unmute' : 'Mute'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${call.micMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {call.micMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </button>

          <div className="relative">
            <button onClick={() => setShowEndMenu((v) => !v)} disabled={call.ending}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition relative">
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
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 w-72 max-w-[calc(100vw-2rem)] bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
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

          <button onClick={call.toggleCam} aria-label="Camera"
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${call.camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
            {call.camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
          </button>

          <button onClick={call.flipCam} aria-label="Flip camera"
            className="w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition sm:hidden">
            <FlipHorizontal className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {isLowTime && (
        <div className="absolute bottom-32 inset-x-0 flex justify-center z-10">
          <div className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-xl shadow-lg">⚠️ Call ending in less than 1 minute!</div>
        </div>
      )}
    </div>
  );
}
