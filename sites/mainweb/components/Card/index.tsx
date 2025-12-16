"use client";

import React, { useState } from "react";
import Image, { StaticImageData } from "next/image";

interface CardProps {
  img?: string | StaticImageData; // <-- allow StaticImageData
  imgClassName?: string; // optional class to customize image styling (e.g. filters)
  heading?: string;
  linkUrl?: string;
  children?: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ img, imgClassName = "", heading, linkUrl, children, className = "" }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`bg-[#111] text-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1 ${className}`}
    >
      {/* Image */}
      {img && (
        <div className="relative w-full h-40 overflow-hidden border-b border-white/10 flex items-center justify-center bg-black">
          {!imgError ? (
            <Image
              src={img} // works with both string and StaticImageData
              alt={heading || "Project image"}
              className={`object-contain w-4/5 h-full ${imgClassName}`}
              width={400}
              height={160}
              onError={() => setImgError(true)}
              // keep placeholder prop for optimization while handling potential failures
              placeholder="empty"
            />
          ) : (
            // Fallback: simple SVG with initials so something meaningful is always visible
            <div className="w-full h-full flex items-center justify-center p-4 bg-white/5">
              <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <rect width="120" height="80" rx="8" fill="#0f172a" />
                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="#74b1aa" fontSize="18" fontFamily="Inter, ui-sans-serif, system-ui">ARC</text>
              </svg>
            </div>
          )}
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
