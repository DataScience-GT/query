'use client';

import React from 'react';

interface BackgroundProps {
  className?: string;
}

/**
 * Decorative background component used across portal pages.
 * Renders a subtle grid pattern with radial gradient overlay.
 */
export default function Background({ className = '' }: BackgroundProps) {
  return (
    <div className={className} aria-hidden="true">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05)_0%,transparent_70%)]" />
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
    </div>
  );
}
