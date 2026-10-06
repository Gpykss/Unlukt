// src/pages/MyCalls/MyCalls.jsx
// Realtime list of calls for BOTH sides: calls I booked (fan) and calls booked with me (creator).
// Creator can reject a booking, fan can cancel — both refund the fan in full.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Video, Clock, CheckCircle, XCircle, Loader2, ArrowLeft, Ban, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { cancelBooking, endVideoCall, END_CALL_REASONS } from '../../services/videoCallService';

const TABS = ['active', 'upcoming', 'past'];
const ENDED_STATUSES = ['refunded', 'cancelled', 'rejected', 'completed', 'ended'];
const OPEN_STATUSES = ['confirmed', 'in_progress']; // not completed or cancelled yet

export default function MyCalls() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [tab, setTab] = useState('active');
  const [asFan, setAsFan] = useState([]);
  const [asCreator, setAsCreator] = useState([]);
  const [profiles, setProfiles] = useState({}); // uid -> {name, username, avatar}
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(null); // { call, action: 'reject' | 'cancel' }
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState('');
  const requested = useRef(new Set());

  // ✅ Realtime: new bookings show up instantly for the creator
  useEffect(() => {
    if (!currentUser) return;
    let loaded = 0;
    const done = () => { loaded += 1; if (loaded >= 2) setLoading(false); };
    const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const u1 = onSnapshot(query(collection(db, 'call_bookings'), where('userId', '==', currentUser.uid)),
      (snap) => { setAsFan(toList(snap)); done(); }, done);
    const u2 = onSnapshot(query(collection(db, 'call_bookings'), where('creatorId', '==', currentUser.uid)),
      (snap) => { setAsCreator(toList(snap)); done(); }, done);
    return () => { u1(); u2(); };
  }, [currentUser]);

  // Re-evaluate "Ready to join" / countdowns every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load names/avatars of the other person on each call
  useEffect(() => {
    if (!currentUser) return;
    const ids = new Set();
    asFan.forEach((b) => b.creatorId && ids.add(b.creatorId));
    asCreator.forEach((b) => b.userId && ids.add(b.userId));
    ids.forEach((uid) => {
      if (requested.current.has(uid)) return;
      requested.current.add(uid);
      getDoc(doc(db, 'users', uid)).then((snap) => {
        const u = snap.exists() ? snap.data() : {};
        setProfiles((p) => ({
          ...p,
          [uid]: {
            name: u.displayName || u.username || 'User',
            username: u.username || '',
            avatar: u.profilePicture || u.avatar || null,
          },
        }));
      }).catch(() => {});
    });
  }, [asFan, asCreator, currentUser]);

  const calls = useMemo(() => {
    const active = [], upcoming = [], past = [];
    const add = (b, role) => {
      const scheduled = b.scheduledAt?.toDate?.() || new Date(b.scheduledAt);
      const expiresAt = new Date(scheduled.getTime() + (b.duration || 30) * 60 * 1000);
      const minsUntil = Math.floor((scheduled - now) / 60000);
      const canJoin = b.status === 'confirmed' && minsUntil <= 5 && now < expiresAt;
      const otherId = role === 'creator' ? b.userId : b.creatorId;
      const isOpen = OPEN_STATUSES.includes(b.status);
      const overdue = isOpen && now > expiresAt; // slot is over but nobody completed or cancelled it
      const myEnded = b.status === 'in_progress' && (role === 'creator' ? b.creatorEnded : b.userEnded) === true;
      const otherEnded = b.status === 'in_progress' && (role === 'creator' ? b.userEnded : b.creatorEnded) === true;
      const call = {
        ...b, role, scheduled, expiresAt, minsUntil, canJoin, isOpen, overdue, myEnded, otherEnded,
        other: profiles[otherId] || { name: role === 'creator' ? 'Fan' : 'Creator', avatar: null },
      };
      if (ENDED_STATUSES.includes(b.status)) past.push({ ...call, ended: true });
      else if (myEnded) past.push(call); // I finished; just waiting for the other side to close it
      else if (overdue || canJoin || b.status === 'in_progress') active.push(call);
      else upcoming.push(call);
    };
    asFan.forEach((b) => add(b, 'fan'));
    asCreator.forEach((b) => add(b, 'creator'));
    active.sort((a, b) => a.scheduled - b.scheduled);
    upcoming.sort((a, b) => a.scheduled - b.scheduled);
    past.sort((a, b) => b.scheduled - a.scheduled);
    const openCount = active.length + upcoming.length;
    const overdueCount = active.filter((c) => c.overdue).length;
    return { active, upcoming, past, openCount, overdueCount };
  }, [asFan, asCreator, profiles, now]);

  // Jump to the tab that has something the first time data arrives
  const jumped = useRef(false);
  useEffect(() => {
    if (loading || jumped.current) return;
    jumped.current = true;
    if (!calls.active.length && calls.upcoming.length) setTab('upcoming');
  }, [loading, calls.active.length, calls.upcoming.length]);

  const markComplete = async (call) => {
    try {
      const r = await endVideoCall(call.id, currentUser.uid, END_CALL_REASONS.ENDED);
      setToast(r?.bothEnded ? 'Call closed ✅' : 'Marked as finished on your side — it closes when the other person ends too');
    } catch (e) {
      setToast(e.message || 'Could not update this call');
    } finally {
      setTimeout(() => setToast(''), 3500);
    }
  };

  const runCancel = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      await cancelBooking(confirm.call.id, currentUser.uid, reason.trim());
      setToast(confirm.action === 'reject' ? 'Call declined — the fan was refunded' : 'Call cancelled — refunded to your wallet');
      setConfirm(null);
      setReason('');
    } catch (e) {
      setToast(e.message || 'Could not cancel this call');
    } finally {
      setWorking(false);
      setTimeout(() => setToast(''), 3500);
    }
  };

  const formatScheduled = (date) => {
    const diff = Math.floor((date - now) / 60000);
    if (diff < 0) return 'Now';
    if (diff < 60) return `In ${diff} min`;
    if (diff < 1440) return `In ${Math.floor(diff / 60)}h ${diff % 60}m`;
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusLabel = (call) => {
    if (call.myEnded) return { text: `✅ You finished · waiting for ${call.role === 'creator' ? 'the fan' : 'the creator'} to close it`, cls: 'text-gray-500' };
    if (call.otherEnded) return { text: `☑️ ${call.role === 'creator' ? 'The fan' : 'The creator'} ended the call — tap Finish to close it`, cls: 'text-blue-600' };
    if (call.overdue) return {
      text: call.status === 'in_progress' ? '⚠️ Call not ended yet' : '⚠️ Time passed — not completed or cancelled',
      cls: 'text-amber-700',
    };
    if (call.canJoin) return { text: '🟢 Ready to join', cls: 'text-green-600' };
    if (call.status === 'in_progress') return { text: '🔴 In progress', cls: 'text-rose-600' };
    if (call.status === 'rejected') return { text: call.role === 'creator' ? '🚫 You declined' : '🚫 Declined by creator · refunded', cls: 'text-amber-600' };
    if (call.status === 'cancelled') return { text: call.role === 'fan' ? '↩️ You cancelled · refunded' : '↩️ Cancelled by fan', cls: 'text-amber-600' };
    if (call.status === 'refunded') return { text: '💰 Refunded', cls: 'text-amber-600' };
    if (call.status === 'completed' || call.status === 'ended') return { text: '✅ Completed', cls: 'text-gray-400' };
    if (call.ended) return { text: '⏰ Expired', cls: 'text-gray-400' };
    return { text: `⏰ ${formatScheduled(call.scheduled)}`, cls: 'text-gray-500' };
  };

  const tabCounts = { active: calls.active.length, upcoming: calls.upcoming.length, past: calls.past.length };
  const currentCalls = calls[tab];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-3">
          <button onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/feed'))} aria-label="Back"
            className="p-2 hover:bg-gray-100 rounded-full transition">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">My Calls</h1>
        </div>

        <div className="max-w-2xl mx-auto px-4 flex border-t border-gray-100">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold capitalize flex items-center justify-center gap-1.5 border-b-2 transition ${
                tab === t ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
              {tabCounts[t] > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {tabCounts[t]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5">
        {!loading && calls.openCount > 0 && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 flex items-start gap-3 ${
            calls.overdueCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${calls.overdueCount > 0 ? 'text-amber-500' : 'text-blue-500'}`} />
            <div className="text-sm">
              <p className={`font-bold ${calls.overdueCount > 0 ? 'text-amber-900' : 'text-blue-900'}`}>
                {calls.openCount} open call{calls.openCount > 1 ? 's' : ''} — not completed or cancelled yet
              </p>
              <p className={`text-xs mt-0.5 ${calls.overdueCount > 0 ? 'text-amber-800' : 'text-blue-800'}`}>
                {calls.overdueCount > 0
                  ? `${calls.overdueCount} ${calls.overdueCount > 1 ? 'are' : 'is'} past the booked time. Join, finish or cancel ${calls.overdueCount > 1 ? 'them' : 'it'} so it's closed for both of you.`
                  : 'Both you and the other person see this until the call is completed or cancelled.'}
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        ) : currentCalls.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {tab === 'active' ? 'No active calls right now' : tab === 'upcoming' ? 'No upcoming calls booked' : 'No past calls yet'}
            </p>
            {tab !== 'past' && (
              <button onClick={() => navigate('/discover')}
                className="mt-4 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold text-sm transition">
                Browse Creators
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            {currentCalls.map((call) => {
              const label = statusLabel(call);
              const canCancel = call.status === 'confirmed';
              return (
                <div key={`${call.role}-${call.id}`}
                  className={`bg-white rounded-2xl border p-3 sm:p-4 ${
                    call.overdue ? 'border-amber-300 bg-amber-50/60' :
                    call.canJoin ? 'border-green-300 bg-green-50 shadow-sm' : call.ended ? 'border-gray-200 opacity-80' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {call.other.avatar ? <img src={call.other.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">👤</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {call.type === 'video'
                            ? <Video className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                            : <Phone className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
                          <p className="font-bold text-gray-900 text-sm truncate">{call.other.name}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            call.role === 'creator' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                            {call.role === 'creator' ? 'Booked you' : 'You booked'}
                          </span>
                          {call.isOpen && (
                            <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              call.overdue ? 'bg-amber-200 text-amber-900' : 'bg-blue-100 text-blue-700'}`}>
                              Open
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{call.duration} min · ${Number(call.price || 0).toFixed(2)}</p>
                        <p className={`text-xs font-semibold mt-0.5 ${label.cls}`}>{label.text}</p>
                        {call.note && call.role === 'creator' && !call.ended && (
                          <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">“{call.note}”</p>
                        )}
                      </div>
                    </div>

                    {call.myEnded ? (
                      <div className="flex-shrink-0"><CheckCircle className="w-6 h-6 text-gray-300" /></div>
                    ) : call.otherEnded ? (
                      <button onClick={() => markComplete(call)}
                        className="flex-shrink-0 min-h-[44px] px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-sm transition flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" /> Finish
                      </button>
                    ) : call.overdue && call.status === 'confirmed' ? (
                      <div className="flex-shrink-0 px-3 py-2 bg-amber-100 text-amber-800 rounded-xl text-xs font-bold text-center">
                        <AlertTriangle className="w-4 h-4 mx-auto mb-0.5" />Overdue
                      </div>
                    ) : call.canJoin ? (
                      <button onClick={() => navigate(`/waiting-room/${call.id}`)}
                        className="flex-shrink-0 min-h-[44px] px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow-md">
                        {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />} Join
                      </button>
                    ) : call.status === 'in_progress' ? (
                      <button onClick={() => navigate(`/waiting-room/${call.id}`)}
                        className="flex-shrink-0 min-h-[44px] px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm transition">
                        Rejoin
                      </button>
                    ) : call.ended ? (
                      <div className="flex-shrink-0">
                        {['refunded', 'cancelled', 'rejected'].includes(call.status)
                          ? <XCircle className="w-6 h-6 text-amber-400" />
                          : <CheckCircle className="w-6 h-6 text-green-400" />}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-semibold text-center">
                        <Clock className="w-4 h-4 mx-auto mb-0.5" />
                        {call.minsUntil > 5 ? `${call.minsUntil - 5}m` : 'Soon'}
                      </div>
                    )}
                  </div>

                  {(canCancel || (call.overdue && call.status === 'in_progress' && !call.myEnded && !call.otherEnded)) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap justify-end gap-2">
                      {call.overdue && call.status === 'in_progress' && (
                        <button onClick={() => markComplete(call)}
                          className="min-h-[40px] px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4" /> Mark as finished
                        </button>
                      )}
                      {canCancel && (
                      <button
                        onClick={() => { setReason(''); setConfirm({ call, action: call.role === 'creator' ? 'reject' : 'cancel' }); }}
                        className="min-h-[40px] px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition flex items-center gap-1.5">
                        <Ban className="w-4 h-4" />
                        {call.role === 'creator' ? 'Reject call' : 'Cancel booking'}
                      </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm sheet */}
      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 bg-black/50 z-[130] flex items-center justify-center p-4" onClick={() => !working && setConfirm(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {confirm.action === 'reject' ? 'Reject this call?' : 'Cancel this booking?'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {confirm.action === 'reject'
                  ? `${confirm.call.other.name} gets a full $${Number(confirm.call.price || 0).toFixed(2)} refund to their wallet, and you'll be open for new bookings.`
                  : `You'll get your $${Number(confirm.call.price || 0).toFixed(2)} back in your wallet right away.`}
              </p>
              {confirm.action === 'reject' && (
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140}
                  placeholder="Reason (optional) — e.g. not available at that time"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500" />
              )}
              <div className="flex gap-3">
                <button disabled={working} onClick={() => setConfirm(null)}
                  className="flex-1 min-h-[44px] py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold text-gray-800">
                  Keep it
                </button>
                <button disabled={working} onClick={runCancel}
                  className="flex-1 min-h-[44px] py-3 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl font-bold flex items-center justify-center">
                  {working ? <Loader2 className="w-5 h-5 animate-spin" /> : confirm.action === 'reject' ? 'Reject & refund' : 'Cancel & refund'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 z-50 bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
