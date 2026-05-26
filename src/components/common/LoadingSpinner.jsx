// src/components/common/LoadingSpinner.jsx
import React from 'react';

export default function LoadingSpinner() {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center py-12">
      <div className="flex flex-col items-center space-y-4">
        {/* Outer glowing ring */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-rose-500/10" />
          <div className="absolute inset-0 rounded-full border-4 border-t-rose-500 border-r-rose-500 animate-spin" />
        </div>
        <span className="text-sm font-bold text-gray-500 tracking-wider animate-pulse">
          Loading Gallery...
        </span>
      </div>
    </div>
  );
}
