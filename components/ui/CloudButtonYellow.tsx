"use client";

import React, { useState } from 'react';

interface CloudButtonProps {
  title: string;
  children: React.ReactNode;
}

const CloudButton: React.FC<CloudButtonProps> = ({ title, children }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const handleClick = () => setIsFlipped(!isFlipped);

  return (
    <div
      className="group w-[400px] h-[150px] [perspective:1000px] cursor-pointer"
      onClick={handleClick}
    >
      <div
        className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <div 
          className="absolute w-full h-full [backface-visibility:hidden] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/cloud-color/cloudy/cloud-button.png')" }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-orange-500 font-bold text-2xl drop-shadow-sm translate-y-3">
              {title}
            </span>
          </div>
        </div>
        <div
          className="absolute w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/cloud-color/cloudy/cloud-button.png')" }}
        >
          <div className="w-full h-full flex items-center justify-center text-center p-10 translate-y-3">
            <div className="relative top-3 text-gray-800 text-sm font-semibold">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudButton;
