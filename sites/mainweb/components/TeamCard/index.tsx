"use client";

import React, { ReactNode, HTMLAttributes } from "react";
import Image, { StaticImageData } from "next/image";

interface TeamCardProps extends HTMLAttributes<HTMLDivElement> {
  img: string | StaticImageData;
  name: string;
  title: string;
  zoom?: boolean;
  children?: ReactNode;
}

const TeamCard: React.FC<TeamCardProps> = ({
  img,
  name,
  title,
  zoom,
  children,
  ...rest
}) => {
  return (
    <div
      {...rest}
      className="group relative w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-8 pt-24 flex flex-col items-center transition-all duration-500 hover:border-[#00A8A8]/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.1)]"
      style={{ minHeight: 350 }}
    >
      {/* Profile Image Container */}
      <div
        className={`absolute -top-12 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-white/10 bg-[#050505] shadow-2xl transition-all duration-500 ${
          zoom ? "group-hover:scale-110" : "group-hover:-translate-y-2"
        }`}
        style={{
          width: 140,
          height: 140,
        }}
      >
        <Image
          src={img}
          alt={name}
          fill
          className="object-cover transition-all duration-700 group-hover:rotate-1"
          sizes="140px"
          priority
        />
        {/* Updated overlay glow to #00A8A8 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00A8A8]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center w-full space-y-4">
        {/* Title Tag - Updated to #00A8A8 */}
        <div className="px-3 py-1 rounded-full bg-[#00A8A8]/10 border border-[#00A8A8]/20">
          <h2 className="text-[10px] font-mono font-bold text-[#00A8A8] uppercase tracking-[0.2em]">
            {title}
          </h2>
        </div>

        {/* Name - High contrast white */}
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">
          {name}
        </h1>

        {/* Description */}
        {children && (
          <div className="relative">
            <p className="text-sm text-gray-400 leading-relaxed font-medium">
              {children}
            </p>
            {/* Visual accent line */}
            <div className="w-8 h-[1px] bg-white/10 mx-auto mt-6" />
          </div>
        )}
      </div>

      {/* HUD Details - Updated to #00A8A8 */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none">
        <span className="text-[8px] font-mono text-[#00A8A8] uppercase tracking-widest">
          SYS_LOG_ID_{name.slice(0, 3).toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default TeamCard;