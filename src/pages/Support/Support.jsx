// src/pages/Support/Support.jsx

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

export default function Support() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      alert('Please enter subject and message');
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, 'support_tickets'), {
        userId: currentUser?.uid || null,
        email: currentUser?.email || null,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Support ticket sent. We will reply soon.');
      setSubject('');
      setMessage('');
      navigate('/wallet');
    } catch (err) {
      console.error('Support ticket error:', err);
      alert('Failed to send. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Support</h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200 p-6"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-1">Contact Support</h2>
          <p className="text-sm text-gray-600 mb-6">
            Use this if your currency is not supported or you need special payment help.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500"
                placeholder="Payments / Wallet / Subscriptions..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 min-h-[140px] focus:outline-none focus:border-rose-500"
                placeholder="Describe your issue..."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span>{loading ? 'Sending...' : 'Send Ticket'}</span>
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
