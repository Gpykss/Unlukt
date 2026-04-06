// src/pages/VideoCall/BookVoiceCall.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, Clock, CheckCircle, Loader2, User, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, increment, setDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { MINIMUM_VOICE_PRICE, CALL_DURATIONS, MIN_BOOKING_LEAD_MINS } from '../../services/videoCallService';

const PLATFORM_FEE = 0.15;

export default function BookVoiceCall() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { loadData(); }, [creatorId, currentUser]);

  const loadData = async () => {
    try {
      const snap = await getDoc(doc(db, 'users', creatorId));
      if (snap.exists()) setCreator({ id: snap.id, ...snap.data() });
      if (currentUser) setWalletBalance(await getWalletBalance(currentUser.uid));
    } catch (err) {
      console.error('Error loading:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = () => {
    const base = Math.max(MINIMUM_VOICE_PRICE, creator?.voiceCallPrice || MINIMUM_VOICE_PRICE);
    return parseFloat(((base * selectedDuration) / 30).toFixed(2));
  };

  const getMinDateTime = () => new Date(Date.now() + MIN_BOOKING_LEAD_MINS * 60 * 1000);

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

  const checkCreatorConflict = async (selectedScheduled) => {
    const snap = await getDocs(query(
      collection(db, 'call_bookings'),
      where('creatorId', '==', creatorId),
      where('status', 'in', ['confirmed', 'in_progress'])
    ));
    for (const d of snap.docs) {
      const data = d.data();
      const existing = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
      const existingEnd = new Date(existing.getTime() + (data.duration + 15) * 60 * 1000);
      const selectedEnd = new Date(selectedScheduled.getTime() + (selectedDuration + 15) * 60 * 1000);
      if (selectedScheduled < existingEnd && selectedEnd > existing) return existing;
    }
    return null;
  };

  const handleBook = async () => {
    setError('');
    if (!scheduledDate || !scheduledTime) { setError('Please select a date and time'); return; }

    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    const minAllowed = getMinDateTime();
    if (scheduled < minAllowed) {
      setError(`Please schedule at least ${MIN_BOOKING_LEAD_MINS} minutes from now`);
      return;
    }

    const price = getPrice();
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

      const conflict = await checkCreatorConflict(scheduled);
      if (conflict) {
        setError(`Creator is already booked around ${conflict.toLocaleString()}. Choose a different time.`);
        setBooking(false);
        return;
      }

      const creatorEarning = price * (1 - PLATFORM_FEE);

      await deductFromWallet(currentUser.uid, price, 'Voice call booking', {
        contentType: 'voice_call', creatorId: creator.id,
      });

      const bookingRef = await addDoc(collection(db, 'call_bookings'), {
        type: 'voice',
        creatorId: creator.id,
        userId: currentUser.uid,
        duration: selectedDuration,
        price, creatorEarning,
        platformFee: price * PLATFORM_FEE,
        scheduledAt: scheduled,
        note, status: 'confirmed',
        creatorPaid: false,
        userEnded: false, creatorEnded: false,
        createdAt: serverTimestamp(),
      });

      const month = new Date().toLocaleString('default', { month: 'short' });
      const creatorBalRef = doc(db, 'creator_balances', creator.id);
      try {
        await updateDoc(creatorBalRef, {
          availableBalance: increment(creatorEarning),
          totalEarnings: increment(creatorEarning),
          [`monthlyEarnings.${month}`]: increment(creatorEarning),
          updatedAt: serverTimestamp(),
        });
      } catch {
        await setDoc(creatorBalRef, {
          creatorId: creator.id, availableBalance: creatorEarning,
          totalEarnings: creatorEarning,
          monthlyEarnings: { [month]: creatorEarning },
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'pending_releases'), {
        creatorId: creator.id, amount: creatorEarning,
        bookingId: bookingRef.id,
        releaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        released: false, createdAt: serverTimestamp(),
      });

      // ✅ Notify creator immediately
      await addDoc(collection(db, 'notifications'), {
        userId: creator.id,
        type: 'call_booking',
        message: `New voice call booked for ${scheduled.toLocaleString()} (${selectedDuration} min)`,
        bookingId: bookingRef.id,
        read: false, createdAt: serverTimestamp(),
      });

      // ✅ 5-min reminder for both parties
      await addDoc(collection(db, 'scheduled_notifications'), {
        userIds: [currentUser.uid, creator.id],
        type: 'call_reminder',
        message: `Your ${selectedDuration}-min voice call starts in 5 minutes! Join the waiting room now.`,
        bookingId: bookingRef.id,
        sendAt: new Date(scheduled.getTime() - 5 * 60 * 1000),
        sent: false,
        createdAt: serverTimestamp(),
      });

      setScheduledAt(scheduled);
      setBooked(bookingRef.id);
      setWalletBalance(prev => prev - price);
    } catch (err) {
      setError(err.message || 'Failed to book call');
    } finally {
      setBooking(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
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
          <p className="text-sm text-gray-500 mb-2">You'll get a reminder 5 minutes before.</p>
          <p className="text-sm text-gray-500 mb-6">Remaining balance: <b>${walletBalance.toFixed(2)}</b></p>
          {canJoin ? (
            <button onClick={() => navigate(`/waiting-room/${booked}`)}
              className="w-full py-4 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold text-lg transition mb-3 flex items-center justify-center space-x-2">
              <Phone className="w-5 h-5" /><span>Join Call Now</span>
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

  const price = getPrice();
  const canAfford = walletBalance >= price;
  const minDateTime = getMinDateTime();
  const minDate = minDateTime.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Book Voice Call</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
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

        {creator && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 overflow-hidden flex items-center justify-center">
              {creator.profilePicture
                ? <img src={creator.profilePicture} alt="" className="w-full h-full object-cover" />
                : <User className="w-8 h-8 text-purple-400" />}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{creator.displayName}</h2>
              <p className="text-gray-500 text-sm">@{creator.username}</p>
              <div className="flex items-center space-x-1 mt-1">
                <Phone className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-purple-600 font-semibold">${creator.voiceCallPrice || MINIMUM_VOICE_PRICE} / 30 min</span>
              </div>
            </div>
          </div>
        )}

        {/* Duration — 4 options */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Call Duration</label>
          <div className="grid grid-cols-4 gap-2">
            {CALL_DURATIONS.map(({ mins, label }) => (
              <button key={mins} onClick={() => setSelectedDuration(mins)}
                className={`py-3 rounded-xl font-semibold transition border-2 text-sm ${
                  selectedDuration === mins ? 'border-purple-500 bg-purple-50 text-purple-600' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Schedule</label>
          <p className="text-xs text-gray-400 mb-3">Minimum {MIN_BOOKING_LEAD_MINS} minutes from now</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input type="date" value={scheduledDate} min={minDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Time</label>
              <input type="time" value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Note to Creator (Optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="What would you like to talk about?" rows={3} maxLength={200}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 resize-none text-sm" />
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

        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Deducted from wallet</p>
              <p className="text-3xl font-bold mt-1">${price.toFixed(2)}</p>
              <p className="text-xs opacity-70 mt-1">{selectedDuration} min voice call</p>
            </div>
            <Phone className="w-12 h-12 opacity-30" />
          </div>
        </div>

        <button onClick={handleBook} disabled={booking || !canAfford}
          className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${
            canAfford ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}>
          {booking
            ? <span className="flex items-center justify-center space-x-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Booking...</span></span>
            : canAfford ? `Book Now — $${price.toFixed(2)}` : `Need $${(price - walletBalance).toFixed(2)} more`}
        </button>
      </div>
    </div>
  );
}