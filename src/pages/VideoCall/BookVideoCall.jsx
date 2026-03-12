// src/pages/VideoCall/BookVideoCall.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Video, Clock, Calendar, CheckCircle, Loader2, User, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, increment, setDoc, query, where, getDocs } from 'firebase/firestore';
import { getWalletBalance, deductFromWallet } from '../../services/walletService';
import { MINIMUM_VIDEO_PRICE } from '../../services/videoCallService';

const PLATFORM_FEE = 0.15;

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
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  const durations = [
    { mins: 30, label: '30 min' },
    { mins: 60, label: '1 hour' },
    { mins: 90, label: '1.5 hours' },
  ];

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { loadData(); }, [creatorId, currentUser]);

  const loadData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', creatorId));
      if (userDoc.exists()) setCreator({ id: userDoc.id, ...userDoc.data() });
      if (currentUser) {
        const bal = await getWalletBalance(currentUser.uid);
        setWalletBalance(bal);
      }
    } catch (err) {
      console.error('Error loading:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = () => {
    const basePrice = Math.max(MINIMUM_VIDEO_PRICE, creator?.videoCallPrice || MINIMUM_VIDEO_PRICE);
    return parseFloat(((basePrice * selectedDuration) / 30).toFixed(2));
  };

  // ✅ Check if user already has an active/pending booking
  const checkUserActiveBooking = async () => {
    const q = query(
      collection(db, 'call_bookings'),
      where('userId', '==', currentUser.uid),
      where('status', 'in', ['confirmed', 'in_progress'])
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const scheduled = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
      const expiresAt = new Date(scheduled.getTime() + 60 * 60 * 1000); // 1hr window
      if (new Date() < expiresAt) {
        return { id: d.id, ...data, scheduledAtDate: scheduled };
      }
    }
    return null;
  };

  // ✅ Check if creator already has a booking that overlaps the selected time
  const checkCreatorConflict = async (selectedScheduled) => {
    const q = query(
      collection(db, 'call_bookings'),
      where('creatorId', '==', creatorId),
      where('status', 'in', ['confirmed', 'in_progress'])
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const existing = data.scheduledAt?.toDate?.() || new Date(data.scheduledAt);
      const existingEnd = new Date(existing.getTime() + (data.duration + 15) * 60 * 1000); // duration + 15min buffer
      const selectedEnd = new Date(selectedScheduled.getTime() + (selectedDuration + 15) * 60 * 1000);

      // Check overlap
      const overlaps = selectedScheduled < existingEnd && selectedEnd > existing;
      if (overlaps) {
        return existing;
      }
    }
    return null;
  };

  const handleBook = async () => {
    setError('');
    if (!scheduledDate || !scheduledTime) { setError('Please select a date and time'); return; }

    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);

    // ✅ Prevent booking in the past
    if (scheduled < new Date()) {
      setError('Please select a future date and time');
      return;
    }

    const price = getPrice();
    if (walletBalance < price) { setError(`Insufficient balance ($${walletBalance.toFixed(2)}). Need $${price.toFixed(2)}.`); return; }

    try {
      setBooking(true);

      // ✅ Check 1: User already has an active booking
      const activeBooking = await checkUserActiveBooking();
      if (activeBooking) {
        const timeStr = activeBooking.scheduledAtDate.toLocaleString();
        setError(`You already have an active booking scheduled for ${timeStr}. Please wait until it expires before booking another call.`);
        setBooking(false);
        return;
      }

      // ✅ Check 2: Creator already booked at this time
      const conflict = await checkCreatorConflict(scheduled);
      if (conflict) {
        setError(`This creator is already booked around ${conflict.toLocaleString()}. Please choose a different time.`);
        setBooking(false);
        return;
      }

      const creatorEarning = price * (1 - PLATFORM_FEE);

      // 1. Deduct from user wallet
      await deductFromWallet(currentUser.uid, price, 'Video call booking', {
        contentType: 'video_call',
        creatorId: creator.id,
      });

      // 2. Create booking doc
      const bookingRef = await addDoc(collection(db, 'call_bookings'), {
        type: 'video',
        creatorId: creator.id,
        userId: currentUser.uid,
        duration: selectedDuration,
        price,
        creatorEarning,
        platformFee: price * PLATFORM_FEE,
        scheduledAt: scheduled,
        note,
        status: 'confirmed',
        creatorPaid: false,
        createdAt: serverTimestamp(),
      });

      // 3. Credit creator's pending balance
      const creatorBalRef = doc(db, 'creator_balances', creator.id);
      const creatorBalSnap = await getDoc(creatorBalRef);
      const month = new Date().toLocaleString('default', { month: 'short' });

      if (creatorBalSnap.exists()) {
        await setDoc(creatorBalRef, {
          pendingBalance: increment(creatorEarning),
          totalEarnings: increment(creatorEarning),
          [`monthlyEarnings.${month}`]: increment(creatorEarning),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        await setDoc(creatorBalRef, {
          creatorId: creator.id,
          availableBalance: 0,
          pendingBalance: creatorEarning,
          totalEarnings: creatorEarning,
          monthlyEarnings: { [month]: creatorEarning },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Schedule pending release (24hr hold)
      await addDoc(collection(db, 'pending_releases'), {
        creatorId: creator.id,
        amount: creatorEarning,
        bookingId: bookingRef.id,
        releaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        released: false,
        createdAt: serverTimestamp(),
      });

      // 5. Notify creator
      await addDoc(collection(db, 'notifications'), {
        userId: creator.id,
        type: 'call_booking',
        message: `New video call booked for ${scheduled.toLocaleString()}`,
        bookingId: bookingRef.id,
        read: false,
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
      <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
    </div>
  );

  if (booked) {
    const canJoin = scheduledAt && now >= new Date(scheduledAt.getTime() - 5 * 60 * 1000);
    const timeUntil = scheduledAt ? Math.max(0, Math.floor((scheduledAt - now) / 60000)) : 0;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-1">
            Scheduled for <b>{scheduledAt?.toLocaleString()}</b>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Remaining balance: <b>${walletBalance.toFixed(2)}</b>
          </p>

          {canJoin ? (
            <button
              onClick={() => navigate(`/waiting-room/${booked}`)}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-lg transition mb-3 flex items-center justify-center space-x-2"
            >
              <Video className="w-5 h-5" />
              <span>Enter Waiting Room</span>
            </button>
          ) : (
            <div className="w-full py-4 bg-gray-100 rounded-xl text-gray-500 font-semibold mb-3">
              <Clock className="w-4 h-4 inline mr-2" />
              Join available in {timeUntil} min
            </div>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition text-sm"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  const price = getPrice();
  const canAfford = walletBalance >= price;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Book Video Call</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Wallet Balance */}
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

        {/* Creator card */}
        {creator && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 overflow-hidden flex items-center justify-center">
              {creator.profilePicture
                ? <img src={creator.profilePicture} alt="" className="w-full h-full object-cover" />
                : <User className="w-8 h-8 text-rose-400" />}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{creator.displayName}</h2>
              <p className="text-gray-500 text-sm">@{creator.username}</p>
              <div className="flex items-center space-x-1 mt-1">
                <Video className="w-4 h-4 text-rose-500" />
                <span className="text-sm text-rose-600 font-semibold">
                  ${creator.videoCallPrice || MINIMUM_VIDEO_PRICE} / 30 min
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Duration */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Call Duration</label>
          <div className="grid grid-cols-3 gap-3">
            {durations.map(({ mins, label }) => (
              <button
                key={mins}
                onClick={() => setSelectedDuration(mins)}
                className={`py-3 rounded-xl font-semibold transition border-2 ${
                  selectedDuration === mins
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Schedule</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Note (Optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What would you like to talk about?"
            rows={3}
            maxLength={200}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            {error.includes('Insufficient') && (
              <button onClick={() => navigate('/wallet')} className="text-xs font-semibold text-rose-600 underline whitespace-nowrap">
                Add Funds
              </button>
            )}
          </div>
        )}

        {/* Price summary */}
        <div className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Deducted from wallet</p>
              <p className="text-3xl font-bold mt-1">${price.toFixed(2)}</p>
              <p className="text-xs opacity-70 mt-1">{selectedDuration} min video call</p>
            </div>
            <Video className="w-12 h-12 opacity-30" />
          </div>
        </div>

        <button
          onClick={handleBook}
          disabled={booking || !canAfford}
          className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${
            canAfford ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {booking
            ? <span className="flex items-center justify-center space-x-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Booking...</span></span>
            : canAfford ? `Book Now — $${price.toFixed(2)}` : `Need $${(price - walletBalance).toFixed(2)} more`}
        </button>
      </div>
    </div>
  );
}