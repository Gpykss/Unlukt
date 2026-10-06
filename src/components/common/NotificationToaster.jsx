// src/components/common/NotificationToaster.jsx
// App-wide realtime popups: any NEW notification for the signed-in user (new booking, cancelled
// call, tip, subscription, payment, refund…) slides in at the top with the Unlukt sound.
// Tapping it opens the right page. Old notifications never pop — only ones that arrive while open.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Volume2, VolumeX } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { playNotifySound, soundForType, isSoundOn, setSoundOn } from '../../utils/notifySound';
import { getScheduledLive } from '../../utils/share';

const routeFor = (n) => {
  const t = n.type || '';
  if (/call|booking|refund/i.test(t)) return '/my-calls';
  if (/message|dm|ppv/i.test(t)) return '/messages';
  if (/tip|payment|subscri|earning|unlock|payout|withdraw/i.test(t)) return '/dashboard';
  if (n.link) return n.link;
  return '/notifications';
};

const iconFor = (t = '') => {
  if (/call|booking/i.test(t)) return '📞';
  if (/refund|cancel/i.test(t)) return '↩️';
  if (/live/i.test(t)) return '🔴';
  if (/tip/i.test(t)) return '🌹';
  if (/payment|subscri|earning|unlock/i.test(t)) return '💰';
  if (/follow/i.test(t)) return '👤';
  if (/comment|like/i.test(t)) return '❤️';
  return '🔔';
};

export default function NotificationToaster() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [toasts, setToasts] = useState([]);
  const [soundOn, setSoundState] = useState(isSoundOn());
  const seen = useRef(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    seen.current = new Set();
    primed.current = false;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      // First snapshot = what already existed → remember, don't pop
      if (!primed.current) {
        snap.docs.forEach((d) => seen.current.add(d.id));
        primed.current = true;
        return;
      }
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'added' || seen.current.has(ch.doc.id)) return;
        seen.current.add(ch.doc.id);
        const n = { id: ch.doc.id, ...ch.doc.data() };
        if (n.read) return;
        setToasts((prev) => [n, ...prev].slice(0, 3));
        playNotifySound(soundForType(n.type));
        setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== n.id)), 6000);
      });
    }, () => {});
    return () => unsub();
  }, [currentUser?.uid]);

  // Creator's own scheduled live: remind 5 minutes before and at start time, wherever they are in the app
  const [schedAt, setSchedAt] = useState(null);
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      const sched = getScheduledLive(snap.data());
      setSchedAt(sched && !snap.data()?.is_live ? sched.date.getTime() : null);
    }, () => {});
    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!schedAt || !currentUser?.uid) return;
    const push = (id, message) => {
      const n = { id: `${id}-${schedAt}`, local: true, type: 'live_reminder', message, link: `/livestream/${currentUser.uid}` };
      setToasts((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 3));
      playNotifySound(soundForType('booking'));
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== n.id)), 60000);
    };
    const timers = [];
    const now = Date.now();
    const soon = schedAt - 5 * 60000;
    if (soon > now) timers.push(setTimeout(() => push('live-soon', 'Your scheduled live starts in 5 minutes — tap to open Live Studio.'), soon - now));
    if (schedAt > now) timers.push(setTimeout(() => push('live-now', "It's time! Fans are waiting — tap to go live."), schedAt - now));
    else if (now - schedAt < 30 * 60000) push('live-now', 'Your scheduled live has started — fans are waiting. Tap to go live.');
    return () => timers.forEach(clearTimeout);
  }, [schedAt, currentUser?.uid]);

  // Don't cover live video/calls with big popups — keep them compact there
  const inCall = /^\/(video-call|voice-call|livestream)\//.test(location.pathname);

  const open = (n) => {
    setToasts((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.local) updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
    if (n.local && n.link) navigate(n.link);
    else if (!inCall) navigate(routeFor(n));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundState(next);
    if (next) playNotifySound('default');
  };

  return (
    <div className={`fixed z-[120] left-3 right-3 sm:left-auto sm:right-4 sm:w-96 flex flex-col gap-2 pointer-events-none ${inCall ? 'top-16' : 'top-3'}`}>
      <AnimatePresence>
        {toasts.map((n) => (
          <motion.div key={n.id}
            initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
            className="pointer-events-auto bg-white border border-gray-200 shadow-2xl rounded-2xl p-3 flex items-start gap-3">
            <button onClick={() => open(n)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
              <span className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-lg flex-shrink-0">{iconFor(n.type)}</span>
              <span className="min-w-0">
                                <span className="block text-sm text-gray-600 line-clamp-2">
                  {n.actorName ? <b className="text-gray-900">{n.actorName} </b> : null}
                  {n.message || n.body || 'You have a new notification'}
                </span>
              </span>
            </button>
            <div className="flex flex-col items-center gap-1">
              <button onClick={() => setToasts((p) => p.filter((x) => x.id !== n.id))} aria-label="Dismiss"
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
              <button onClick={toggleSound} aria-label={soundOn ? 'Mute notification sound' : 'Turn on notification sound'}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
