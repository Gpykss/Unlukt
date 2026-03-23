// src/App.jsx

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ContentSettingsProvider } from './contexts/ContentSettingsContext';
import { DataLiteProvider } from './contexts/DataLiteContext';

import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoadingScreen from './components/common/LoadingScreen';
import GlobalSidebar from './layout/GlobalSidebar';
import MobileNavbar from './layout/MobileNavbar';
import MobileBottomNav from './layout/MobileBottomNav';
import DiscoverSidebar from './components/discover/DiscoverSidebar';

// Pages
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import VerifyEmail from './pages/Auth/VerifyEmail';
import Feed from './pages/Feed/Feed';
import CreatorProfile from './pages/CreatorProfile/CreatorProfile';
import Dashboard from './pages/Dashboard/Dashboard';
import CreatorAnalytics from './pages/Analytics/Analytics';
import Wallet from './pages/Wallet/Wallet';
import Settings from './pages/Settings/Settings';
import SearchPage from './pages/Search/Search';
import Discover from './pages/Discover/Discover';
import NotificationsPage from './pages/Notifications/Notifications';
import MessagesPage from './pages/Messages/Messages';
import NewPost from './pages/NewPost/NewPost';
import CompleteProfile from './pages/Profile/CompleteProfile';
import EditProfile from './pages/Profile/EditProfile';
import BecomeCreator from './pages/CreatorProfile/BecomeCreator';
import TermsAndConditions from './pages/Legal/TermsAndConditions';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import HelpCenter from './pages/Legal/HelpCenter';
import Communities from './pages/Communities/Communities';
import CommunityDetail from './pages/Communities/CommunityDetail';
import CreateCommunity from './pages/Communities/CreateCommunity';
import CommunitySettings from './pages/Communities/CommunitySettings';
import Support from './pages/Support/Support';
import VideoCallRoom from './pages/VideoCall/VideoCallRoom';
import VoiceCallRoom from './pages/VideoCall/VoiceCallRoom';
import BookVideoCall from './pages/VideoCall/BookVideoCall';
import BookVoiceCall from './pages/VideoCall/BookVoiceCall';
import MyCalls from './pages/MyCalls/MyCalls';
import CallWaitingRoom from './pages/VideoCall/CallWaitingRoom';
import CallSummary from './pages/VideoCall/CallSummary';

// ✅ Admin Pages
import Admin from './pages/Admin/Admin';
import KYCManagement from './pages/Admin/KYCManagement';
import UserManagement from './pages/Admin/UserManagement';
import AdminAnalytics from './pages/Admin/Analytics';
import NowPaymentsLogs from './pages/Admin/NowPaymentsLogs';
import CryptoPayments from './pages/Admin/CryptoPayments';

// Pages that should have NO navigation chrome
const NO_NAV_PATHS = new Set([
  '/', '/login', '/register', '/verify-email', '/complete-profile',
  '/legal/privacy', '/legal/terms', '/help',
]);

function AppContent() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const path = location.pathname;

  const showNav = !NO_NAV_PATHS.has(path)
    && !path.startsWith('/video-call/')
    && !path.startsWith('/voice-call/')
    && !path.startsWith('/book-video-call/')
    && !path.startsWith('/waiting-room/')
    && !path.startsWith('/call-summary/')
    && !path.startsWith('/book-voice-call/');

  const showDiscoverSidebar = path === '/feed';
  const isMessagesPage = path === '/messages';

  return (
   <div className="app min-h-screen bg-gray-50">
      {showNav && <MobileNavbar onMenuClick={() => setSidebarOpen(true)} />}
      {showNav && <GlobalSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

      <div className={[
        showNav ? (isMessagesPage ? 'pt-14 lg:pt-0' : 'pt-14 pb-20 lg:pt-0 lg:pb-0') : '',
        showNav ? 'lg:ml-64' : '',
        showNav && showDiscoverSidebar ? 'lg:mr-72' : '',
        isMessagesPage ? 'overflow-hidden h-[calc(100dvh-56px)] lg:h-screen' : 'overflow-y-auto',
      ].filter(Boolean).join(' ')}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/legal/terms" element={<TermsAndConditions />} />
          <Route path="/legal/privacy" element={<PrivacyPolicy />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/support" element={<Support />} />

          {/* Auth required but no email verification */}
          <Route path="/verify-email" element={<ProtectedRoute requireVerification={false}><VerifyEmail /></ProtectedRoute>} />
          <Route path="/complete-profile" element={<ProtectedRoute requireVerification={false}><CompleteProfile /></ProtectedRoute>} />

          {/* Main app */}
          <Route path="/feed" element={<ProtectedRoute requireVerification={true}><Feed /></ProtectedRoute>} />
          <Route path="/creator/:username" element={<ProtectedRoute><CreatorProfile /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><CreatorAnalytics /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/new-post" element={<ProtectedRoute><NewPost /></ProtectedRoute>} />
          <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
          <Route path="/become-creator" element={<ProtectedRoute><BecomeCreator /></ProtectedRoute>} />
          <Route path="/my-calls" element={<MyCalls />} />

          {/* Communities */}
          <Route path="/communities" element={<ProtectedRoute><Communities /></ProtectedRoute>} />
          <Route path="/community/:communityId" element={<ProtectedRoute><CommunityDetail /></ProtectedRoute>} />
          <Route path="/community/:communityId/settings" element={<ProtectedRoute><CommunitySettings /></ProtectedRoute>} />
          <Route path="/create-community" element={<ProtectedRoute><CreateCommunity /></ProtectedRoute>} />

          {/* Calls — full screen, no nav */}
          <Route path="/video-call/:bookingId" element={<ProtectedRoute><VideoCallRoom /></ProtectedRoute>} />
          <Route path="/voice-call/:bookingId" element={<ProtectedRoute><VoiceCallRoom /></ProtectedRoute>} />
          <Route path="/book-video-call/:creatorId" element={<ProtectedRoute><BookVideoCall /></ProtectedRoute>} />
          <Route path="/book-voice-call/:creatorId" element={<ProtectedRoute><BookVoiceCall /></ProtectedRoute>} />
          <Route path="/waiting-room/:bookingId" element={<ProtectedRoute><CallWaitingRoom /></ProtectedRoute>} />
          <Route path="/call-summary/:bookingId" element={<ProtectedRoute><CallSummary /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/admin/kyc" element={<AdminRoute><KYCManagement /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
          <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
          <Route path="/admin/payment-logs" element={<AdminRoute><NowPaymentsLogs /></AdminRoute>} />
          <Route path="/admin/crypto-payments" element={<AdminRoute><CryptoPayments /></AdminRoute>} />
        </Routes>
      </div>

      {showNav && showDiscoverSidebar && <DiscoverSidebar />}
      {showNav && <MobileBottomNav />}
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(t);
  }, []);

  if (isLoading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <ContentSettingsProvider>
          <DataLiteProvider>
            <AppContent />
          </DataLiteProvider>
        </ContentSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;