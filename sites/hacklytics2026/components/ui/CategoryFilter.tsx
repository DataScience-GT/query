"use client";

import React from 'react';
import { categories } from '../sections/Schedule/data';

interface Props {
  selected: string;
  onSelect: (id: string) => void;
  bgColor?: string;
}

export default function CategoryFilter({ selected, onSelect, bgColor }: Props) {
  const buttonBg = bgColor || '#FE97B0';

  return (
    <div style={{ backgroundColor: buttonBg }} className="py-6 px-6">
      <div className="flex flex-wrap justify-center gap-3">
        <button
          key="all"
          onClick={() => onSelect('all')}
          className={`flex items-center space-x-2 rounded-full py-2 px-4 border transition
            ${selected === 'all' ? 'bg-white text-pink-600' : ''}`}
          style={{
            backgroundColor: selected === 'all' ? 'white' : buttonBg,
            color: selected === 'all' ? '#FE97B0' : 'white',
          }}
        >
          <span className="font-medium text-sm">All</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`flex items-center space-x-2 rounded-full py-2 px-4 border transition
              ${selected === cat.id ? 'bg-white text-pink-600' : ''}`}
            style={{
              backgroundColor: selected === cat.id ? 'white' : buttonBg,
              color: selected === cat.id ? '#FE97B0' : 'white',
            }}
          >
            <span
              className="w-6 h-6 bg-center bg-no-repeat bg-contain inline-block"
              style={{ backgroundImage: `url(${cat.icon})` }}
            />
            <span className="font-medium text-sm">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
