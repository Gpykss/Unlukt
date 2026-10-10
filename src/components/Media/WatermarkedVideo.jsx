// src/components/Media/WatermarkedVideo.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useDataLite } from '../../contexts/DataLiteContext';

export default function WatermarkedVideo({ src, className, style, showWatermark, username, preload, autoPlay, onPlay, ...props }) {
  const text = `@${username}`;

  // Data Saver: download nothing until the viewer taps play
  const { dataLite } = useDataLite();
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  useEffect(() => { setStarted(false); }, [src]);
  const tapToPlay = dataLite && !started;

  return (
    <div className={`relative max-w-full mx-auto overflow-hidden flex items-center justify-center ${tapToPlay ? 'isolate' : ''}`}>
      <video
        ref={videoRef}
        src={src}
        className={className}
        style={style}
        {...props}
        preload={dataLite ? 'none' : preload}
        autoPlay={dataLite ? false : autoPlay}
        onPlay={(e) => { setStarted(true); onPlay?.(e); }}
      />
      {tapToPlay && (
        <button
          type="button"
          aria-label="Play video"
          onClick={(e) => { e.stopPropagation(); setStarted(true); videoRef.current?.play?.()?.catch?.(() => {}); }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/40 text-white"
        >
          <span className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" />
          </span>
          <span className="text-xs font-semibold">Tap to play · Data Saver on</span>
        </button>
      )}
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
