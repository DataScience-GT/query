"use client";

import React, { ReactNode, HTMLAttributes } from "react";
import Image, { StaticImageData } from "next/image";

interface TeamCardProps extends HTMLAttributes<HTMLDivElement> {
  img: string | StaticImageData;
  name: string;
  title: string;
  wide?: boolean;
  tall?: boolean;
  zoom?: boolean;
  top?: string | number;
  bottom?: boolean;
  children?: ReactNode;
}

const TeamCard: React.FC<TeamCardProps> = ({
  img,
  name,
  title,
  wide,
  tall,
  zoom,
  children,
  ...rest
}) => {
  const scale = zoom ? 1.1 : 1;

  return (
    <div
      {...rest}
      className="relative w-full bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 p-6 pt-20 flex flex-col items-center"
      style={{ minHeight: 320 }}
    >
      {/* Image at top */}
      <div
        className="absolute -top-12 left-1/2 rounded-full overflow-hidden border-4 border-white shadow-lg"
        style={{
          width: 120,
          height: 120,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      >
        <Image
          src={img}
          alt={name}
          fill
          className="object-cover"
          sizes="120px"
        />
      </div>

      {/* Text content */}
      <div className="flex flex-col items-center text-center space-y-2">
        <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
          {title}
        </h2>
        <h1 className="text-xl font-bold text-gray-900">{name}</h1>
        {children && (
          <p className="text-sm text-gray-600 leading-relaxed mt-3">
            {children}
          </p>
        )}
      </div>
    </div>
  );
};

export default TeamCard;