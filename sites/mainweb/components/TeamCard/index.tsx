"use client";

import type { ReactNode, HTMLAttributes } from "react";
import type { StaticImageData } from "next/image";
import Image from "next/image";

interface TeamCardProps extends HTMLAttributes<HTMLDivElement> {
  img: string | StaticImageData;
  name: string;
  title: string;
  zoom?: boolean;
  children?: ReactNode;
}

export default function TeamCard({
  img,
  name,
  title,
  zoom,
  children,
  ...rest
}: TeamCardProps) {
  return (
    <div
      {...rest}
      className="group relative w-full figure-card p-8 pt-24 flex flex-col items-center transition-ui duration-300 hover:border-[#00A8A8]/40"
      style={{ minHeight: 350 }}
    >
      <div
        className={`absolute -top-12 left-1/2 -translate-x-1/2 overflow-hidden border border-white/10 bg-[#050505] transition-ui duration-500 ${
          zoom ? "group-hover:scale-105" : "group-hover:-translate-y-1"
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
          className="object-cover"
          sizes="140px"
          priority
        />
      </div>

      <div className="flex flex-col items-center text-center w-full space-y-3">
        <p className="page-kicker">{title}</p>
        <h2 className="text-2xl font-display text-white tracking-tight">
          {name}
        </h2>

        {children && (
          <p className="text-sm text-gray-400 leading-relaxed">{children}</p>
        )}
      </div>
    </div>
  );
}
