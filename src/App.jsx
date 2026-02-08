// src/App.jsx - NO BOTTOM PADDING ON MESSAGES PAGE

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoadingScreen from "./components/common/LoadingScreen";
import GlobalSidebar from "./layout/GlobalSidebar";
import MobileNavbar from "./layout/MobileNavbar";
import MobileBottomNav from "./layout/MobileBottomNav";
import DiscoverSidebar from "./components/discover/DiscoverSidebar";
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import VerifyEmail from './pages/Auth/VerifyEmail';
import Feed from './pages/Feed/Feed';
import CreatorProfile from './pages/CreatorProfile/CreatorProfile';
import Dashboard from './pages/Dashboard/Dashboard';
import Wallet from './pages/Wallet/Wallet';
import Admin from './pages/Admin/Admin';
import KYCManagement from './pages/Admin/KYCManagement';
import Settings from './pages/Settings/Settings';
import SearchPage from './pages/Search/Search';
import Discover from './pages/Discover/Discover';
import NotificationsPage from './pages/Notifications/Notifications';
import MessagesPage from './pages/Messages/Messages';
import NewPost from './pages/NewPost/NewPost';
import CompleteProfile from './pages/Profile/CompleteProfile';
import EditProfile from './pages/Profile/EditProfile';
import BecomeCreator from './pages/CreatorProfile/BecomeCreator';
import CryptoPayments from './pages/Admin/CryptoPayments';
import TermsAndConditions from './pages/Legal/TermsAndConditions';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import HelpCenter from './pages/Legal/HelpCenter';

function AppContent() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Pages without any navigation
  const noNavPages = ['/', '/login', '/register', '/verify-email', '/complete-profile', '/legal/privacy', '/legal/terms', '/help'];
  const showNav = !noNavPages.includes(location.pathname);
  
  // Pages that show discover sidebar on desktop
  const showDiscoverSidebar = location.pathname === '/feed';

  // ✅ Messages page needs special handling (no bottom padding)
  const isMessagesPage = location.pathname === '/messages';

  return (
    <div className="app min-h-screen bg-gray-50">
      {/* Mobile Navbar - Top (MOBILE ONLY) */}
      {showNav && (
        <MobileNavbar onMenuClick={() => setSidebarOpen(true)} />
      )}

      {/* Desktop Sidebar - Left */}
      {showNav && (
        <GlobalSidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
        />
      )}

      {/* ✅ Main Content - SPECIAL HANDLING FOR MESSAGES */}
      <div className={`
        ${showNav ? (isMessagesPage ? 'pt-14 lg:pt-0' : 'pt-14 pb-20 lg:pt-0 lg:pb-0') : ''}
        ${showNav ? 'lg:ml-64' : ''}
        ${showNav && showDiscoverSidebar ? 'xl:mr-80' : ''}
        ${isMessagesPage ? 'h-screen' : ''}
      `}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<ProtectedRoute requireVerification={false}><VerifyEmail /></ProtectedRoute>} />
          
          {/* Protected Routes */}
          <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
          <Route path="/creator/:username" element={<ProtectedRoute><CreatorProfile /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/admin/kyc" element={<AdminRoute><KYCManagement /></AdminRoute>} />
          <Route path="/admin/crypto-payments" element={<AdminRoute><CryptoPayments /></AdminRoute>} />
          
          {/* Other Protected Routes */}
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/new-post" element={<ProtectedRoute><NewPost /></ProtectedRoute>} />
          <Route path="/complete-profile" element={<ProtectedRoute requireVerification={false}><CompleteProfile /></ProtectedRoute>} />
          <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
          <Route path="/become-creator" element={<ProtectedRoute><BecomeCreator /></ProtectedRoute>} />
          
          {/* Legal Pages */}
          <Route path="/legal/terms" element={<TermsAndConditions />} />
          <Route path="/legal/privacy" element={<PrivacyPolicy />} />
          <Route path="/help" element={<HelpCenter />} />
        </Routes>
      </div>

      {/* Desktop Discover Sidebar - Right */}
      {showNav && showDiscoverSidebar && <DiscoverSidebar />}

      {/* Mobile Bottom Navigation (MOBILE ONLY) */}
      {showNav && <MobileBottomNav />}
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;