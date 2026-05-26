// src/pages/Admin/AdAssetManagement.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Upload, 
  FileVideo, 
  FileImage, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FolderPlus 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function AdAssetManagement() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  
  // Form State
  const [selectedUsername, setSelectedUsername] = useState('');
  const [video1, setVideo1] = useState(null);
  const [video2, setVideo2] = useState(null);
  const [image1, setImage1] = useState(null);
  const [image2, setImage2] = useState(null);
  const [image3, setImage3] = useState(null);
  
  // Status State
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info'); // 'info' | 'success' | 'error'
  const [processedAssets, setProcessedAssets] = useState(null);

  useEffect(() => {
    fetchCreators();
  }, []);

  const fetchCreators = async () => {
    try {
      setLoadingCreators(true);
      const q = query(collection(db, 'users'), where('isCreator', '==', true));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          username: data.username || 'user',
          name: data.displayName || data.name || 'User'
        });
      });
      setCreators(list);
      if (list.length > 0) {
        setSelectedUsername(list[0].username);
      }
    } catch (err) {
      console.error('Error fetching creators:', err);
    } finally {
      setLoadingCreators(false);
    }
  };

  const handleFileChange = (e, setter) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUsername) {
      setStatusType('error');
      setStatusMessage('Please select a creator.');
      return;
    }
    if (!video1 || !video2 || !image1 || !image2 || !image3) {
      setStatusType('error');
      setStatusMessage('Please select all 5 raw assets (2 videos, 3 images).');
      return;
    }

    setSubmitting(true);
    setStatusType('info');
    setStatusMessage('Uploading raw assets and initializing compression pipelines...');
    setProcessedAssets(null);

    const formData = new FormData();
    formData.append('username', selectedUsername.replace('@', '').trim().toLowerCase());
    formData.append('video1', video1);
    formData.append('video2', video2);
    formData.append('image1', image1);
    formData.append('image2', image2);
    formData.append('image3', image3);

    try {
      const response = await fetch('/api/admin/upload-ad-assets', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Server processing error.');
      }

      setStatusType('success');
      setStatusMessage('Automated asset pipelines completed successfully! Assets compressed & stored.');
      setProcessedAssets(result.files);
    } catch (err) {
      console.error('Pipeline error:', err);
      setStatusType('error');
      setStatusMessage(err.message || 'Asset processing failed. Ensure Vite Dev Server is running.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate('/admin')} 
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold text-sm">Back to Admin</span>
          </button>
          
          <div className="flex items-center space-x-2 px-3 py-1 bg-pink-100 rounded-full text-pink-700 text-xs font-bold uppercase tracking-wider">
            <span>Automated pipeline</span>
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 md:p-8 shadow-xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ingest Ad Assets</h1>
              <p className="text-gray-500 text-sm">Upload raw assets to automatically establish creator vault</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Creator Selection */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Target Creator Account
              </label>
              {loadingCreators ? (
                <div className="flex items-center space-x-2 py-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading creators...</span>
                </div>
              ) : (
                <select
                  value={selectedUsername}
                  onChange={(e) => setSelectedUsername(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 hover:border-pink-300 rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition text-sm text-gray-900"
                >
                  {creators.map(c => (
                    <option key={c.id} value={c.username} className="text-gray-900">
                      {c.name} (@{c.username})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Video Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Video Clip 1 */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:border-pink-300 transition">
                <FileVideo className="w-8 h-8 text-pink-500 mb-2" />
                <span className="text-xs font-bold text-gray-700 mb-1">Video Clip 1 (MP4, 3-5s)</span>
                <span className="text-[10px] text-gray-400 mb-3">Converts to WebP loop &lt;150KB</span>
                <input 
                  type="file" 
                  accept="video/mp4" 
                  onChange={(e) => handleFileChange(e, setVideo1)}
                  className="hidden" 
                  id="video1-file"
                />
                <label 
                  htmlFor="video1-file"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer transition"
                >
                  {video1 ? video1.name : 'Select Raw MP4'}
                </label>
              </div>

              {/* Video Clip 2 */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:border-pink-300 transition">
                <FileVideo className="w-8 h-8 text-pink-500 mb-2" />
                <span className="text-xs font-bold text-gray-700 mb-1">Video Clip 2 (MP4, 3-5s)</span>
                <span className="text-[10px] text-gray-400 mb-3">Converts to WebP loop &lt;150KB</span>
                <input 
                  type="file" 
                  accept="video/mp4" 
                  onChange={(e) => handleFileChange(e, setVideo2)}
                  className="hidden" 
                  id="video2-file"
                />
                <label 
                  htmlFor="video2-file"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer transition"
                >
                  {video2 ? video2.name : 'Select Raw MP4'}
                </label>
              </div>
            </div>

            {/* Image Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Image 1 */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:border-pink-300 transition">
                <FileImage className="w-8 h-8 text-pink-500 mb-2" />
                <span className="text-xs font-bold text-gray-700 mb-1">Raw Image 1</span>
                <span className="text-[10px] text-gray-400 mb-3">WebP &lt;50KB</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleFileChange(e, setImage1)}
                  className="hidden" 
                  id="image1-file"
                />
                <label 
                  htmlFor="image1-file"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer transition"
                >
                  {image1 ? image1.name : 'Select Image'}
                </label>
              </div>

              {/* Image 2 */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:border-pink-300 transition">
                <FileImage className="w-8 h-8 text-pink-500 mb-2" />
                <span className="text-xs font-bold text-gray-700 mb-1">Raw Image 2</span>
                <span className="text-[10px] text-gray-400 mb-3">WebP &lt;50KB</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleFileChange(e, setImage2)}
                  className="hidden" 
                  id="image2-file"
                />
                <label 
                  htmlFor="image2-file"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer transition"
                >
                  {image2 ? image2.name : 'Select Image'}
                </label>
              </div>

              {/* Image 3 */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:border-pink-300 transition">
                <FileImage className="w-8 h-8 text-pink-500 mb-2" />
                <span className="text-xs font-bold text-gray-700 mb-1">Raw Image 3</span>
                <span className="text-[10px] text-gray-400 mb-3">WebP &lt;50KB</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleFileChange(e, setImage3)}
                  className="hidden" 
                  id="image3-file"
                />
                <label 
                  htmlFor="image3-file"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer transition"
                >
                  {image3 ? image3.name : 'Select Image'}
                </label>
              </div>
            </div>

            {/* Submission Status */}
            {statusMessage && (
              <div className={`p-4 rounded-xl border flex items-start space-x-3 text-sm ${
                statusType === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : statusType === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {statusType === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                {statusType === 'error' && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                {statusType === 'info' && <Loader2 className="w-5 h-5 text-blue-600 flex-shrink-0 animate-spin mt-0.5" />}
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Processed Sizes Table */}
            {processedAssets && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Processed Assets Summary</h3>
                <div className="divide-y divide-gray-200">
                  {processedAssets.map(file => (
                    <div key={file.name} className="flex justify-between py-2 text-xs">
                      <span className="font-mono text-gray-600">{file.name}</span>
                      <span className={`font-semibold ${
                        file.sizeBytes < file.limitBytes ? 'text-green-600' : 'text-rose-600'
                      }`}>
                        {(file.sizeBytes / 1024).toFixed(1)} KB (Limit: {file.limitKb}KB)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold py-3.5 px-6 rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing Assets...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Start Automated Asset Ingestion</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
