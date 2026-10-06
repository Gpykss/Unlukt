// src/components/Live/ScheduledLiveCard.jsx
// Shows the creator's upcoming scheduled live (realtime) with countdown, Share, Cancel and Go Live.
// Used on the dashboard and at the top of Live Studio. `variant`: 'light' (dashboard) | 'dark' (studio).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { CalendarClock, Share2, X, Radio } from 'lucide-react';
import { db } from '../../config/firebase';
import { getScheduledLive, formatLiveTime, timeUntil, shareLink, liveUrl } from '../../utils/share';

export default function ScheduledLiveCard({ uid, variant = 'light', showWhenEmpty = true, onGoLive }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [, tick] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (s) => setUser(s.data() || null), () => {});
  }, [uid]);

  // Refresh the countdown every 30s
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  if (!user) return null;
  const sched = getScheduledLive(user);
  const dark = variant === 'dark';
  const isLive = !!user.is_live;

  const goLive = () => (onGoLive ? onGoLive() : navigate(`/livestream/${uid}`));
  const share = async () => {
    const name = user.displayName || user.username || 'me';
    const r = await shareLink({
      url: liveUrl(uid), title: 'Unlukt Live',
      text: sched ? `${name} goes live on Unlukt ${formatLiveTime(sched.date)} 🔴 Save the link:` : `Join ${name}'s live on Unlukt 🔴`,
    });
    if (r === 'copied') { setNote('Link copied'); setTimeout(() => setNote(''), 2500); }
  };
  const cancel = () => updateDoc(doc(db, 'users', uid), { scheduledLive: null }).catch(() => {});

  const box = dark
    ? 'bg-gradient-to-br from-rose-500/15 to-pink-500/5 border border-rose-500/30 text-white'
    : 'bg-white border border-gray-200/80 text-gray-900 shadow-sm';
  const sub = dark ? 'text-slate-400' : 'text-gray-500';
  const ghostBtn = dark ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800';

  if (!sched && !isLive) {
    if (!showWhenEmpty) return null;
    return (
      <div className={`rounded-2xl p-4 flex items-center gap-3 ${box}`}>
        <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0"><CalendarClock className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">No live scheduled</p>
          <p className={`text-xs ${sub}`}>Schedule one and share the link so fans are waiting.</p>
        </div>
        <button onClick={goLive} className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold whitespace-nowrap">Schedule</button>
      </div>
    );
  }

  const due = sched && sched.date.getTime() - Date.now() <= 5 * 60000;

  return (
    <div className={`rounded-2xl p-4 ${box}`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isLive ? 'bg-red-500 text-white' : 'bg-rose-500/15 text-rose-500'}`}>
          {isLive ? <Radio className="w-5 h-5" /> : <CalendarClock className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-wider ${isLive ? 'text-red-500' : 'text-rose-500'}`}>
            {isLive ? 'You are live now' : 'Scheduled live'}
          </p>
          {sched && <p className="font-bold text-sm sm:text-base truncate">{sched.title || 'Live session'}</p>}
          {sched && <p className={`text-xs ${sub}`}>{formatLiveTime(sched.date)} · <b className="text-rose-500">starts {timeUntil(sched.date)}</b></p>}
        </div>
        {sched && !isLive && (
          <button onClick={cancel} aria-label="Cancel scheduled live" title="Cancel scheduled live"
            className={`p-2 rounded-lg ${sub} hover:text-red-500`}><X className="w-4 h-4" /></button>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={share} className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${ghostBtn}`}>
          <Share2 className="w-4 h-4" /> {note || 'Share link'}
        </button>
        <button onClick={goLive}
          className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold text-white ${isLive || due ? 'bg-gradient-to-r from-rose-500 to-pink-600 animate-pulse' : 'bg-rose-500 hover:bg-rose-600'}`}>
          {isLive ? 'Back to my live' : due ? 'Go live now 🔴' : 'Open Live Studio'}
        </button>
      </div>
    </div>
  );
}
