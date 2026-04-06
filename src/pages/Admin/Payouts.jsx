// src/pages/Admin/Payouts.jsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle, XCircle, Clock, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getUserProfile } from '../../services/firestoreService';

export default function Payouts() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'payout_requests'), orderBy('createdAt', 'desc')));
      
      const enriched = await Promise.all(
        snap.docs.map(async (d) => {
          const data = { id: d.id, ...d.data() };
          const creator = await getUserProfile(data.creatorId).catch(() => null);
          return { ...data, creator };
        })
      );
      
      setRequests(enriched);
    } catch (error) {
      console.error('Error loading payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    if (!window.confirm(`Mark this payout request as ${newStatus}?`)) return;
    try {
      setProcessingId(id);
      await updateDoc(doc(db, 'payout_requests', id), {
        status: newStatus,
        processedAt: new Date()
      });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button onClick={() => navigate('/admin')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4 transition">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
                <CreditCard className="w-8 h-8 text-rose-500" />
                <span>Payout Requests</span>
              </h1>
              <p className="text-gray-600 mt-2">Manage creator withdrawal requests</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-2 text-center">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-rose-600">{pendingCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center flex-col items-center py-20 text-gray-400">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-4" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-20">
              <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No payout requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Creator</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Request Details</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Wallet Address</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex flex-shrink-0 items-center justify-center overflow-hidden text-sm">
                            {request.creator?.profilePicture ? (
                              <img src={request.creator.profilePicture} alt="" className="w-full h-full object-cover" />
                            ) : request.creator?.displayName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{request.creator?.displayName || 'Unknown'}</p>
                            <p className="text-sm text-gray-500">@{request.creator?.username || 'user'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-gray-900">${request.amount?.toFixed(2)}</p>
                          <p className="text-xs text-gray-500">Method: {request.method}</p>
                          <p className="text-xs text-gray-400 mt-1">Fee: ${request.fee?.toFixed(2)} | Net: ${request.netAmount?.toFixed(2)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-[200px] truncate text-xs font-mono bg-gray-100 px-2 py-1 rounded" title={request.walletAddress}>
                          {request.walletAddress}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {request.status === 'pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3" />Pending</span>}
                        {request.status === 'completed' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" />Paid</span>}
                        {request.status === 'rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3" />Rejected</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {request.status === 'pending' ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleUpdateStatus(request.id, 'completed')}
                              disabled={processingId === request.id}
                              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                            >
                              {processingId === request.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Complete
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(request.id, 'rejected')}
                              disabled={processingId === request.id}
                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
