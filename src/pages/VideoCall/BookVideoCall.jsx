// src/pages/VideoCall/BookVideoCall.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Video, Clock, DollarSign, Calendar, CheckCircle, Loader2, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import PaymentModal from '../../components/Payment/PaymentModal';

export default function BookVideoCall() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [note, setNote] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [booking, setBooking] = useState(null);

  const durations = [
  { mins: 30, label: '30 min' },
  { mins: 60, label: '1 hour' },
  { mins: 90, label: '1.5 hours' },
];

  useEffect(() => {
    loadCreator();
  }, [creatorId]);

  const loadCreator = async () => {
    try {
      // Try by username first
      const userDoc = await getDoc(doc(db, 'users', creatorId));
      if (userDoc.exists()) {
        setCreator({ id: userDoc.id, ...userDoc.data() });
      }
    } catch (err) {
      console.error('Error loading creator:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = () => {
  const basePrice = Math.max(12, creator?.videoCallPrice || 12);
  return ((basePrice * selectedDuration) / 30).toFixed(2);

};
  const handleBook = async () => {
    if (!scheduledDate || !scheduledTime) {
      alert('Please select a date and time');
      return;
    }
    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
      const bookingRef = await addDoc(collection(db, 'call_bookings'), {
        type: 'video',
        creatorId: creator.id,
        userId: currentUser.uid,
        duration: selectedDuration,
        price: parseFloat(getPrice()),
        scheduledAt,
        note,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setBooking(bookingRef.id);
      setShowPayment(false);
    } catch (err) {
      console.error('Error creating booking:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl border border-gray-100"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-6">Your video call has been booked. You'll receive a notification when the creator confirms.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Book Video Call</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Creator Card */}
        {creator && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 overflow-hidden flex items-center justify-center">
              {creator.profilePicture ? (
                <img src={creator.profilePicture} alt={creator.displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-rose-400" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{creator.displayName}</h2>
              <p className="text-gray-500 text-sm">@{creator.username}</p>
              <div className="flex items-center space-x-1 mt-1">
                <Video className="w-4 h-4 text-rose-500" />
                <span className="text-sm text-rose-600 font-semibold">${creator.videoCallPrice} / 30 min</span>
              </div>
            </div>
          </div>
        )}

        {/* Duration */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center space-x-2">
            <Clock className="w-4 h-4" />
            <span>Call Duration</span>
          </label>
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
          <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center space-x-2">
            <Calendar className="w-4 h-4" />
            <span>Schedule</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Note to Creator (Optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What would you like to talk about?"
            rows={3}
            maxLength={200}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm"
          />
        </div>

        {/* Price Summary */}
        <div className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Price</p>
              <p className="text-3xl font-bold mt-1">${getPrice()}</p>
              <p className="text-xs opacity-70 mt-1">{selectedDuration} min video call</p>
            </div>
            <DollarSign className="w-12 h-12 opacity-30" />
          </div>
        </div>

        {/* Book Button */}
        <button
          onClick={handleBook}
          className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-lg transition shadow-lg"
        >
          Book Now — ${getPrice()}
        </button>
      </div>

      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        amountUSD={parseFloat(getPrice())}
        contentType="video_call"
        contentId={`video_${creatorId}_${Date.now()}`}
        creatorId={creator?.id}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}