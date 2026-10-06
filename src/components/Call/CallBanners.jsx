// src/components/Call/CallBanners.jsx
// Status overlays shared by voice & video call rooms: reconnecting, lost connection, other side
// dropped, weak network, tap-to-enable-sound, and incoming/outgoing video requests.
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw, WifiOff, Volume2, Video, Check, X } from 'lucide-react';

export function NetworkBars({ quality }) {
  // Agora: 1 excellent … 5 very bad, 6 down, 0 unknown
  const level = quality === 0 ? 4 : Math.max(0, 5 - quality);
  const color = quality >= 5 ? 'bg-red-400' : quality >= 3 ? 'bg-amber-400' : 'bg-green-400';
  return (
    <div className="flex items-end gap-0.5 h-4" title="Your connection">
      {[1, 2, 3, 4].map((b) => (
        <span key={b} className={`w-1 rounded-sm ${b <= level ? color : 'bg-white/25'}`} style={{ height: `${b * 25}%` }} />
      ))}
    </div>
  );
}

/**
 * Plays any Agora video track (local or remote) into itself whenever it mounts or the track
 * changes. Because playback is tied to the element, moving a feed between the big screen and the
 * small corner tile (swap) or a late-arriving container can never leave a black screen.
 */
export function VideoSlot({ track, className = '', placeholder = null, mirror = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!track || !ref.current) return;
    try { track.play(ref.current, { fit: 'cover', mirror }); } catch { /* element gone */ }
  }, [track, mirror]);
  return (
    // Only add `relative` when the caller didn't position it — "relative absolute" lets relative win in
    // Tailwind's CSS order, which collapsed the box to 0px tall (the other person's video was invisible)
    <div className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative '}bg-black overflow-hidden ${className}`}>
      <div ref={ref} className="absolute inset-0" />
      {!track && placeholder}
    </div>
  );
}

export function RemoteVideoTile({ user, label, className = '' }) {
  const track = user?.hasVideo ? user.videoTrack : null;
  return (
    <div className={`relative ${className}`}>
      <VideoSlot track={track} className="absolute inset-0"
        placeholder={<div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">Camera off</div>} />
      {label && (
        <span className="absolute bottom-2 left-2 z-10 text-[11px] font-semibold text-white bg-black/50 px-2 py-0.5 rounded-full">{label}</span>
      )}
    </div>
  );
}

/**
 * WhatsApp-style stage: one feed fills the screen, the other floats in a small corner tile.
 * Tap the small tile to swap which one is big.
 */
export function SwapStage({ main, pip, swapped, onSwap, pipClassName = 'top-16 right-4' }) {
  const big = swapped ? pip : main;
  const small = swapped ? main : pip;
  return (
    <div className="absolute inset-0">
      <div key={`big-${big?.key}`} className="absolute inset-0">{big?.node}</div>
      {small && (
        <button type="button" onClick={onSwap} aria-label="Swap screens"
          key={`small-${small.key}`}
          className={`absolute ${pipClassName} z-10 w-28 h-40 sm:w-44 sm:h-32 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-gray-800 active:scale-95 transition`}>
          {small.node}
        </button>
      )}
    </div>
  );
}

export default function CallBanners({
  connection, onRejoin, droppedNotice, networkQuality, needsAudioUnlock, onUnlockAudio,
  videoUpgrade, currentUid, onRespondVideo, otherLabel = 'The other person',
  camError = null, onRetryCamera, onDismissCamError,
}) {
  const incomingVideo = videoUpgrade?.status === 'requested' && videoUpgrade.requestedBy !== currentUid;
  const outgoingVideo = videoUpgrade?.status === 'requested' && videoUpgrade.requestedBy === currentUid;
  const declinedMine = videoUpgrade?.status === 'declined' && videoUpgrade.requestedBy === currentUid;

  return (
    <div className="absolute top-20 inset-x-0 z-30 flex flex-col items-center gap-2 px-4 pointer-events-none">
      <AnimatePresence>
        {connection === 'reconnecting' && (
          <motion.div key="reconn" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-auto flex items-center gap-2 bg-amber-500/95 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin" /> Network dropped — reconnecting… the call stays open
          </motion.div>
        )}

        {connection === 'disconnected' && (
          <motion.div key="lost" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-auto flex items-center gap-3 bg-red-500/95 text-white text-sm font-semibold pl-4 pr-2 py-2 rounded-full shadow-lg">
            <WifiOff className="w-4 h-4" /> Connection lost
            <button onClick={onRejoin} className="flex items-center gap-1 bg-white text-red-600 px-3 py-1 rounded-full text-xs font-bold">
              <RefreshCw className="w-3.5 h-3.5" /> Rejoin
            </button>
          </motion.div>
        )}

        {droppedNotice && connection === 'connected' && (
          <motion.div key="dropped" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-auto flex items-center gap-2 bg-gray-900/90 text-white text-sm px-4 py-2 rounded-full shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin" /> {otherLabel}'s connection dropped — waiting for them to come back
          </motion.div>
        )}

        {connection === 'connected' && networkQuality >= 4 && (
          <motion.div key="weak" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs text-amber-200 bg-black/50 px-3 py-1 rounded-full">
            Weak connection — quality may drop
          </motion.div>
        )}

        {needsAudioUnlock && (
          <motion.button key="audio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onUnlockAudio}
            className="pointer-events-auto flex items-center gap-2 bg-blue-500 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg">
            <Volume2 className="w-4 h-4" /> Tap to turn on sound
          </motion.button>
        )}

        {camError && (
          <motion.div key="camerr" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-auto w-full max-w-sm bg-gray-900/95 border border-red-400/40 text-white rounded-2xl p-4 shadow-2xl">
            <p className="text-sm font-semibold mb-3">{camError}</p>
            <div className="flex gap-2">
              <button onClick={onDismissCamError} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold">Stay on voice</button>
              <button onClick={onRetryCamera} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-bold">Retry camera</button>
            </div>
          </motion.div>
        )}

        {incomingVideo && (
          <motion.div key="incoming" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-auto w-full max-w-sm bg-gray-900/95 border border-white/10 text-white rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-2 font-semibold mb-3">
              <Video className="w-5 h-5 text-rose-400" /> {otherLabel} wants to switch to video
            </div>
            <div className="flex gap-2">
              <button onClick={() => onRespondVideo(false)}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold">
                <X className="w-4 h-4" /> Not now
              </button>
              <button onClick={() => onRespondVideo(true)}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-bold">
                <Check className="w-4 h-4" /> Accept
              </button>
            </div>
          </motion.div>
        )}

        {outgoingVideo && (
          <motion.div key="outgoing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs text-white bg-black/50 px-3 py-1.5 rounded-full">
            Video request sent — it stays open while you're on the call
          </motion.div>
        )}

        {declinedMine && (
          <motion.div key="declined" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs text-white/80 bg-black/50 px-3 py-1.5 rounded-full">
            {otherLabel} declined video for now — you can ask again
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
