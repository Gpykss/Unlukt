// src/pages/MyCalls/MyCalls.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Video, Clock, Calendar, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

const TABS = ['active', 'upcoming', 'past'];

export default function MyCalls() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [tab, setTab] = useState('active');
  const [calls, setCalls] = useState({ active: [], upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) fetchCalls();
  }, [currentUser]);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(
        collection(db, 'call_bookings'),
        where('userId', '==', currentUser.uid)
      ));

      const now = new Date();
      const active = [], upcoming = [], past = [];

      await Promise.all(snap.docs.map(async (d) => {
        const data = { id: d.id, ...d.data() };
        const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
        const durationMs = (data.duration || 30) * 60 * 1000;
        const expiresAt = new Date(scheduled.getTime() + durationMs);

        const creatorDoc = await getDoc(doc(db, 'users', data.creatorId));
        const creator = creatorDoc.exists() ? creatorDoc.data() : {};

        const minsUntil = Math.floor((scheduled - now) / 60000);
        const canJoin = minsUntil <= 5 && now < expiresAt;

        const callObj = {
          id: data.id,
          type: data.type,
          scheduled,
          expiresAt,
          duration: data.duration,
          price: data.price,
          status: data.status,
          canJoin,
          minsUntil,
          creator: {
            name: creator.displayName || 'Creator',
            username: creator.username || '',
            avatar: creator.profilePicture || creator.avatar || null,
          },
        };

        if (data.status === 'refunded' || data.status === 'cancelled') {
          past.push({ ...callObj, ended: true });
        } else if (data.status === 'completed' || data.status === 'ended') {
          past.push({ ...callObj, ended: true });
        } else if (now > expiresAt) {
          past.push({ ...callObj, ended: true });
        } else if (canJoin || data.status === 'in_progress') {
          active.push(callObj);
        } else {
          upcoming.push(callObj);
        }
      }));

      // Sort
      active.sort((a, b) => a.scheduled - b.scheduled);
      upcoming.sort((a, b) => a.scheduled - b.scheduled);
      past.sort((a, b) => b.scheduled - a.scheduled);

      setCalls({ active, upcoming, past });
    } catch (e) {
      console.error('Error fetching calls:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatScheduled = (date) => {
    const now = new Date();
    const diff = Math.floor((date - now) / 60000);
    if (diff < 0) return 'Now';
    if (diff < 60) return `In ${diff} min`;
    if (diff < 1440) return `In ${Math.floor(diff / 60)}h ${diff % 60}m`;
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatPast = (date) => date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const tabCounts = {
    active: calls.active.length,
    upcoming: calls.upcoming.length,
    past: calls.past.length,
  };

  const currentCalls = calls[tab];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-3">
          <button onClick={() => navigate('/feed')} className="p-2 hover:bg-gray-100 rounded-full transition">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">My Calls</h1>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex border-t border-gray-100">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold capitalize flex items-center justify-center gap-1.5 border-b-2 transition ${
                tab === t ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {tabCounts[t] > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  tab === t ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tabCounts[t]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        ) : currentCalls.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {tab === 'active' ? 'No active calls right now' :
               tab === 'upcoming' ? 'No upcoming calls booked' :
               'No past calls yet'}
            </p>
            {tab !== 'past' && (
              <button onClick={() => navigate('/feed')}
                className="mt-4 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold text-sm transition">
                Browse Creators
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            {currentCalls.map((call, i) => (
              <motion.div
                key={call.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-white rounded-2xl border p-4 flex items-center justify-between gap-4 ${
                  call.canJoin ? 'border-green-300 bg-green-50 shadow-sm' :
                  call.ended ? 'border-gray-200 opacity-75' :
                  'border-gray-200'
                }`}
              >
                {/* Left */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {call.creator.avatar
                      ? <img src={call.creator.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">👤</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {call.type === 'video'
                        ? <Video className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                        : <Phone className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
                      <p className="font-bold text-gray-900 text-sm truncate">{call.creator.name}</p>
                    </div>
                    <p className="text-xs text-gray-500">{call.duration} min · ${call.price?.toFixed(2)}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${
                      call.canJoin ? 'text-green-600' :
                      call.status === 'refunded' ? 'text-amber-600' :
                      call.ended ? 'text-gray-400' :
                      'text-gray-500'
                    }`}>
                      {call.canJoin ? '🟢 Ready to join' :
                       call.status === 'refunded' ? '💰 Refunded' :
                       call.status === 'completed' || call.status === 'ended' ? '✅ Completed' :
                       call.ended ? '⏰ Expired' :
                       `⏰ ${formatScheduled(call.scheduled)}`}
                    </p>
                  </div>
                </div>

                {/* Right */}
                {call.canJoin ? (
                  <button
                    onClick={() => navigate(`/waiting-room/${call.id}`)}
                    className="flex-shrink-0 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow-md">
                    {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    Join
                  </button>
                ) : call.status === 'in_progress' ? (
                  <button
                    onClick={() => navigate(`/waiting-room/${call.id}`)}
                    className="flex-shrink-0 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm transition flex items-center gap-1.5">
                    Rejoin
                  </button>
                ) : call.ended ? (
                  <div className="flex-shrink-0">
                    {call.status === 'refunded'
                      ? <XCircle className="w-6 h-6 text-amber-400" />
                      : <CheckCircle className="w-6 h-6 text-green-400" />}
                  </div>
                ) : (
                  <div className="flex-shrink-0 px-3 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold text-center">
                    <Clock className="w-4 h-4 mx-auto mb-0.5" />
                    {call.minsUntil > 5 ? `${call.minsUntil - 5}m` : 'Soon'}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}