// src/pages/VideoCall/BookVideoCall.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Video, Clock, CheckCircle, Loader2, User, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getWalletBalance } from '../../services/walletService';
import { pay } from '../../services/payService';
import { MINIMUM_VIDEO_PRICE, CALL_DURATIONS, MIN_BOOKING_LEAD_MINS, getCreatorActiveBooking, getCreatorAvailability } from '../../services/videoCallService';
import { getCallTier, getCallDiscount } from '../../services/tierService';

export default function BookVideoCall() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [userTier, setUserTier] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [creatorBusy, setCreatorBusy] = useState(null); // open booking that blocks new ones

  useEffect(() => {
    if (!creatorId) return;
    getCreatorActiveBooking(creatorId).then(setCreatorBusy).catch(() => setCreatorBusy(null));
  }, [creatorId]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { loadData(); }, [creatorId, currentUser]);

  const loadData = async () => {
    try {
      const [userDoc, availData] = await Promise.all([
        getDoc(doc(db, 'users', creatorId)),
        getCreatorAvailability(creatorId).catch(() => null),
      ]);

      if (userDoc.exists()) {
        const uData = userDoc.data();
        setCreator({
          id: userDoc.id,
          ...uData,
          videoCallPrice: availData?.videoCallPrice ?? uData.videoCallPrice ?? MINIMUM_VIDEO_PRICE,
          callsEnabled: availData?.callsEnabled ?? uData.callsEnabled ?? true,
          availabilityStatus: availData?.status ?? (uData.isAvailableForCalls ? 'available' : 'offline'),
        });
      }
      if (currentUser) {
        setWalletBalance(await getWalletBalance(currentUser.uid));
        const tier = await getCallTier(currentUser.uid, creatorId); // same rule the server uses
        setUserTier(tier);
      }
    } catch (err) {
      console.error('Error loading:', err);
    } finally {
      setLoading(false);
    }
  };

  const getOriginalPrice = () => {
    const base = Math.max(MINIMUM_VIDEO_PRICE, creator?.videoCallPrice || MINIMUM_VIDEO_PRICE);
    return parseFloat(((base * selectedDuration) / 30).toFixed(2));
  };

  const getDiscountedPrice = () => {
    const orig = getOriginalPrice();
    const discount = getCallDiscount(userTier);
    if (discount > 0) {
      return parseFloat((orig * (1 - discount)).toFixed(2));
    }
    return orig;
  };

  // ✅ Minimum lead time from now (MIN_BOOKING_LEAD_MINS)
  const getMinDateTime = () => {
    const min = new Date(Date.now() + MIN_BOOKING_LEAD_MINS * 60 * 1000);
    return min;
  };

  const checkUserActiveBooking = async () => {
    const snap = await getDocs(query(
      collection(db, 'call_bookings'),
      where('userId', '==', currentUser.uid),
      where('status', 'in', ['confirmed', 'in_progress'])
    ));
    for (const d of snap.docs) {
      const data = d.data();
      const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
      const expiresAt = new Date(scheduled.getTime() + (data.duration || 30) * 60 * 1000);
      if (new Date() < expiresAt) return { id: d.id, ...data, scheduledAtDate: scheduled };
    }
    return null;
  };

  // ✅ One booking at a time — creator is blocked until their open call is completed or cancelled
  const checkCreatorConflict = async () => {
    const active = await getCreatorActiveBooking(creatorId);
    return active ? active.scheduledAtDate : null;
  };

  const handleBook = async () => {
    setError('');
    if (!isAcceptingCalls) {
      setError('Creator is currently offline or not accepting new calls.');
      return;
    }
    if (!scheduledDate || !scheduledTime) { setError('Please select a date and time'); return; }

    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    const minAllowed = getMinDateTime();

    if (scheduled < minAllowed) {
      setError(`Please schedule at least ${MIN_BOOKING_LEAD_MINS} minutes from now`);
      return;
    }

    const price = getDiscountedPrice();
    if (walletBalance < price) {
      setError(`Insufficient balance ($${walletBalance.toFixed(2)}). Need $${price.toFixed(2)}.`);
      return;
    }

    try {
      setBooking(true);

      const activeBooking = await checkUserActiveBooking();
      if (activeBooking) {
        setError(`You already have an active booking for ${activeBooking.scheduledAtDate.toLocaleString()}.`);
        setBooking(false);
        return;
      }

      const conflict = await checkCreatorConflict();
      if (conflict) {
        setError(`This creator already has a call booked (${conflict.toLocaleString()}). New bookings open once that call is completed or cancelled.`);
        setBooking(false);
        return;
      }

      // The server checks the price, the creator's availability and the wallet, then books
      // and pays in one step (no half-finished bookings on a dropped connection)
      const res = await pay('call', {
        creatorId: creator.id,
        callType: 'video',
        duration: selectedDuration,
        scheduledAt: scheduled.getTime(),
        note,
        expectedPrice: price,
      });
      const bookingRef = { id: res.bookingId };

      setScheduledAt(scheduled);
      setBooked(bookingRef.id);
      setWalletBalance(res.balanceAfter ?? walletBalance - price);
    } catch (err) {
      setError(err.message || 'Failed to book call');
    } finally {
      setBooking(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
    </div>
  );

  if (booked) {
    const canJoin = scheduledAt && now >= new Date(scheduledAt.getTime() - 5 * 60 * 1000);
    const timeUntil = scheduledAt ? Math.max(0, Math.floor((scheduledAt - now) / 60000)) : 0;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-1">Scheduled for <b>{scheduledAt?.toLocaleString()}</b></p>
          <p className="text-sm text-gray-500 mb-2">You'll get a reminder 2 minutes before.</p>
          <p className="text-sm text-gray-500 mb-6">Remaining balance: <b>${walletBalance.toFixed(2)}</b></p>
          {canJoin ? (
            <button onClick={() => navigate(`/waiting-room/${booked}`)}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-lg transition mb-3 flex items-center justify-center space-x-2">
              <Video className="w-5 h-5" /><span>Enter Waiting Room</span>
            </button>
          ) : (
            <div className="w-full py-4 bg-gray-100 rounded-xl text-gray-500 font-semibold mb-3">
              <Clock className="w-4 h-4 inline mr-2" />Join available in {timeUntil} min
            </div>
          )}
          <button onClick={() => navigate('/my-calls')}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition text-sm">
            View My Calls
          </button>
        </motion.div>
      </div>
    );
  }

  const price = getDiscountedPrice();
  const canAfford = walletBalance >= price;
  const isAcceptingCalls = creator?.callsEnabled !== false && creator?.availabilityStatus !== 'offline';
  const minDateTime = getMinDateTime();
  const minDate = minDateTime.toISOString().split('T')[0];
  const minTime = minDateTime.toTimeString().slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-4">
          <button onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(`/creator/${creator?.username || creatorId}`))} aria-label="Back" className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Book Video Call</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Wallet */}
        <div className={`rounded-2xl p-4 flex items-center justify-between border ${canAfford ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center space-x-3">
            <Wallet className={`w-5 h-5 ${canAfford ? 'text-green-600' : 'text-amber-600'}`} />
            <div>
              <p className="text-sm font-semibold text-gray-800">Wallet Balance</p>
              <p className={`text-lg font-bold ${canAfford ? 'text-green-700' : 'text-amber-700'}`}>${walletBalance.toFixed(2)}</p>
            </div>
          </div>
          {!canAfford && (
            <button onClick={() => navigate('/wallet')} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition">
              Add Funds
            </button>
          )}
        </div>

        {/* Creator */}
        {creator && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 overflow-hidden flex items-center justify-center">
              {creator.profilePicture
                ? <img src={creator.profilePicture} alt="" className="w-full h-full object-cover" />
                : <User className="w-8 h-8 text-rose-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900 text-lg">{creator.displayName}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isAcceptingCalls ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {isAcceptingCalls ? '● Available' : 'Offline'}
                </span>
              </div>
              <p className="text-gray-500 text-sm">@{creator.username}</p>
              <div className="flex items-center space-x-1 mt-1">
                <Video className="w-4 h-4 text-rose-500" />
                <span className="text-sm text-rose-600 font-semibold">${creator.videoCallPrice || MINIMUM_VIDEO_PRICE} / 30 min</span>
              </div>
            </div>
          </div>
        )}

        {/* Offline Warning Banner */}
        {creator && !isAcceptingCalls && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p>
              <b>@{creator.username || 'Creator'}</b> is currently offline or not taking calls. Bookings are temporarily paused.
            </p>
          </div>
        )}

        {creatorBusy && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            This creator already has a call booked. New bookings open as soon as that call is completed or cancelled.
          </div>
        )}

        {/* Duration — 4 options */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Call Duration</label>
          <div className="grid grid-cols-4 gap-2">
            {CALL_DURATIONS.map(({ mins, label }) => (
              <button key={mins} onClick={() => setSelectedDuration(mins)}
                className={`py-3 rounded-xl font-semibold transition border-2 text-sm ${
                  selectedDuration === mins ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule — min lead time from now */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Schedule</label>
          <p className="text-xs text-gray-400 mb-3">Minimum {MIN_BOOKING_LEAD_MINS} minutes from now</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input type="date" value={scheduledDate} min={minDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Time</label>
              <input type="time" value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Note (Optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="What would you like to talk about?" rows={3} maxLength={200}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm" />
        </div>

        {error && (
          <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            {error.includes('Insufficient') && (
              <button onClick={() => navigate('/wallet')} className="text-xs font-semibold text-rose-600 underline whitespace-nowrap">Add Funds</button>
            )}
          </div>
        )}

        {/* Price summary */}
        <div className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Deducted from wallet</p>
              <div className="flex items-baseline space-x-2 mt-1 flex-wrap gap-y-1">
                {userTier && getCallDiscount(userTier) > 0 ? (
                  <>
                    <p className="text-3xl font-bold">${price.toFixed(2)}</p>
                    <p className="text-lg line-through opacity-60">${getOriginalPrice().toFixed(2)}</p>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                      {(getCallDiscount(userTier) * 100)}% Active Subscriber Discount
                    </span>
                  </>
                ) : (
                  <p className="text-3xl font-bold">${price.toFixed(2)}</p>
                )}
              </div>
              <p className="text-xs opacity-70 mt-1">{selectedDuration} min video call</p>
            </div>
            <Video className="w-12 h-12 opacity-30" />
          </div>
        </div>

        <button onClick={handleBook} disabled={booking || !canAfford || !isAcceptingCalls || !!creatorBusy}
          className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${
            !isAcceptingCalls || creatorBusy
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : canAfford
              ? 'bg-rose-500 hover:bg-rose-600 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}>
          {booking
            ? <span className="flex items-center justify-center space-x-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Booking...</span></span>
            : creatorBusy
            ? 'Creator Already Booked'
            : !isAcceptingCalls
            ? 'Creator Offline — Calls Paused'
            : canAfford ? `Book Now — $${price.toFixed(2)}` : `Need $${(price - walletBalance).toFixed(2)} more`}
        </button>
      </div>
    </div>
  );
}