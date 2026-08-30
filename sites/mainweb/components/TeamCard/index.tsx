"use client";

import type { ReactNode, HTMLAttributes } from "react";
import type { StaticImageData } from "next/image";
import Image from "next/image";

interface TeamCardProps extends HTMLAttributes<HTMLDivElement> {
  img?: string | StaticImageData;
  name: string;
  title: string;
  href?: string;
  zoom?: boolean;
  children?: ReactNode;
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function TeamCard({
  img,
  name,
  title,
  href,
  zoom,
  children,
  ...rest
}: TeamCardProps) {
  return (
    <div
      {...rest}
      className="group relative w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-8 pt-24 flex flex-col items-center transition-ui duration-500 hover:border-[#00A8A8]/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.1)]"
      style={{ minHeight: 350 }}
    >
      {/* Profile Image Container */}
      <div
        className={`absolute -top-12 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-white/10 bg-[#050505] shadow-2xl transition-ui duration-500 ${
          zoom ? "group-hover:scale-110" : "group-hover:-translate-y-2"
        }`}
        style={{
          width: 140,
          height: 140,
        }}
      >
        {img ? (
          <Image
            src={img}
            alt={name}
            fill
            className="object-cover transition-ui duration-700 group-hover:rotate-1"
            sizes="140px"
            priority
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-[#111] text-3xl font-black tracking-[0.2em] text-[#00A8A8]"
            aria-hidden="true"
          >
            {initialsFor(name)}
          </div>
        )}
        {/* Updated overlay glow to #00A8A8 */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#00A8A8]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center w-full space-y-4">
        {/* Title Tag - Updated to #00A8A8 */}
        <div className="px-3 py-1 rounded-full bg-[#00A8A8]/10 border border-[#00A8A8]/20 max-w-full">
          <h2 className="text-[10px] font-mono font-bold text-[#00A8A8] uppercase tracking-[0.15em] text-center leading-relaxed">
            {title}
          </h2>
        </div>

        {/* Name - High contrast white */}
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#00A8A8] transition-colors"
            >
              {name}
            </a>
          ) : (
            name
          )}
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
}
