"use client";

import React, { useMemo, memo } from "react";

/* ─── SVG Flower Variants ─── */

// Cherry blossom — 5 rounded petals with a warm center
const CherryBlossom: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ opacity }}>
    <defs>
      <radialGradient id={`cb-${color.replace('#','')}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity="0.9" />
        <stop offset="70%" stopColor={color} stopOpacity="0.5" />
        <stop offset="100%" stopColor={color} stopOpacity="0.1" />
      </radialGradient>
    </defs>
    {[0, 72, 144, 216, 288].map((angle, i) => (
      <ellipse
        key={i}
        cx="50"
        cy="25"
        rx="14"
        ry="22"
        fill={`url(#cb-${color.replace('#','')})`}
        transform={`rotate(${angle} 50 50)`}
      />
    ))}
    <circle cx="50" cy="50" r="7" fill="#ffe066" opacity="0.9" />
    <circle cx="50" cy="50" r="3" fill="#fff" opacity="0.8" />
  </svg>
);

// Lotus petal — elegant elongated petals in layers
const LotusFlower: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" style={{ opacity }}>
    <defs>
      <radialGradient id={`lt-${color.replace('#','')}`} cx="50%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
        <stop offset="40%" stopColor={color} stopOpacity="0.7" />
        <stop offset="100%" stopColor={color} stopOpacity="0.15" />
      </radialGradient>
    </defs>
    {/* Outer petals */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
      <ellipse
        key={`outer-${i}`}
        cx="60"
        cy="20"
        rx="10"
        ry="30"
        fill={`url(#lt-${color.replace('#','')})`}
        transform={`rotate(${angle} 60 60)`}
      />
    ))}
    {/* Inner petals */}
    {[22, 67, 112, 157, 202, 247, 292, 337].map((angle, i) => (
      <ellipse
        key={`inner-${i}`}
        cx="60"
        cy="30"
        rx="7"
        ry="20"
        fill={color}
        opacity="0.4"
        transform={`rotate(${angle} 60 60)`}
      />
    ))}
    <circle cx="60" cy="60" r="8" fill="#ccff00" opacity="0.7" />
    <circle cx="60" cy="60" r="3.5" fill="#fff" opacity="0.85" />
  </svg>
);

// Small daisy — simple 6-petal flower good for background scatter
const SmallDaisy: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg width={size} height={size} viewBox="0 0 60 60" fill="none" style={{ opacity }}>
    {[0, 60, 120, 180, 240, 300].map((angle, i) => (
      <ellipse
        key={i}
        cx="30"
        cy="12"
        rx="6"
        ry="14"
        fill={color}
        opacity="0.65"
        transform={`rotate(${angle} 30 30)`}
      />
    ))}
    <circle cx="30" cy="30" r="5" fill="#ffe066" opacity="0.85" />
  </svg>
);

// Falling petal — single floating petal shape
const FallingPetal: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg width={size} height={size * 1.6} viewBox="0 0 30 48" fill="none" style={{ opacity }}>
    <path
      d="M15 0 C25 8 28 20 25 32 C22 40 18 46 15 48 C12 46 8 40 5 32 C2 20 5 8 15 0Z"
      fill={color}
      opacity="0.6"
    />
    <path
      d="M15 4 C15 15 15 30 15 44"
      stroke="#fff"
      strokeWidth="0.5"
      opacity="0.3"
    />
  </svg>
);

// Abstract bloom spiral — a tech-organic spiral flower
const SpiralBloom: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ opacity }}>
    <defs>
      <radialGradient id={`sp-${color.replace('#','')}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity="0.8" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
    {Array.from({ length: 12 }, (_, i) => {
      const angle = i * 30;
      const len = 18 + (i % 3) * 6;
      return (
        <ellipse
          key={i}
          cx="40"
          cy={40 - len}
          rx={4 + (i % 2) * 2}
          ry={len * 0.7}
          fill={`url(#sp-${color.replace('#','')})`}
          transform={`rotate(${angle} 40 40)`}
        />
      );
    })}
    <circle cx="40" cy="40" r="6" fill={color} opacity="0.5" />
    <circle cx="40" cy="40" r="3" fill="#fff" opacity="0.7" />
  </svg>
);


/* ─── Flower Data Generator ─── */

