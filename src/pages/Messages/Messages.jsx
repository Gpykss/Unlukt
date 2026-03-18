// src/pages/Messages/Messages.jsx - FIXED MOBILE SCROLL

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserProfile } from '../../services/firestoreService';
import { 
  ArrowLeft,
  Search,
  Send,
  Smile,
  MoreVertical,
  Loader2,
  Trash2,
  BellOff,
  Bell,
  MessageSquareOff,
  Ban,
  AlertTriangle,
  Lock,
  X, Image, Video,
  Gift
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import PPVMessageCard from '../../components/Messages/PPVMessageCard';
import { uploadToBunny } from '../../services/bunnyUpload.service';
import { sendPPVMessage } from '../../services/ppvMessageService';
import {
  subscribeToConversations,
  subscribeToMessages,
  sendMessage,
  markConversationAsRead,
  getOrCreateConversation,
  deleteConversation,
  muteConversation,
  unmuteConversation,
  clearChat,
  blockUser,
  unblockUser,
  isUserBlocked,
  subscribeToUserStatus
} from '../../services/messageService';
import TipModal from '../../components/Modals/TipModal'; 

export default function Messages() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();
  const [selectedChat, setSelectedChat] = useState(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showPPVModal, setShowPPVModal] = useState(false);
  const [ppvContent, setPPVContent] = useState('');
  const [ppvPrice, setPPVPrice] = useState(12);
  const [sendingPPV, setSendingPPV] = useState(false);
  const [ppvMedia, setPPVMedia] = useState(null);
  const [showTipModal, setShowTipModal] = useState(false);

  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null); 

  useEffect(() => {
    const checkBlockStatus = async () => {
      if (selectedChat && currentUser) {
        const blocked = await isUserBlocked(currentUser.uid, selectedChat.otherUser.id);
        setIsBlocked(blocked);
      }
    };
    checkBlockStatus();
  }, [selectedChat, currentUser]);

  useEffect(() => {
    if (!sending && selectedChat && messageInputRef.current) {
      messageInputRef.current.focus();
    }
  }, [sending, selectedChat]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const unsubscribe = subscribeToConversations(currentUser.uid, (convos) => {
      setConversations(convos);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const startChatWith = params.get('with');
    
    if (startChatWith && currentUser && conversations.length > 0) {
      setLoading(false);
      
      const existingConvo = conversations.find(c => 
        c.participants && c.participants.includes(startChatWith)
      );
      
      if (existingConvo) {
        handleSelectChat(existingConvo);
      } else {
        handleStartNewConversation(startChatWith);
      }
      
      navigate('/messages', { replace: true });
    }
  }, [location.search, currentUser, conversations.length]);

  useEffect(() => {
    if (!selectedChat || !selectedChat.id) {
      setMessages([]);
      return;
    }
    
    const unsubscribe = subscribeToMessages(selectedChat.id, (msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    });

    return () => unsubscribe();
  }, [selectedChat?.id]);

  useEffect(() => {
    if (!selectedChat?.otherUser?.id) return;

    const unsubscribe = subscribeToUserStatus(selectedChat.otherUser.id, (isOnline) => {
      setSelectedChat(prev => {
        if (!prev || prev.id !== selectedChat.id) return prev;
        
        return {
          ...prev,
          otherUser: {
            ...prev.otherUser,
            online: isOnline
          }
        };
      });
      
      setConversations(prevConvos => 
        prevConvos.map(convo => 
          convo.otherUser?.id === selectedChat.otherUser.id
            ? {
                ...convo,
                otherUser: {
                  ...convo.otherUser,
                  online: isOnline
                }
              }
            : convo
        )
      );
    });

    return () => unsubscribe();
  }, [selectedChat?.otherUser?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStartNewConversation = async (otherUserId) => {
    try {
      const conversation = await getOrCreateConversation(currentUser.uid, otherUserId);
      const otherUserProfile = await getUserProfile(otherUserId);
      
      const formattedConvo = {
        id: conversation.id,
        participants: [currentUser.uid, otherUserId],
        otherUser: {
          id: otherUserId,
          name: otherUserProfile.displayName || otherUserProfile.name || 'User',
          username: otherUserProfile.username || '',
          avatar: otherUserProfile.avatar || otherUserProfile.photoURL || '👤',
          online: otherUserProfile.isOnline || false
        },
        lastMessage: conversation.lastMessage || '',
        lastMessageTime: conversation.lastMessageTime,
        unreadCount: 0,
        muted: false
      };
      
      handleSelectChat(formattedConvo);
      
    } catch (error) {
      console.error('Error starting conversation:', error);
      alert(error.message || 'Failed to start conversation');
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.otherUser.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedChat || sending) return;

    try {
      setSending(true);
      const messageText = message.trim();
      setMessage('');

      await sendMessage(
        selectedChat.id,
        currentUser.uid,
        selectedChat.otherUser.id,
        messageText,
        profile
      );

      scrollToBottom();
      
    } catch (error) {
      console.error('ERROR sending message:', error);
      alert(error.message || 'Failed to send message');
      setMessage(messageText);
    } finally {
      setSending(false);
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    }
  };

  const handleSelectChat = (conversation) => {
    setSelectedChat(conversation);
    setShowMobileChat(true);
    setShowConversationMenu(null);
    
    if (currentUser) {
      markConversationAsRead(conversation.id, currentUser.uid);
    }
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
    setSelectedChat(null);
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await deleteConversation(conversationId);
      setShowDeleteModal(false);
      setShowConversationMenu(null);
      if (selectedChat?.id === conversationId) {
        setSelectedChat(null);
        setShowMobileChat(false);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Failed to delete conversation');
    }
  };

  const handleToggleMute = async (conversationId, isMuted) => {
    try {
      if (isMuted) {
        await unmuteConversation(conversationId, currentUser.uid);
      } else {
        await muteConversation(conversationId, currentUser.uid);
      }
      setShowConversationMenu(null);
    } catch (error) {
      console.error('Error toggling mute:', error);
      alert('Failed to update mute status');
    }
  };

  const handleClearChat = async () => {
    try {
      await clearChat(selectedChat.id);
      setShowClearModal(false);
      setShowChatMenu(false);
    } catch (error) {
      console.error('Error clearing chat:', error);
      alert('Failed to clear chat');
    }
  };

  const handleBlockUser = async () => {
    try {
      await blockUser(currentUser.uid, selectedChat.otherUser.id);
      setShowBlockModal(false);
      setShowChatMenu(false);
      setSelectedChat(null);
      setShowMobileChat(false);
    } catch (error) {
      console.error('Error blocking user:', error);
      alert('Failed to block user');
    }
  };

  const handleSendPPV = async () => {
  if (!ppvContent.trim() && !ppvMedia) return;
  try {
    setSendingPPV(true);
    let mediaUrl = null;
    let mediaType = null;

    if (ppvMedia) {
      const result = await uploadToBunny(ppvMedia, { folder: 'ppv-messages', contentType: 'media' });
        mediaUrl = result.cdnUrl;
      mediaType = ppvMedia.type.startsWith('video') ? 'video' : 'image';
    }

    await sendPPVMessage(selectedChat.id, currentUser.uid, {
      content: ppvContent,
      price: parseFloat(ppvPrice),
      mediaUrl,
      mediaType
    });
    setPPVContent('');
    setPPVPrice(12);
    setPPVMedia(null);
    setShowPPVModal(false);
  } catch (err) {
    console.error('Error sending PPV:', err);
    alert('Failed to send locked message');
  } finally {
    setSendingPPV(false);
  }
};

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch (error) {
      return '';
    }
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (error) {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    // ✅ FIXED: Mobile height with proper overflow
    <div className="fixed inset-0 bg-gray-50 pt-14 lg:pt-0 overflow-hidden" style={{ height: '100dvh' }}>
    <div className="h-full flex">
        {/* Conversations Sidebar */}
        <div className={`w-full md:w-96 bg-white border-r border-gray-200 flex flex-col ${
          showMobileChat ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => navigate('/feed')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition md:hidden"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Messages</h1>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </div>
          </div>

          {/* Conversations List - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No conversations yet</p>
                <p className="text-sm text-gray-400 mt-2">Start chatting with creators!</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div key={conversation.id} className="relative">
                  <motion.div
                    whileHover={{ backgroundColor: '#F9FAFB' }}
                    onClick={() => handleSelectChat(conversation)}
                    className={`p-4 cursor-pointer border-b border-gray-100 transition ${
                      selectedChat?.id === conversation.id ? 'bg-rose-50' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl sm:text-2xl overflow-hidden">
                          {conversation.otherUser.avatar?.startsWith('http') ? (
                            <img src={conversation.otherUser.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{conversation.otherUser.avatar || '👤'}</span>
                          )}
                        </div>
                        {conversation.otherUser.online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                            {conversation.otherUser.name}
                          </p>
                          <span className="text-xs text-gray-500">
                            {formatTime(conversation.lastMessageTime)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-xs sm:text-sm truncate ${
                            conversation.unreadCount > 0 ? 'text-gray-900 font-semibold' : 'text-gray-500'
                          }`}>
                            {conversation.lastMessage || 'No messages yet'}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <span className="ml-2 w-5 h-5 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center font-semibold flex-shrink-0">
                              {conversation.unreadCount}
                            </span>
                          )}
                          {conversation.muted && (
                            <BellOff className="w-4 h-4 text-gray-400 ml-2" />
                          )}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowConversationMenu(showConversationMenu === conversation.id ? null : conversation.id);
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg transition"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </motion.div>

                  {/* Conversation Menu */}
                  <AnimatePresence>
                    {showConversationMenu === conversation.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowConversationMenu(null)}
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-4 top-16 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20"
                        >
                          <button
                            onClick={() => handleToggleMute(conversation.id, conversation.muted)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition"
                          >
                            {conversation.muted ? (
                              <>
                                <Bell className="w-4 h-4" />
                                <span>Unmute</span>
                              </>
                            ) : (
                              <>
                                <BellOff className="w-4 h-4" />
                                <span>Mute</span>
                              </>
                            )}
                          </button>

                          <div className="border-t border-gray-200 my-1"></div>

                          <button
                            onClick={() => {
                              setShowDeleteModal(true);
                              setShowConversationMenu(null);
                            }}
                            className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 flex items-center space-x-3 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Conversation</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ✅ FIXED: Chat Area - Proper height and overflow */}
        <div className={`flex-1 flex flex-col bg-white ${
          showMobileChat ? 'flex' : 'hidden md:flex'
        }`}>
          {selectedChat ? (
            <>
              {/* Chat Header - Fixed */}
              <div className="p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleBackToList}
                      className="p-2 hover:bg-gray-100 rounded-lg transition md:hidden"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="relative">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl sm:text-2xl overflow-hidden">
                        {selectedChat.otherUser.avatar?.startsWith('http') ? (
                          <img src={selectedChat.otherUser.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>{selectedChat.otherUser.avatar || '👤'}</span>
                        )}
                      </div>
                      {selectedChat.otherUser.online && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm sm:text-base text-gray-900">{selectedChat.otherUser.name}</p>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {selectedChat.otherUser.online ? 'Active now' : 'Offline'}
                      </p>
                    </div>
                  </div>

                 {/* ✅Gift button  */}
                    <div className="flex items-center space-x-2">
                      {selectedChat && (
                        <button
                          onClick={() => {
                            if (!currentUser) { navigate('/login'); return; }
                            setShowTipModal(true);
                          }}
                          className="p-2 hover:bg-yellow-50 rounded-lg transition"
                          title="Send a gift"
                        >
                          <Gift className="w-5 h-5 text-yellow-500" />
                        </button>
                      )}
                  </div>

                  {/* Chat Menu */}
                  <div className="relative">
                    <button 
                      onClick={() => setShowChatMenu(!showChatMenu)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                      <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>

                    <AnimatePresence>
                      {showChatMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowChatMenu(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20"
                          >
                            {isBlocked && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      await unblockUser(currentUser.uid, selectedChat.otherUser.id);
                                      setIsBlocked(false);
                                      setShowChatMenu(false);
                                      alert('User unblocked successfully!');
                                    } catch (error) {
                                      console.error('Error unblocking user:', error);
                                      alert('Failed to unblock user');
                                    }
                                  }}
                                  className="w-full px-4 py-3 text-left text-green-600 hover:bg-green-50 flex items-center space-x-3 transition font-semibold"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                  <span>Unblock User</span>
                                </button>
                                <div className="border-t border-gray-200 my-1"></div>
                              </>
                            )}

                            <button
                              onClick={() => {
                                setShowClearModal(true);
                                setShowChatMenu(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition"
                            >
                              <MessageSquareOff className="w-4 h-4" />
                              <span>Clear Chat</span>
                            </button>

                            <div className="border-t border-gray-200 my-1"></div>

                            {!isBlocked && (
                              <button
                                onClick={() => {
                                  setShowBlockModal(true);
                                  setShowChatMenu(false);
                                }}
                                className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 flex items-center space-x-3 transition"
                              >
                                <Ban className="w-4 h-4" />
                                <span>Block User</span>
                              </button>
                            )}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Blocked Warning */}
                {isBlocked && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mt-3 rounded">
                    <div className="flex items-start">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">
                          This user is blocked
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          You cannot send or receive messages. Unblock from the menu to continue.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ✅ Messages - ONLY THIS SCROLLS */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3 md:space-y-4">
              {messages.map((msg) => (
              msg.isPPV ? (
                <PPVMessageCard
                  key={msg.id}
                  message={msg}
                  conversationId={selectedChat.id}
                  onUnlock={(payment) => {
                    window.open(payment.paymentUrl, '_blank');
                  }}
                />
              ) : (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[85%] sm:max-w-[75%] md:max-w-xs lg:max-w-md">
                    <div className={`rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${
                      msg.senderId === currentUser.uid
                        ? 'bg-rose-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                     <p className="text-sm sm:text-base break-words">
                        {(() => {
                          // ✅ Safely extract text from message
                          if (!msg) return '';
                          
                          // If text is a string, return it
                          if (typeof msg.text === 'string') return msg.text;
                          
                          // If text is an object with a text property
                          if (msg.text && typeof msg.text === 'object' && msg.text.text) {
                            return String(msg.text.text);
                          }
                          
                          // Fallback to content field
                          if (msg.content) return String(msg.content);
                          
                          // Last resort - stringify the object (for debugging)
                          if (msg.text) return JSON.stringify(msg.text);
                          
                          return '';
                        })()}
                      </p>
                    </div>
                    <p className={`text-xs text-gray-400 mt-1 ${
                      msg.senderId === currentUser.uid ? 'text-right' : 'text-left'
                    }`}>
                      {formatMessageTime(msg.createdAt)}
                    </p>
                  </div>
                </motion.div>
              )
            ))}
                <div ref={messagesEndRef} />
              </div>

              {/* ✅ Message Input - Fixed at Bottom */}
              <div className="p-3 sm:p-4 border-t border-gray-200 flex-shrink-0 bg-white sticky bottom-0">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="flex-1 relative">
                    <input
                      ref={messageInputRef}
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !sending && !isBlocked && handleSendMessage()}
                      placeholder={isBlocked ? "Cannot send messages to blocked users" : "Type a message..."}
                      disabled={sending || isBlocked}
                      className="w-full px-4 py-2.5 sm:py-3 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ fontSize: '16px' }}
                    />
                    <button className="absolute right-3 top-1/2 transform -translate-y-1/2 hidden sm:block">
                      <Smile className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {profile?.isCreator && (
                    <button
                      onClick={() => setShowPPVModal(true)}
                      className="p-2.5 sm:p-3 rounded-full bg-purple-100 hover:bg-purple-200 transition flex-shrink-0"
                      title="Send locked message"
                    >
                      <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                    </button>
                  )}
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || sending || isBlocked}
                    className={`p-2.5 sm:p-3 rounded-full transition flex-shrink-0 ${
                      message.trim() && !sending && !isBlocked
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
                </div>
                <p className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Select a conversation</p>
                <p className="text-sm sm:text-base text-gray-500">Choose a conversation from the sidebar to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PPV Modal */}
          <AnimatePresence>
            {showPPVModal && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-4">🔒 Send Locked Message</h3>
                
                <textarea
                  value={ppvContent}
                  onChange={(e) => setPPVContent(e.target.value)}
                  placeholder="Message content (blurred until unlocked)..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 resize-none text-sm mb-3"
                />

                {/* Media Upload */}
                <div className="mb-4">
                  {ppvMedia ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200">
                      {ppvMedia.type.startsWith('video') ? (
                        <video src={URL.createObjectURL(ppvMedia)} className="w-full max-h-40 object-cover" />
                      ) : (
                        <img src={URL.createObjectURL(ppvMedia)} className="w-full max-h-40 object-cover" />
                      )}
                      <button
                        onClick={() => setPPVMedia(null)}
                        className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center space-x-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-rose-300 transition">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => setPPVMedia(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <Image className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-500">Add photo or video</span>
                    </label>
                  )}
                </div>

                <div className="flex items-center space-x-3 mb-4">
                  <label className="text-sm font-semibold text-gray-700">Unlock Price ($)</label>
                  <input
                    type="number"
                    min="12"
                    value={ppvPrice}
                    onChange={(e) => setPPVPrice(e.target.value)}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 text-sm"
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => { setShowPPVModal(false); setPPVMedia(null); }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendPPV}
                    disabled={(!ppvContent.trim() && !ppvMedia) || sendingPPV}
                    className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
                  >
                    {sendingPPV ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Send Locked'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

                {/* ✅Tip Modal */}
              {selectedChat && (
                <TipModal
                  isOpen={showTipModal}
                  onClose={() => setShowTipModal(false)}
                  creator={{
                    uid: selectedChat.otherUser.id,
                    name: selectedChat.otherUser.name,
                    avatar: selectedChat.otherUser.avatar,
                  }}
                />
              )}
    </div>
  );
}
