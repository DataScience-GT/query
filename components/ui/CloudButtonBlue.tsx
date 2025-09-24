"use client";

import React, { useState } from 'react';

// Renamed interface
interface CloudBlueButtonProps {
  title: string;
  children: React.ReactNode;
}

// Renamed component and updated prop type
const CloudBlueButton: React.FC<CloudBlueButtonProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const handleClick = () => setIsOpen(!isOpen);

  return (
    <div className="w-[400px] cursor-pointer">
      {/* Cloud Button */}
      <div
        className="w-full h-[150px] bg-contain bg-center bg-no-repeat flex items-center justify-center"
        style={{ backgroundImage: "url('/cloud-color/cloudb/cloud-blue-down.png')" }}
        onClick={handleClick}
      >
        <span className="text-orange-500 font-bold text-2xl drop-shadow-sm">
          {title}
        </span>
      </div>

      {/* Content Area */}
      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-6 bg-gray-100 rounded-b-lg -mt-4 pt-8">
          <div className="text-gray-800 text-sm font-semibold text-center">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

// Renamed default export
export default CloudBlueButton;