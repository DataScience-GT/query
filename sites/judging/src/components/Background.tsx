import React from 'react';

const Background = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`pointer-events-none select-none ${className}`}>
      {/* Primary Glow */}
      <div className="absolute inset-0 bg-[#050505]" />

      {/* Secondary Orbital Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[120px]" />

      {/* Technical Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff1a 1px, transparent 1px),
                            linear-gradient(to bottom, #ffffff1a 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(circle at center, black, transparent 80%)'
        }}
      />
    </div>
  );
};

export default Background;
