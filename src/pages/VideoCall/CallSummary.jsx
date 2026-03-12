// src/pages/VideoCall/CallSummary.jsx
// Route: /call-summary/:bookingId

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Star, Video, Phone, Clock, Loader2 } from 'lucide-react';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

export default function CallSummary() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [booking, setBooking] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, [bookingId]);

  const load = async () => {
    try {
      const snap = await getDoc(doc(db, 'call_bookings', bookingId));
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setBooking(data);

      const isUser = data.userId === currentUser?.uid;
      const otherUid = isUser ? data.creatorId : data.userId;
      const otherSnap = await getDoc(doc(db, 'users', otherUid));
      if (otherSnap.exists()) setOtherUser({ id: otherSnap.id, ...otherSnap.data() });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      // Save rating
      await addDoc(collection(db, 'call_ratings'), {
        bookingId,
        fromUserId: currentUser.uid,
        toUserId: otherUser?.id,
        rating,
        createdAt: serverTimestamp(),
      });
      // Update booking
      await updateDoc(doc(db, 'call_bookings', bookingId), {
        [`ratings.${currentUser.uid}`]: rating,
        updatedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
    </div>
  );

  const isVideo = booking?.type === 'video';
  const duration = booking?.duration || 30;
  const price = booking?.price || 0;
  const scheduled = booking?.scheduledAt?.toDate?.() || new Date(booking?.scheduledAt);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-md w-full"
      >
        {/* Success icon */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle className="w-10 h-10 text-green-500" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900">Call Completed</h2>
          <p className="text-gray-500 mt-1">
            Your {isVideo ? 'video' : 'voice'} call with{' '}
            <span className="font-semibold text-gray-800">
              {otherUser?.displayName || 'your caller'}
            </span>{' '}
            has ended.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            {isVideo
              ? <Video className="w-5 h-5 text-rose-500 mx-auto mb-1" />
              : <Phone className="w-5 h-5 text-purple-500 mx-auto mb-1" />}
            <p className="text-xs text-gray-500">Type</p>
            <p className="text-sm font-bold text-gray-800 capitalize">{booking?.type}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            <Clock className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">Duration</p>
            <p className="text-sm font-bold text-gray-800">{duration} min</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            <span className="text-lg font-bold text-green-600 block">$</span>
            <p className="text-xs text-gray-500">Paid</p>
            <p className="text-sm font-bold text-gray-800">${price.toFixed(2)}</p>
          </div>
        </div>

        {/* Rating */}
        {!submitted ? (
          <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              How was your call?
            </p>
            <div className="flex items-center justify-center space-x-2 mb-4">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmitRating}
              disabled={!rating || submitting}
              className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-semibold transition text-sm"
            >
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        ) : (
          <div className="bg-green-50 rounded-xl p-4 mb-6 border border-green-100 text-center">
            <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-sm text-green-700 font-semibold">Thanks for your rating!</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => navigate(`/creator/${otherUser?.username || otherUser?.id}`)}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-semibold transition text-sm"
          >
            View Profile
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition"
          >
            Back to Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}