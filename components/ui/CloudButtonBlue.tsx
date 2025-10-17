"use client";

import React, { useState } from 'react';

interface CloudBlueButtonProps {
  title: string;
  children: React.ReactNode;
}

const CloudBlueButton: React.FC<CloudBlueButtonProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const handleClick = () => setIsOpen(!isOpen);

  return (
    <div className="w-[600px] cursor-pointer mx-auto mb-8">
      <div
        className="w-full h-[150px] bg-contain bg-center bg-no-repeat flex items-center justify-center px-4 text-center"
        style={{ backgroundImage: "url('/cloud-color/cloudb/cloud-blue-down.png')" }}
        onClick={handleClick}
      >
        <span className="mt-6 text-orange-500 font-bold text-lg drop-shadow-sm break-words">
          {title}
        </span>
      </div>
      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden mx-auto ${
          isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-gray-100 rounded-b-lg -mt-4 text-center w-[500px] mx-auto">
          <div className="inline-block max-w-full px-4 py-4 text-left">
            <div className="text-gray-800 text-sm font-semibold break-words whitespace-pre-wrap">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudBlueButton;
