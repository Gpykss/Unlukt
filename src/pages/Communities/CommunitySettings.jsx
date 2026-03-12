// src/pages/Communities/CommunitySettings.jsx - Telegram-style channel settings

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Camera, Loader2, Save, Trash2, Users, Lock, Globe,
  DollarSign, Bell, Shield, Link, Copy, CheckCircle, AlertTriangle,
  X, Plus, Eye, EyeOff, ToggleLeft, ToggleRight, ChevronRight,
  MessageSquare, Image as ImageIcon, FileText, Tag
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getCommunity, updateCommunity, deleteCommunity, getCommunityMembers } from '../../services/communityService';
import { uploadToBunny } from '../../services/bunnyUpload.service';

export default function CommunitySettings() {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const [saved, setSaved] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'general',
    price: 9.99,
    oneTimePrice: '',
    isPrivate: true,
    rules: [],
    coverImage: null,
    // Channel settings
    membersCanPost: false,    // false = only owner (Telegram channel style)
    approvalRequired: false,
    showMemberCount: true,
    allowLinks: true,
    welcomeMessage: '',
  });

  const CATEGORIES = ['general', 'fitness', 'gaming', 'art', 'music', 'fashion', 'cooking', 'tech', 'lifestyle', 'business', 'education', 'photography'];

  const SECTIONS = [
    { id: 'general', label: 'General', icon: FileText },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'rules', label: 'Rules', icon: MessageSquare },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ];

  useEffect(() => { loadData(); }, [communityId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [communityData, membersData] = await Promise.all([
        getCommunity(communityId),
        getCommunityMembers(communityId)
      ]);

      if (!communityData || communityData.creatorId !== currentUser?.uid) {
        navigate('/communities');
        return;
      }

      setCommunity(communityData);
      setMembers(membersData);
      setForm({
        name: communityData.name || '',
        description: communityData.description || '',
        category: communityData.category || 'general',
        price: communityData.price || 9.99,
        oneTimePrice: communityData.oneTimePrice || '',
        isPrivate: communityData.isPrivate !== false,
        rules: communityData.rules || [],
        coverImage: communityData.coverImage || null,
        membersCanPost: communityData.membersCanPost || false,
        approvalRequired: communityData.approvalRequired || false,
        showMemberCount: communityData.showMemberCount !== false,
        allowLinks: communityData.allowLinks !== false,
        welcomeMessage: communityData.welcomeMessage || '',
      });
    } catch (e) {
      console.error(e);
      navigate('/communities');
    } finally {
      setLoading(false);
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploadingCover(true);
      const result = await uploadToBunny(file, { folder: 'community-covers', contentType: 'media' });
      setForm(prev => ({ ...prev, coverImage: result.cdnUrl }));
    } catch (err) {
      alert('Failed to upload cover image');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    try {
      setSaving(true);
      await updateCommunity(communityId, {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        price: parseFloat(form.price) || 9.99,
        oneTimePrice: form.oneTimePrice ? parseFloat(form.oneTimePrice) : null,
        isPrivate: form.isPrivate,
        rules: form.rules.filter(r => r.trim()),
        coverImage: form.coverImage,
        membersCanPost: form.membersCanPost,
        approvalRequired: form.approvalRequired,
        showMemberCount: form.showMemberCount,
        allowLinks: form.allowLinks,
        welcomeMessage: form.welcomeMessage,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== community.name) { alert('Please type the community name exactly'); return; }
    try {
      setDeleting(true);
      await deleteCommunity(communityId);
      navigate('/communities');
    } catch (e) {
      alert('Failed to delete community');
    } finally {
      setDeleting(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/community/${communityId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addRule = () => setForm(prev => ({ ...prev, rules: [...prev.rules, ''] }));
  const updateRule = (i, v) => setForm(prev => { const r = [...prev.rules]; r[i] = v; return { ...prev, rules: r }; });
  const removeRule = (i) => setForm(prev => ({ ...prev, rules: prev.rules.filter((_, j) => j !== i) }));

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate(`/community/${communityId}`)} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Channel Settings</h1>
              <p className="text-xs text-gray-500">{community?.name}</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center space-x-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saved ? 'Saved!' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar nav */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveSection(id)}
                className={`w-full flex items-center space-x-3 px-4 py-3.5 text-left transition border-b border-gray-50 last:border-0 ${
                  activeSection === id ? 'bg-rose-50 text-rose-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                } ${id === 'danger' ? '!text-red-500' : ''}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{label}</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-40" />
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-5">

          {/* GENERAL */}
          {activeSection === 'general' && (
            <div className="space-y-5">
              {/* Cover Image */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="relative h-44 bg-gradient-to-br from-rose-100 to-pink-200 group cursor-pointer">
                  {form.coverImage
                    ? <img src={form.coverImage} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl">👥</div>}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
                    {uploadingCover
                      ? <Loader2 className="w-10 h-10 text-white animate-spin" />
                      : <div className="text-white text-center"><Camera className="w-10 h-10 mx-auto mb-1" /><p className="text-sm font-medium">Change Cover</p></div>}
                  </label>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-900">Channel Info</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Channel Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" maxLength={50} />
                  <p className="text-xs text-gray-400 mt-1">{form.name.length}/50</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    rows={3} maxLength={300}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm" />
                  <p className="text-xs text-gray-400 mt-1">{form.description.length}/300</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm bg-white capitalize">
                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label>
                  <textarea value={form.welcomeMessage} onChange={e => setForm(p => ({ ...p, welcomeMessage: e.target.value }))}
                    rows={2} maxLength={200} placeholder="Sent to new members when they join..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm" />
                </div>
              </div>

              {/* Invite link */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Invite Link</h2>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 truncate">
                    {window.location.origin}/community/{communityId}
                  </div>
                  <button onClick={copyInviteLink} className={`px-4 py-3 rounded-xl font-medium text-sm transition flex items-center space-x-1 ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Privacy */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Privacy</h2>
                <div className="space-y-2">
                  {[
                    { value: true, label: 'Private', desc: 'Only members can see content', icon: Lock },
                    { value: false, label: 'Public', desc: 'Anyone can see posts', icon: Globe },
                  ].map(({ value, label, desc, icon: Icon }) => (
                    <label key={label} onClick={() => setForm(p => ({ ...p, isPrivate: value }))}
                      className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition ${form.isPrivate === value ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 mr-3 flex-shrink-0 ${form.isPrivate === value ? 'border-rose-500 bg-rose-500' : 'border-gray-300'}`} />
                      <Icon className="w-5 h-5 text-gray-500 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{label}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PRICING */}
          {activeSection === 'pricing' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
              <h2 className="font-semibold text-gray-900">Pricing Plans</h2>
              <p className="text-sm text-gray-500">Set prices for both monthly subscriptions and one-time lifetime access.</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Price (USD) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input type="number" value={form.price} min="1" max="9999" step="0.01"
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Charged every 30 days</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">One-Time (Lifetime) Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input type="number" value={form.oneTimePrice} min="1" max="9999" step="0.01"
                    placeholder={`e.g. ${((parseFloat(form.price) || 9.99) * 3).toFixed(2)}`}
                    onChange={e => setForm(p => ({ ...p, oneTimePrice: e.target.value }))}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave blank to auto-set to 3× monthly price. Members pay once, access forever.</p>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Member will see:</p>
                <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-700">Monthly</span>
                  <span className="font-bold text-rose-600">${parseFloat(form.price || 9.99).toFixed(2)}/mo</span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-700">One-time lifetime</span>
                  <span className="font-bold text-rose-600">${(parseFloat(form.oneTimePrice) || (parseFloat(form.price || 9.99) * 3)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* PERMISSIONS */}
          {activeSection === 'permissions' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-1">
              <h2 className="font-semibold text-gray-900 mb-4">Channel Permissions</h2>

              {[
                {
                  key: 'membersCanPost',
                  label: 'Members can post',
                  desc: 'Allow members to create posts. Disable for broadcast-only (Telegram channel style).',
                  danger: false,
                },
                {
                  key: 'approvalRequired',
                  label: 'Approve member posts',
                  desc: 'Posts from members require your approval before being visible.',
                  danger: false,
                },
                {
                  key: 'showMemberCount',
                  label: 'Show member count',
                  desc: 'Display the number of members publicly on the channel.',
                  danger: false,
                },
                {
                  key: 'allowLinks',
                  label: 'Allow links in posts',
                  desc: 'Members can include links in their posts.',
                  danger: false,
                },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-start justify-between py-4 border-b border-gray-50 last:border-0">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <button onClick={() => setForm(p => ({ ...p, [key]: !p[key] }))}
                    className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative ${form[key] ? 'bg-rose-500' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form[key] ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* RULES */}
          {activeSection === 'rules' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Community Rules</h2>
                <button onClick={addRule} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition flex items-center space-x-1">
                  <Plus className="w-4 h-4" /><span>Add Rule</span>
                </button>
              </div>

              {form.rules.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No rules yet. Add some guidelines for your community.</p>
              )}

              <div className="space-y-3">
                {form.rules.map((rule, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <span className="text-sm font-semibold text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
                    <input type="text" value={rule} onChange={e => updateRule(i, e.target.value)}
                      placeholder="Enter rule..."
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 text-sm" />
                    <button onClick={() => removeRule(i)} className="p-2 hover:bg-red-50 rounded-lg transition">
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MEMBERS */}
          {activeSection === 'members' && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{members.length} Members</h2>
              </div>
              {members.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No members yet</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center">
                          {member.user?.avatar?.startsWith('http')
                            ? <img src={member.user.avatar} alt="" className="w-full h-full object-cover" />
                            : <span>👤</span>}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{member.user?.name || 'User'}</p>
                          {member.user?.username && <p className="text-xs text-gray-400">@{member.user.username}</p>}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {member.subscriptionStatus || 'active'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DANGER ZONE */}
          {activeSection === 'danger' && (
            <div className="bg-white rounded-2xl border-2 border-red-200 p-5">
              <div className="flex items-center space-x-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="font-semibold text-red-700">Danger Zone</h2>
              </div>

              <p className="text-sm text-gray-600 mb-5">
                Deleting this community is permanent and cannot be undone. All posts, members, and data will be lost.
              </p>

              <button onClick={() => setShowDeleteModal(true)}
                className="px-5 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition flex items-center space-x-2">
                <Trash2 className="w-4 h-4" />
                <span>Delete Community</span>
              </button>
            </div>
          )}

          {/* Save button (bottom) */}
          {activeSection !== 'danger' && activeSection !== 'members' && (
            <button onClick={handleSave} disabled={saving}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center space-x-2">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              <span>{saved ? 'Changes Saved!' : saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Delete Community</h3>
                  <p className="text-sm text-gray-500">This cannot be undone</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Type <span className="font-bold text-gray-900">"{community?.name}"</span> to confirm deletion.
              </p>

              <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="Type community name..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-500 text-sm mb-4" />

              <div className="flex space-x-3">
                <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting || deleteConfirm !== community?.name}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}