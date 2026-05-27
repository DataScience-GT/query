"use client";

import React from 'react';
import { categories } from '../sections/Schedule/data';

interface Props {
  selected: string;
  onSelect: (id: string) => void;
  bgColor?: string;
}

export default function CategoryFilter({ selected, onSelect, bgColor }: Props) {
  const buttonBg = bgColor || '#0b0c10';

  return (
    <div style={{ backgroundColor: buttonBg }} className="py-6 px-6 border-y border-gridline">
      <div className="flex flex-wrap justify-center gap-3">
        <button
          key="all"
          onClick={() => onSelect('all')}
          className={`font-mono text-xs uppercase tracking-widest px-4 py-2 border transition-colors ${
            selected === 'all' 
              ? 'bg-white text-black font-bold' 
              : 'bg-transparent text-gray-400 border-gridline hover:border-white'
          }`}
        >
          All
        </button>
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`font-mono text-xs uppercase tracking-widest px-4 py-2 border transition-colors flex items-center gap-2 ${
              selected === cat.id 
                ? 'bg-white/10 text-white font-bold border-current' 
                : 'bg-transparent text-gray-400 border-gridline hover:border-white'
            }`}
          >
            <span className={`w-3 h-3 ${cat.color.replace('text-', 'bg-')}`}></span>
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
