// src/pages/Communities/CreateCommunity.jsx - With one-time price option

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Image as ImageIcon, Loader2, Lock, Globe,
  DollarSign, FileText, Tag, CheckCircle, X, Plus, Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { createCommunity } from '../../services/communityService';
import { uploadToBunny } from '../../services/bunnyUpload.service';

const CATEGORIES = ['Fitness','Gaming','Art','Music','Fashion','Cooking','Tech','Lifestyle','Business','Education','Photography','Writing'];

export default function CreateCommunity() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general',
    price: 9.99,
    oneTimePrice: '',
    isPrivate: true,
    rules: ['Be respectful', 'No spam', 'Stay on topic'],
    membersCanPost: false,
  });

  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleCoverImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Image must be less than 10MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Please upload an image file'); return; }

    try {
      setUploading(true);
      setError('');
      const reader = new FileReader();
      reader.onloadend = () => setCoverImagePreview(reader.result);
      reader.readAsDataURL(file);

      const result = await uploadToBunny(file, { folder: 'community-covers', contentType: 'media' });
      setCoverImageUrl(result.cdnUrl);
    } catch (err) {
      setError('Failed to upload cover image');
    } finally {
      setUploading(false);
    }
  };

  const addRule = () => setFormData(p => ({ ...p, rules: [...p.rules, ''] }));
  const updateRule = (i, v) => setFormData(p => { const r = [...p.rules]; r[i] = v; return { ...p, rules: r }; });
  const removeRule = (i) => setFormData(p => ({ ...p, rules: p.rules.filter((_, j) => j !== i) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) { setError('Community name is required'); return; }
    if (formData.name.length < 3) { setError('Name must be at least 3 characters'); return; }
    if (!formData.description.trim()) { setError('Description is required'); return; }
    if (formData.price < 1) { setError('Price must be at least $1'); return; }

    try {
      setCreating(true);
      const newCommunity = await createCommunity(currentUser.uid, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        oneTimePrice: formData.oneTimePrice ? parseFloat(formData.oneTimePrice) : null,
        isPrivate: formData.isPrivate,
        coverImage: coverImageUrl,
        rules: formData.rules.filter(r => r.trim()),
        membersCanPost: formData.membersCanPost,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/community/${newCommunity.id}`), 1500);
    } catch (err) {
      setError('Failed to create community. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center space-x-4">
          <button onClick={() => navigate('/communities')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Community</h1>
            <p className="text-sm text-gray-600">Build your exclusive channel</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {success && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-5 bg-green-50 border border-green-200 rounded-2xl flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <p className="font-semibold text-green-900">Community created! Redirecting...</p>
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Cover Image */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="relative h-56 bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 group cursor-pointer">
              {coverImagePreview
                ? <img src={coverImagePreview} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-6xl">👥</div>}
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition cursor-pointer">
                <input type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" disabled={uploading} />
                {uploading
                  ? <Loader2 className="w-12 h-12 text-white animate-spin" />
                  : <div className="text-white text-center"><ImageIcon className="w-12 h-12 mx-auto mb-2" /><p className="font-medium">Upload Cover</p><p className="text-sm opacity-75">Max 10MB</p></div>}
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Basic Info</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Channel Name *</label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Fitness Elite Club" maxLength={50}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" required />
              <p className="text-xs text-gray-400 mt-1">{formData.name.length}/50</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
              <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                placeholder="What is your community about?" rows={4} maxLength={300}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm" required />
              <p className="text-xs text-gray-400 mt-1">{formData.description.length}/300</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm bg-white">
                <option value="general">General</option>
                {CATEGORIES.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Price (USD) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input type="number" value={formData.price} min="1" max="9999" step="0.01"
                    onChange={e => setFormData(p => ({ ...p, price: e.target.value }))}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" required />
                </div>
                <p className="text-xs text-gray-400 mt-1">Charged every 30 days</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">One-Time (Lifetime) Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input type="number" value={formData.oneTimePrice} min="1" max="9999" step="0.01"
                    placeholder={`e.g. ${(parseFloat(formData.price || 9.99) * 3).toFixed(2)}`}
                    onChange={e => setFormData(p => ({ ...p, oneTimePrice: e.target.value }))}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave blank = 3× monthly auto</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start space-x-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">Members can choose between monthly or one-time lifetime access at checkout. You earn 80% of each payment.</p>
            </div>
          </div>

          {/* Privacy & Channel Type */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Privacy & Posting</h2>

            <div className="space-y-2">
              {[
                { value: true, label: 'Private Channel', desc: 'Only members see content', icon: Lock },
                { value: false, label: 'Public Channel', desc: 'Anyone can see posts', icon: Globe },
              ].map(({ value, label, desc, icon: Icon }) => (
                <label key={label} onClick={() => setFormData(p => ({ ...p, isPrivate: value }))}
                  className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition ${formData.isPrivate === value ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 mr-3 flex-shrink-0 ${formData.isPrivate === value ? 'border-rose-500 bg-rose-500' : 'border-gray-300'}`} />
                  <Icon className="w-5 h-5 text-gray-500 mr-3" />
                  <div><p className="font-medium text-gray-900 text-sm">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                </label>
              ))}
            </div>

            <div className="flex items-start justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">Members can post</p>
                <p className="text-xs text-gray-500 mt-0.5">Disable for broadcast-only (Telegram channel style)</p>
              </div>
              <button type="button" onClick={() => setFormData(p => ({ ...p, membersCanPost: !p.membersCanPost }))}
                className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative ml-4 ${formData.membersCanPost ? 'bg-rose-500' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.membersCanPost ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Rules */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Community Rules</h2>
              <button type="button" onClick={addRule} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition flex items-center space-x-1">
                <Plus className="w-4 h-4" /><span>Add</span>
              </button>
            </div>
            <div className="space-y-3">
              {formData.rules.map((rule, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <span className="text-gray-400 font-medium text-sm w-5">{i + 1}.</span>
                  <input type="text" value={rule} onChange={e => updateRule(i, e.target.value)} placeholder="Enter a rule..."
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
                  {formData.rules.length > 1 && (
                    <button type="button" onClick={() => removeRule(i)} className="p-2 hover:bg-red-50 rounded-lg transition">
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end space-x-4">
            <button type="button" onClick={() => navigate('/communities')} disabled={creating}
              className="px-6 py-3 text-gray-700 hover:text-gray-900 font-semibold transition">Cancel</button>
            <button type="submit" disabled={creating || uploading}
              className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition disabled:opacity-50 flex items-center space-x-2">
              {creating ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Creating...</span></> : <span>Create Community</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}