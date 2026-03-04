"use client";

import React from 'react';

interface Props {
  days: string[];
  selectedDay: string;
  onSelect: (day: string) => void;
}

export default function DayButtons({ days, selectedDay, onSelect }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-4 mb-8">
      {days.map(day => (
        <button
          key={day}
          onClick={() => onSelect(day)}
          className={`px-6 py-3 rounded-full font-bold text-lg transition hover:scale-105 ${
            selectedDay === day
              ? 'bg-pink-500 text-white'
              : 'bg-gray-200 text-gray-800'
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  );
}
