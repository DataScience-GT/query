"use client";

import React, { useState } from "react";

interface CloudBlueButtonProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  titleClassName?: string; // optional class for customizing title
}

const CloudBlueButton: React.FC<CloudBlueButtonProps> = ({
  title,
  children,
  titleClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const handleClick = () => setIsOpen(!isOpen);

  return (
    <div className="relative w-[600px] cursor-pointer mx-auto mb-8">
      {/* Cloud Button */}
      <div
        className="w-full h-[150px] bg-contain bg-center bg-no-repeat flex items-center justify-center px-4 text-center"
        style={{
          backgroundImage: "url('/cloud-color/cloudb/cloud-blue-down.png')",
        }}
        onClick={handleClick}
      >
        <span
          className={`mt-6 text-orange-500 font-bold drop-shadow-sm break-words ${
            titleClassName || "text-lg"
          }`}
        >
          {title}
        </span>
      </div>

      {/* Floating Dropdown (overlay) */}
      {isOpen && (
        <div className="absolute top-[150px] left-1/2 -translate-x-1/2 w-[500px] bg-gray-100 rounded-lg shadow-lg text-center z-50 animate-fadeIn">
          <div className="px-4 py-4 text-left">
            <div className="text-gray-800 text-sm font-semibold break-words whitespace-pre-wrap">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudBlueButton;
