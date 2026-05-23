// src/components/Media/WatermarkedVideo.jsx
import React from 'react';

export default function WatermarkedVideo({ src, className, style, showWatermark, username, ...props }) {
  const text = `@${username}`;

  return (
    <div className="relative max-w-full mx-auto overflow-hidden flex items-center justify-center">
      <video
        src={src}
        className={className}
        style={style}
        {...props}
      />
      {showWatermark && username && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10">
          <svg
            className="w-full h-full opacity-[0.18]"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 400 600"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: 'absolute', inset: 0 }}
          >
            {[80, 180, 280, 380, 480, 560].map((y, i) => (
              <text
                key={i}
                x="200"
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(-35, 200, ${y})`}
                fill="white"
                fontSize="18"
                fontWeight="bold"
                fontFamily="monospace"
                letterSpacing="2"
              >
                {text}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
