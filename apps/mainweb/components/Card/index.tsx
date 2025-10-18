"use client";

import React from "react";
import Image from "next/image";

interface CardProps {
  img?: string;
  heading?: string;
  linkUrl?: string;
  children?: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ img, heading, linkUrl, children, className = "" }) => {
  return (
    <div
      className={`bg-[#111] text-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1 ${className}`}
    >
      {/* Image */}
      {img && (
        <div className="relative w-full h-40 overflow-hidden border-b border-white/10 flex items-center justify-center bg-black">
          <Image
            src={img}
            alt={heading || "Project image"}
            className="object-contain w-4/5 h-full"
            width={400}
            height={160}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col flex-grow p-5">
        {/* Heading */}
        {heading && (
          <div className="mb-2">
            {linkUrl ? (
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#74b1aa] text-xl font-semibold hover:underline"
              >
                {heading}
              </a>
            ) : (
              <h1 className="text-[#74b1aa] text-xl font-semibold">{heading}</h1>
            )}
          </div>
        )}

        {/* Description */}
        {children && (
          <div className="text-gray-300 text-sm leading-snug flex-grow">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default Card;