interface FlowerInstance {
  id: number;
  type: 'cherry' | 'lotus' | 'daisy' | 'petal' | 'spiral';
  x: number;       // % from left
  y: number;       // % from top (of total page height)
  size: number;    // px
  color: string;
  opacity: number;
  rotation: number;
  animDelay: number;
  animDuration: number;
  driftClass: string;
}

const COLORS = [
  '#ff007f', // bloom pink
  '#ff3399', // hot pink
  '#ff66b2', // soft pink
  '#cc44ff', // purple
  '#9d00ff', // deep purple
  '#00f3ff', // cyan
  '#66ffee', // light cyan
  '#ccff00', // lime
  '#ff9ecd', // rose
  '#ffb3d9', // light rose
  '#e0aaff', // lavender
  '#7df9ff', // electric blue
];

const DRIFT_CLASSES = [
  'flower-drift-1',
  'flower-drift-2',
  'flower-drift-3',
  'flower-drift-4',
  'flower-sway-1',
  'flower-sway-2',
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateFlowers(count: number): FlowerInstance[] {
  const rand = seededRandom(42);
  const types: FlowerInstance['type'][] = ['cherry', 'lotus', 'daisy', 'petal', 'spiral'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    type: types[Math.floor(rand() * types.length)],
    x: rand() * 100,
    y: rand() * 100,
    size: 16 + rand() * 50,
    color: COLORS[Math.floor(rand() * COLORS.length)],
    opacity: 0.15 + rand() * 0.35,
    rotation: rand() * 360,
    animDelay: rand() * 20,
    animDuration: 15 + rand() * 25,
    driftClass: DRIFT_CLASSES[Math.floor(rand() * DRIFT_CLASSES.length)],
  }));
}


/* ─── Render Component ─── */

const FlowerRenderer = memo(function FlowerRenderer({ flower }: { flower: FlowerInstance }) {
  const props = { size: flower.size, color: flower.color, opacity: flower.opacity };
  
  const svgElement = useMemo(() => {
    switch (flower.type) {
      case 'cherry': return <CherryBlossom {...props} />;
      case 'lotus': return <LotusFlower {...props} />;
      case 'daisy': return <SmallDaisy {...props} />;
      case 'petal': return <FallingPetal {...props} />;
      case 'spiral': return <SpiralBloom {...props} />;
    }
  }, [flower.type, props.size, props.color, props.opacity]);

  return (
    <div
      className={`absolute pointer-events-none ${flower.driftClass}`}
      style={{
        left: `${flower.x}%`,
        top: `${flower.y}%`,
        transform: `rotate(${flower.rotation}deg)`,
        animationDelay: `${flower.animDelay}s`,
        animationDuration: `${flower.animDuration}s`,
        zIndex: 1,
        contain: 'layout style paint',
      }}
    >
      {svgElement}
    </div>
  );
});


/* ─── Main Floating Flowers Component ─── */

export default function FloatingFlowers({ count = 55 }: { count?: number }) {
  const flowers = useMemo(() => generateFlowers(count), [count]);

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 2 }}
      aria-hidden="true"
    >
      {flowers.map((flower) => (
        <FlowerRenderer key={flower.id} flower={flower} />
      ))}
    </div>
  );
}


/* ─── Section Divider Flower Cluster ─── */
// Decorative flower clusters to place between sections

