// src/pages/VideoCall/CallWaitingRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Phone, Clock, User, CheckCircle, Loader2,
  AlertCircle, X, RefreshCw, Mic, Camera, Shield
} from 'lucide-react';
import {
  doc, getDoc, updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { refundBooking } from '../../services/videoCallService';
import { requestMediaPermissions, getPermissionErrorMessage } from '../../services/agoraService';

// ─────────────────────────────────────────────
// Permission Gate — shown before entering room
// ─────────────────────────────────────────────
function PermissionGate({ isVideo, onGranted, onSkip }) {
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [deniedReason, setDeniedReason] = useState('');

  const handleRequest = async () => {
    setChecking(true);
    setDenied(false);
    const result = await requestMediaPermissions(isVideo);
    setChecking(false);
    if (result.granted) {
      onGranted();
    } else {
      setDenied(true);
      setDeniedReason(getPermissionErrorMessage(result.reason, isVideo));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full border border-gray-700 text-center"
      >
        {/* Icon */}
        <div className="flex items-center justify-center space-x-3 mb-6">
          <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center">
            {isVideo ? <Camera className="w-8 h-8 text-rose-400" /> : <Mic className="w-8 h-8 text-rose-400" />}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Allow {isVideo ? 'Camera & Microphone' : 'Microphone'} Access
        </h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          To join this {isVideo ? 'video' : 'voice'} call, your browser needs access to your{' '}
          {isVideo ? 'camera and microphone' : 'microphone'}.
          When prompted, click <b className="text-white">Allow</b>.
        </p>

        {/* Steps */}
        <div className="bg-gray-700/50 rounded-xl p-4 mb-6 text-left space-y-2 text-sm text-gray-300">
          <div className="flex items-center space-x-3">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
            <span>Click <b className="text-white">"Allow {isVideo ? 'Camera & Microphone' : 'Microphone'}"</b> below</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
            <span>When your browser asks, click <b className="text-white">Allow</b></span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
            <span>You'll be taken to the waiting room</span>
          </div>
        </div>

        {/* Denied error */}
        <AnimatePresence>
          {denied && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5 text-left"
            >
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 text-sm font-semibold mb-1">Permission denied</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{deniedReason}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ✅ Internet warning */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5 text-left">
          <p className="text-amber-400 text-sm font-semibold mb-2">📶 Before you join</p>
          <ul className="text-gray-400 text-xs space-y-1.5">
            <li>• Make sure you have a <b className="text-white">strong, stable internet connection</b></li>
            <li>• WiFi is preferred over mobile data</li>
            <li>• Close other apps using your camera or mic</li>
            <li>• Find a quiet, well-lit place before starting</li>
          </ul>
        </div>

        <button
          onClick={handleRequest}
          disabled={checking}
          className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-500/50 text-white rounded-xl font-bold text-base transition flex items-center justify-center space-x-2 mb-3"
        >
          {checking ? (
            <><Loader2 className="w-5 h-5 animate-spin" /><span>Checking...</span></>
          ) : (
            <><Shield className="w-5 h-5" /><span>Allow {isVideo ? 'Camera & Microphone' : 'Microphone'}</span></>
          )}
        </button>

        <p className="text-xs text-gray-500">
          🔒 Access is only used during your call and is never recorded by us.
        </p>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Waiting Room
// ─────────────────────────────────────────────
export default function CallWaitingRoom() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [booking, setBooking] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('loading');
  const [timeUntil, setTimeUntil] = useState(null);
  const [refundCountdown, setRefundCountdown] = useState(null);

  const launchTimerRef = useRef(null);
  const unsubRef = useRef(null);
  const refundTimerRef = useRef(null);
  const isUserRef = useRef(false);
  const bookingDataRef = useRef(null);
  const refundInProgressRef = useRef(false);

  // Only load booking after permissions granted
  useEffect(() => {
    if (!permissionGranted || !currentUser || !bookingId) return;
    loadBooking();
    return () => {
      if (unsubRef.current) unsubRef.current();
      if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
      if (refundTimerRef.current) clearInterval(refundTimerRef.current);
    };
  }, [permissionGranted, bookingId, currentUser]);

  const loadBooking = async () => {
    try {
      const bookingSnap = await getDoc(doc(db, 'call_bookings', bookingId));
      if (!bookingSnap.exists()) { setError('Booking not found'); setLoading(false); return; }

      const data = { id: bookingSnap.id, ...bookingSnap.data() };
      bookingDataRef.current = data;
      setBooking(data);

      const isUser = data.userId === currentUser.uid;
      const isCreator = data.creatorId === currentUser.uid;
      if (!isUser && !isCreator) { setError('You are not part of this call'); setLoading(false); return; }
      isUserRef.current = isUser;

      const otherUid = isUser ? data.creatorId : data.userId;
      const otherSnap = await getDoc(doc(db, 'users', otherUid));
      if (otherSnap.exists()) setOtherUser({ id: otherSnap.id, ...otherSnap.data() });

      setLoading(false);

      if (data.status === 'refunded') { setStatus('refunded'); return; }
      if (data.status === 'completed' || data.status === 'ended') { setStatus('ended'); return; }

      const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
      const minsUntil = Math.floor((scheduled - new Date()) / 60000);
      setTimeUntil(minsUntil);

      if (minsUntil > 5) { setStatus('too_early'); return; }

      // ✅ Use call duration not hardcoded 1hr
      const durationMs = (data.duration || 30) * 60 * 1000;
      const expiresAt = new Date(scheduled.getTime() + durationMs);
      if (new Date() > expiresAt) {
        await handleExpiredRefund(data);
        return;
      }

      startRefundCountdown(expiresAt, data);

      await updateDoc(doc(db, 'call_bookings', bookingId), {
        [`waitingRoom.${isUser ? 'userJoined' : 'creatorJoined'}`]: true,
        [`waitingRoom.${isUser ? 'userJoinedAt' : 'creatorJoinedAt'}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setStatus('waiting');
      subscribeToBooking(data);

    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load booking');
      setLoading(false);
    }
  };

  const startRefundCountdown = (expiresAt, data) => {
    if (refundTimerRef.current) clearInterval(refundTimerRef.current);
    const update = () => {
      const secsLeft = Math.max(0, Math.floor((expiresAt - new Date()) / 1000));
      setRefundCountdown(secsLeft);
      if (secsLeft === 0) {
        clearInterval(refundTimerRef.current);
        handleExpiredRefund(data);
      }
    };
    update();
    refundTimerRef.current = setInterval(update, 1000);
  };

  const handleExpiredRefund = async (data) => {
    if (refundInProgressRef.current) return;
    refundInProgressRef.current = true;
    const d = data || bookingDataRef.current;
    if (!d || d.status === 'refunded' || d.status === 'completed') {
      refundInProgressRef.current = false;
      return;
    }
    try {
      await refundBooking(d.id || bookingId, d);
      setStatus('refunded');
    } catch (e) {
      console.error('Refund failed:', e);
      refundInProgressRef.current = false;
      setStatus('expired');
    }
  };

  const subscribeToBooking = (data) => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(doc(db, 'call_bookings', bookingId), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();

      if (d.status === 'refunded') { setStatus('refunded'); return; }
      if (d.status === 'completed' || d.status === 'ended') { setStatus('ended'); return; }

      const userJoined = d.waitingRoom?.userJoined;
      const creatorJoined = d.waitingRoom?.creatorJoined;
      const bothPresent = userJoined && creatorJoined;

      if (bothPresent) {
        setStatus('launching');
        if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
        launchTimerRef.current = setTimeout(() => {
          const callPath = data.type === 'video'
            ? `/video-call/${bookingId}`
            : `/voice-call/${bookingId}`;
          navigate(callPath);
        }, 3000);
      } else if (userJoined || creatorJoined) {
        // ✅ Show who has joined — even if it's only one person so far
        setStatus('other_joined');
      } else {
        setStatus('waiting');
      }
    });
  };

  const handleLeave = async () => {
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    try {
      const isUser = isUserRef.current;
      await updateDoc(doc(db, 'call_bookings', bookingId), {
        [`waitingRoom.${isUser ? 'userJoined' : 'creatorJoined'}`]: false,
        updatedAt: serverTimestamp(),
      });
    } catch (e) { /* silent */ }
    navigate('/dashboard');
  };

  const handleRejoin = async () => {
    try {
      const isUser = isUserRef.current;
      await updateDoc(doc(db, 'call_bookings', bookingId), {
        [`waitingRoom.${isUser ? 'userJoined' : 'creatorJoined'}`]: true,
        [`waitingRoom.${isUser ? 'userJoinedAt' : 'creatorJoinedAt'}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus('waiting');
      if (bookingDataRef.current) subscribeToBooking(bookingDataRef.current);
    } catch (e) {
      setError('Failed to rejoin. Please refresh the page.');
    }
  };

  const formatCountdown = (secs) => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Permission Gate (shown first) ──────────────────────────────
  if (!permissionGranted) {
    // Need booking type to know video vs voice — do a quick read
    return <PermissionGateWrapper
      bookingId={bookingId}
      onGranted={() => setPermissionGranted(true)}
    />;
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-rose-400 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <p className="text-white text-xl font-bold mb-2">Something went wrong</p>
        <p className="text-gray-400 mb-6">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition">
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const isVideo = booking?.type === 'video';
  const scheduled = booking?.scheduledAt?.toDate?.() || new Date(booking?.scheduledAt);

  if (status === 'too_early') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
        <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Too Early</h2>
        <p className="text-gray-400 mb-2">Your call is scheduled for</p>
        <p className="text-white font-bold text-lg mb-1">{scheduled.toLocaleString()}</p>
        <p className="text-gray-500 text-sm mb-6">
          The waiting room opens 5 minutes early.<br />
          Come back in about {timeUntil - 5} minutes.
        </p>
        <button onClick={() => navigate('/dashboard')} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition">
          Back to Dashboard
        </button>
      </motion.div>
    </div>
  );

  if (status === 'refunded') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Refund Issued</h2>
        <p className="text-gray-400 mb-2">The call wasn't started within the scheduled {booking?.duration || 30} minutes.</p>
        <p className="text-green-400 font-bold text-xl mb-6">${booking?.price?.toFixed(2)} returned to your wallet</p>
        <button onClick={() => navigate('/wallet')} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition mb-3">
          View Wallet
        </button>
        <button onClick={() => navigate('/dashboard')} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition">
          Back to Dashboard
        </button>
      </motion.div>
    </div>
  );

  if (status === 'expired') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Booking Expired</h2>
        <p className="text-gray-400 mb-6">Please contact support to request a manual refund.</p>
        <button onClick={() => navigate('/support')} className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition mb-3">
          Contact Support
        </button>
        <button onClick={() => navigate('/dashboard')} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition">
          Back to Dashboard
        </button>
      </motion.div>
    </div>
  );

  if (status === 'ended') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Call Ended</h2>
        <p className="text-gray-400 mb-6">This call has already been completed.</p>
        <button onClick={() => navigate('/dashboard')} className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition">
          Back to Dashboard
        </button>
      </motion.div>
    </div>
  );

  if (status === 'launching') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-500/50"
        >
          {isVideo ? <Video className="w-12 h-12 text-white" /> : <Phone className="w-12 h-12 text-white" />}
        </motion.div>
        <h2 className="text-3xl font-bold text-white mb-2">Starting Call...</h2>
        <p className="text-gray-400">Both parties are here. Connecting now.</p>
      </motion.div>
    </div>
  );

  // ── Who has joined indicator ────────────────────────────────────
  const d = bookingDataRef.current;
  const iAmUser = isUserRef.current;
  const otherHasJoined = iAmUser
    ? d?.waitingRoom?.creatorJoined
    : d?.waitingRoom?.userJoined;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full border border-gray-700">

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {isVideo ? '📹 Video' : '📞 Voice'} Waiting Room
          </h2>
          <button onClick={handleLeave} className="p-2 hover:bg-gray-700 rounded-full transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Other user avatar */}
        <div className="text-center mb-6">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center overflow-hidden mx-auto shadow-xl">
              {otherUser?.profilePicture || otherUser?.avatar
                ? <img src={otherUser.profilePicture || otherUser.avatar} alt="" className="w-full h-full object-cover" />
                : <User className="w-12 h-12 text-white" />}
            </div>
            {/* ✅ Green dot only when they've actually joined */}
            {otherHasJoined && (
              <span className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-gray-800 animate-pulse" />
            )}
          </div>
          <p className="text-white font-bold mt-3 text-lg">{otherUser?.displayName || 'Unknown'}</p>
          <p className="text-gray-500 text-sm">@{otherUser?.username || '...'}</p>
        </div>

        {/* ✅ Status message — accurately reflects who has joined */}
        <div className={`rounded-xl p-4 mb-4 text-center ${
          otherHasJoined
            ? 'bg-green-500/10 border border-green-500/30'
            : 'bg-gray-700/50 border border-gray-600'
        }`}>
          {!otherHasJoined ? (
            <div className="flex items-center justify-center space-x-3">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              <p className="text-gray-300 font-medium">
                Waiting for {otherUser?.displayName || 'the other party'} to join...
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-300 font-medium">
                {otherUser?.displayName} has joined! Starting soon...
              </p>
            </div>
          )}
        </div>

        {refundCountdown !== null && refundCountdown > 0 && (
          <div className={`rounded-xl p-3 mb-4 text-center border ${
            refundCountdown < 300 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <p className={`text-sm font-semibold ${refundCountdown < 300 ? 'text-red-400' : 'text-amber-400'}`}>
              ⏳ Auto-refund if call doesn't start: {formatCountdown(refundCountdown)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Both must join within {booking?.duration || 30} min of scheduled time</p>
          </div>
        )}

        <div className="bg-gray-700/40 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Scheduled</span>
            <span className="text-white font-medium">{scheduled.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Duration</span>
            <span className="text-white font-medium">{booking?.duration} min</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Type</span>
            <span className="text-white font-medium capitalize">{booking?.type} call</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-sm mb-4">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400">You are in the waiting room</span>
        </div>

        <button onClick={handleRejoin}
          className="w-full py-3 mb-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh My Presence</span>
        </button>

        <button onClick={handleLeave}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl font-semibold transition">
          Leave Waiting Room
        </button>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Wrapper: reads booking type first, then shows PermissionGate
// ─────────────────────────────────────────────
function PermissionGateWrapper({ bookingId, onGranted }) {
  const [isVideo, setIsVideo] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'call_bookings', bookingId)).then(snap => {
      if (snap.exists()) setIsVideo(snap.data().type === 'video');
      else setIsVideo(false);
    }).catch(() => setIsVideo(false));
  }, [bookingId]);

  if (isVideo === null) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-rose-400 animate-spin" />
    </div>
  );

  return <PermissionGate isVideo={isVideo} onGranted={onGranted} />;
}