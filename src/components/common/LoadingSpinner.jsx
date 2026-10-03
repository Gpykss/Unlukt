// src/components/common/LoadingSpinner.jsx - Sleek Minimal Route Spinner
import React from 'react';

export default function LoadingSpinner() {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center py-12">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-rose-100" />
        <div className="absolute inset-0 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}