export function FlowerDivider({ variant = 'pink' }: { variant?: 'pink' | 'cyan' | 'lime' | 'purple' }) {
  const colorMap = {
    pink: ['#ff007f', '#ff66b2', '#ff9ecd'],
    cyan: ['#00f3ff', '#66ffee', '#7df9ff'],
    lime: ['#ccff00', '#b8e600', '#99cc00'],
    purple: ['#9d00ff', '#cc44ff', '#e0aaff'],
  };
  const colors = colorMap[variant];

  return (
    <div className="relative w-full flex justify-center items-center py-8 pointer-events-none" aria-hidden="true">
      {/* Central glow */}
      <div className={`absolute w-[300px] h-[100px] rounded-full blur-[60px] opacity-20`}
           style={{ backgroundColor: colors[0] }} />
      
      {/* Flower cluster */}
      <div className="relative flex items-center gap-2">
        {/* Left scatter */}
        <div className="flower-sway-1" style={{ animationDuration: '8s' }}>
          <SmallDaisy size={20} color={colors[2]} opacity={0.4} />
        </div>
        <div className="flower-sway-2 -mt-4" style={{ animationDuration: '10s', animationDelay: '1s' }}>
          <FallingPetal size={14} color={colors[1]} opacity={0.5} />
        </div>
        <div className="flower-drift-1" style={{ animationDuration: '12s', animationDelay: '0.5s' }}>
          <CherryBlossom size={32} color={colors[0]} opacity={0.5} />
        </div>
        
        {/* Center line */}
        <div className="w-16 md:w-32 h-[1px] mx-4" style={{ background: `linear-gradient(to right, transparent, ${colors[0]}60, transparent)` }} />
        
        {/* Center flower */}
        <div className="flower-sway-1" style={{ animationDuration: '7s' }}>
          <LotusFlower size={45} color={colors[0]} opacity={0.6} />
        </div>
        
        {/* Center line */}
        <div className="w-16 md:w-32 h-[1px] mx-4" style={{ background: `linear-gradient(to right, transparent, ${colors[0]}60, transparent)` }} />
        
        {/* Right scatter */}
        <div className="flower-drift-2" style={{ animationDuration: '11s', animationDelay: '2s' }}>
          <CherryBlossom size={28} color={colors[1]} opacity={0.45} />
        </div>
        <div className="flower-sway-1 -mt-3" style={{ animationDuration: '9s', animationDelay: '1.5s' }}>
          <FallingPetal size={12} color={colors[0]} opacity={0.5} />
        </div>
        <div className="flower-sway-2" style={{ animationDuration: '10s' }}>
          <SmallDaisy size={18} color={colors[2]} opacity={0.35} />
        </div>
      </div>
    </div>
  );
}


/* ─── Corner Flower Accent ─── */
// For placing in corners of section cards

export function FlowerAccent({ 
  position = 'top-right', 
  color = '#ff007f',
  size = 40 
}: { 
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  color?: string;
  size?: number;
}) {
  const positionClasses = {
    'top-right': '-top-3 -right-3',
    'top-left': '-top-3 -left-3',
    'bottom-right': '-bottom-3 -right-3',
    'bottom-left': '-bottom-3 -left-3',
  };

  return (
    <div 
      className={`absolute ${positionClasses[position]} pointer-events-none flower-sway-1 z-20`}
      style={{ animationDuration: '8s' }}
      aria-hidden="true"
    >
      <CherryBlossom size={size} color={color} opacity={0.5} />
    </div>
  );
}


/* ─── Vine/Trailing Flowers ─── */
// Vertical vine of flowers for side decoration

export function FlowerVine({ 
  side = 'left', 
  colors = ['#ff007f', '#ff66b2', '#cc44ff'],
  flowerCount = 6 
}: { 
  side?: 'left' | 'right';
  colors?: string[];
  flowerCount?: number;
}) {
  const rand = seededRandom(side === 'left' ? 77 : 99);
  
  const vines = Array.from({ length: flowerCount }, (_, i) => ({
    type: (['cherry', 'daisy', 'petal'] as const)[Math.floor(rand() * 3)],
    offset: 5 + rand() * 20,
    y: (100 / flowerCount) * i + rand() * 10,
    size: 14 + rand() * 22,
    color: colors[Math.floor(rand() * colors.length)],
    opacity: 0.2 + rand() * 0.3,
    delay: rand() * 10,
  }));

  return (
    <div 
      className={`absolute top-0 bottom-0 ${side === 'left' ? 'left-0' : 'right-0'} w-24 pointer-events-none overflow-hidden`}
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {/* Vine stem */}
      <div 
        className={`absolute top-0 bottom-0 ${side === 'left' ? 'left-6' : 'right-6'} w-[1px]`}
        style={{
          background: `linear-gradient(to bottom, transparent, ${colors[0]}20, ${colors[1]}15, transparent)`,
        }}
      />
      
      {vines.map((v, i) => {
        const FlowerComponent = v.type === 'cherry' ? CherryBlossom : v.type === 'daisy' ? SmallDaisy : FallingPetal;
        return (
          <div
            key={i}
            className="absolute flower-sway-1"
            style={{
              [side]: `${v.offset}px`,
              top: `${v.y}%`,
              animationDelay: `${v.delay}s`,
              animationDuration: `${8 + v.delay}s`,
            }}
          >
            <FlowerComponent size={v.size} color={v.color} opacity={v.opacity} />
          </div>
        );
      })}
    </div>
  );
}
