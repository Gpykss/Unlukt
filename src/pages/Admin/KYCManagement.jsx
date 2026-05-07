// src/pages/Admin/KYCManagement.jsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Check, 
  X, 
  Loader2, 
  Eye,
  User,
  MapPin,
  Phone,
  CreditCard,
  Calendar,
  Mail,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function KYCManagement() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('kycStatus', '==', 'pending'));
      const snapshot = await getDocs(q);
      
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setApplications(apps);
    } catch (error) {
      console.error('Error loading applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    if (!window.confirm('Are you sure you want to approve this application?')) {
      return;
    }

    try {
      setActionLoading(true);
      const userRef = doc(db, 'users', userId);
      
      await updateDoc(userRef, {
        kycStatus: 'approved',
        isCreator: true,
        kycApprovedAt: new Date(),
        updatedAt: new Date()
      });
      
      // Remove from list
      setApplications(apps => apps.filter(app => app.id !== userId));
      setSelectedApp(null);
      
      alert('Application approved successfully!');
    } catch (error) {
      console.error('Error approving:', error);
      alert('Failed to approve application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setActionLoading(true);
      const userRef = doc(db, 'users', selectedApp.id);
      
      await updateDoc(userRef, {
        kycStatus: 'rejected',
        kycRejectionReason: rejectionReason,
        kycRejectedAt: new Date(),
        updatedAt: new Date()
      });
      
      // Remove from list
      setApplications(apps => apps.filter(app => app.id !== selectedApp.id));
      setSelectedApp(null);
      setShowRejectModal(false);
      setRejectionReason('');
      
      alert('Application rejected');
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Failed to reject application');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/admin')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4 transition">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <Shield className="w-8 h-8 text-rose-500" />
            <span>KYC Management</span>
          </h1>
          <p className="text-gray-600 mt-2">
            Review and approve creator applications
          </p>
        </div>

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Pending Applications</h3>
            <p className="text-gray-600">
              All creator applications have been reviewed
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {applications.map((app) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition"
              >
                {/* User Info */}
                <div className="flex items-center space-x-4 mb-4 pb-4 border-b border-gray-200">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-xl overflow-hidden">
                    {app.avatar || app.profilePicture ? (
                      <img src={app.avatar || app.profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{app.displayName?.charAt(0).toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">{app.displayName}</h3>
                    <p className="text-sm text-gray-500">@{app.username}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted: {formatDate(app.kycSubmittedAt)}
                    </p>
                  </div>
                </div>

                {/* KYC Data */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center space-x-3 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{app.kycData?.fullName || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{app.kycData?.dateOfBirth || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{app.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{app.kycData?.phoneNumber || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">
                      {app.kycData?.city ? `${app.kycData.city}, ${app.kycData.country}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">
                      {app.kycData?.idType ? `${app.kycData.idType.replace('_', ' ').toUpperCase()} - ${app.kycData.idNumber}` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setSelectedApp(app)}
                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition flex items-center justify-center space-x-2"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Details</span>
                  </button>
                  <button
                    onClick={() => handleApprove(app.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedApp(app);
                      setShowRejectModal(true);
                    }}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedApp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowRejectModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">Reject Application</h3>
              <p className="text-gray-600 mb-4">
                Please provide a reason for rejecting {selectedApp.displayName}'s application.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., ID document is unclear, age requirement not met, etc."
                rows="4"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 resize-none mb-4"
              />
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading || !rejectionReason.trim()}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <span>Reject Application</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Details Modal */}
        {selectedApp && !showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setSelectedApp(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Application Details</h3>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Personal Info */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Personal Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Full Name</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.fullName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Date of Birth</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.dateOfBirth || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium text-gray-900">{selectedApp.email || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.phoneNumber || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Address</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Street Address</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.address || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">City</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.city || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">State</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.state || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ZIP Code</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.zipCode || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Country</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.country || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* ID Images */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-1">ID Verification</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">ID Type</p>
                      <p className="font-medium text-gray-900">
                        {selectedApp.kycData?.idType?.replace('_', ' ').toUpperCase() || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ID Number</p>
                      <p className="font-medium text-gray-900">{selectedApp.kycData?.idNumber || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Uploaded images */}
                  <p className="text-sm font-semibold text-gray-700 mb-3">📎 Uploaded Documents</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'ID Front',        url: selectedApp.kycData?.idFrontUrl },
                      { label: 'ID Back',         url: selectedApp.kycData?.idBackUrl  },
                      { label: 'Selfie with ID',  url: selectedApp.kycData?.selfieUrl  },
                    ].map(({ label, url }) => (
                      <div key={label} className="flex flex-col items-center">
                        <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="block w-full rounded-xl overflow-hidden border-2 border-gray-200 hover:border-rose-400 transition group relative"
                            style={{ aspectRatio: '4/3' }}
                          >
                            <img src={url} alt={label} className="w-full h-full object-cover group-hover:opacity-90 transition" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition">
                              <ExternalLink className="w-6 h-6 text-white" />
                            </div>
                          </a>
                        ) : (
                          <div className="w-full rounded-xl border-2 border-dashed border-red-300 bg-red-50 flex items-center justify-center text-red-400 text-xs font-semibold"
                            style={{ aspectRatio: '4/3' }}>
                            Not uploaded
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {(!selectedApp.kycData?.idFrontUrl || !selectedApp.kycData?.idBackUrl || !selectedApp.kycData?.selfieUrl) && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                      ⚠️ Some images are missing — this applicant submitted before the image upload requirement was added.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-3 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => handleApprove(selectedApp.id)}
                    disabled={actionLoading}
                    className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    <span>Approve Application</span>
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                    <span>Reject Application</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}