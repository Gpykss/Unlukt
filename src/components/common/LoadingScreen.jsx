// src/components/common/LoadingScreen.jsx - Sleek Minimal Loader
import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-xs flex items-center justify-center z-[99999]">
      <div className="flex flex-col items-center justify-center space-y-3">
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 rounded-full border-2 border-rose-100" />
          <div className="absolute inset-0 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
