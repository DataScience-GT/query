"use client";

import React from 'react';

interface Prize {
  image: string;
  label?: string;
}

interface PrizesProps {
  prizes: Prize[];
}

const Prizes: React.FC<PrizesProps> = ({ prizes }) => {
  return (
    <div className="text-center mb-16">
      <h2 className="text-5xl font-bold text-white mb-12 drop-shadow-lg">
        Prizes
      </h2>
      <div className="flex flex-wrap justify-center gap-8">
        {prizes.map((prize, index) => (
          <div key={index} className="relative w-80 h-40 cursor-pointer">
            <div
              className="w-full h-full bg-cover bg-center hover:scale-105 transition-transform duration-300"
              style={{ backgroundImage: `url('${prize.image}')` }}
            />
            {prize.label && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/4 bg-white/20 backdrop-blur-sm text-white text-sm px-2 py-1 rounded">
                {prize.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Prizes;
