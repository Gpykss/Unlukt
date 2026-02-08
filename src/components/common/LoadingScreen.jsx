// src/components/common/LoadingScreen.jsx - ANIMATED LOCK ICON

import React from 'react';
import { LockKeyhole } from 'lucide-react';
import './LoadingScreen.css';

const LoadingScreen = () => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        {/* ✅ Animated unlukt logo */}
        <div className="logo-container">
          <span className="logo-text">Unl</span>
          <LockKeyhole className="logo-icon animate-lock" strokeWidth={1.8} fill="none" />
          <span className="logo-text">kt</span>
        </div>
        
        {/* Loading dots */}
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
