import React from 'react';

const CandyIcon: React.FC = () => (
  <div className="inline-block mx-2">
    <svg
      width="60"
      height="40"
      viewBox="0 0 60 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-md"
    >
      <defs>
        <linearGradient id="candyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff9a9e" />
          <stop offset="50%" stopColor="#fecfef" />
          <stop offset="100%" stopColor="#ff7b7b" />
        </linearGradient>
      </defs>
      <path d="M5 20 L20 8 L20 32 Z" fill="url(#candyGradient)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <path d="M55 20 L40 8 L40 32 Z" fill="url(#candyGradient)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <circle cx="30" cy="20" r="12" fill="url(#candyGradient)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <path d="M30 8 Q38 20 30 32 Q22 20 30 8" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 12 Q34 20 30 28 Q26 20 30 12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </div>
);

export default CandyIcon;