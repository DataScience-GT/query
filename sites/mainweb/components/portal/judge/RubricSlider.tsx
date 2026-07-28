"use client";

import React from "react";

interface RubricSliderProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}

export function RubricSlider({
  label,
  description,
  value,
  onChange,
}: RubricSliderProps) {
  const getScoreColor = (v: number) => {
    if (v <= 3) return "from-red-500 to-orange-500";
    if (v <= 6) return "from-yellow-500 to-amber-500";
    return "from-accent to-teal-500";
  };

  const getScoreLabel = (v: number) => {
    if (v <= 2) return "Poor";
    if (v <= 4) return "Fair";
    if (v <= 6) return "Good";
    if (v <= 8) return "Great";
    return "Excellent";
  };

  return (
    <div className="group">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 pr-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
            {label}
          </h3>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {description}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <div
            className={`text-3xl font-black bg-gradient-to-r ${getScoreColor(value)} bg-clip-text text-transparent tabular-nums`}
          >
            {value}
          </div>
          <span className="text-[10px] text-[var(--text-subtle)] font-medium uppercase tracking-wider">
            {getScoreLabel(value)}
          </span>
        </div>
      </div>

      {/* Slider Track */}
      <div className="relative h-12 flex items-center">
        <div className="absolute inset-x-0 h-2 bg-white/5 rounded-sm overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${getScoreColor(value)} transition-ui duration-150 ease-out`}
            style={{ width: `${(value - 1) * 11.11}%` }}
          />
        </div>
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-6 h-6 bg-white rounded-sm shadow-lg shadow-black/30 pointer-events-none transition-ui duration-150 ease-out border-2 border-white"
          style={{
            left: `calc(${(value - 1) * 11.11}% - 12px + ${(value - 1) * 0.24}%)`,
          }}
        >
          <div
            className={`absolute inset-1 rounded-sm bg-gradient-to-br ${getScoreColor(value)}`}
          />
        </div>
      </div>

      {/* Scale markers */}
      <div className="flex justify-between px-0.5 mt-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => onChange(n)}
            className={`w-5 h-5 flex items-center justify-center text-[10px] font-medium rounded transition-ui
                            ${
                              value === n
                                ? "text-[var(--text-primary)] bg-white/10"
                                : "text-gray-600 hover:text-[var(--text-muted)]"
                            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RubricSliderStyles() {
  return null;
}
