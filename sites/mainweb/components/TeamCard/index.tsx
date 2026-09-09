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
      className="public-card group relative w-full p-8 pt-24 flex flex-col items-center"
      style={{ minHeight: 350 }}
    >
      <div
        className={`absolute -top-12 left-1/2 -translate-x-1/2 overflow-hidden border border-[var(--rule)] bg-[var(--paper)] ${
          zoom ? "group-hover:scale-110" : "group-hover:-translate-y-1"
        } transition-ui duration-500`}
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
            className="object-cover"
            sizes="140px"
            priority
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-[var(--navy)] text-3xl public-ui font-bold tracking-tight text-[var(--buzz)]"
            aria-hidden="true"
          >
            {initialsFor(name)}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center w-full space-y-4">
        <p className="public-chip text-[var(--trace)] border-[var(--trace)]/30">
          {title}
        </p>

        <h2 className="public-display text-2xl">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--trace)]"
            >
              {name}
            </a>
          ) : (
            name
          )}
        </h2>

        {children && (
          <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
            {children}
          </p>
        )}
      </div>
    </div>
  );
}
