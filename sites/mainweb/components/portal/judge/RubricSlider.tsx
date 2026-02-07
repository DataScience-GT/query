'use client';

import React from 'react';

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
    return (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
            {/* Label row */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-white">{label}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                </div>
                <div className="ml-4 bg-[#00A8A8]/20 px-3 py-1.5 rounded-lg">
                    <span className="text-xl font-black text-[#00A8A8] tabular-nums">
                        {value}
                    </span>
                    <span className="text-xs text-gray-500">/10</span>
                </div>
            </div>

            {/* Compact Slider */}
            <div className="relative">
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full h-8 appearance-none bg-transparent cursor-pointer touch-pan-y rubric-slider"
                    style={{
                        background: `linear-gradient(to right, #00A8A8 0%, #00A8A8 ${(value - 1) * 11.11}%, rgba(255,255,255,0.08) ${(value - 1) * 11.11}%, rgba(255,255,255,0.08) 100%)`,
                        borderRadius: '6px',
                    }}
                />
                <div className="flex justify-between text-[10px] text-gray-600 font-mono px-0.5 mt-1">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                    <span>7</span>
                    <span>8</span>
                    <span>9</span>
                    <span>10</span>
                </div>
            </div>
        </div>
    );
}

// Slider styles - smaller thumb for compact feel
export function RubricSliderStyles() {
    return (
        <style jsx global>{`
      .rubric-slider {
        -webkit-appearance: none;
        appearance: none;
      }
      .rubric-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 12px rgba(0, 168, 168, 0.4), 0 2px 6px rgba(0,0,0,0.3);
        border: 3px solid #00A8A8;
        transition: transform 0.1s;
      }
      .rubric-slider::-moz-range-thumb {
        width: 24px;
        height: 24px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 12px rgba(0, 168, 168, 0.4), 0 2px 6px rgba(0,0,0,0.3);
        border: 3px solid #00A8A8;
        transition: transform 0.1s;
      }
      .rubric-slider:active::-webkit-slider-thumb {
        transform: scale(1.1);
      }
      .rubric-slider:active::-moz-range-thumb {
        transform: scale(1.1);
      }
    `}</style>
    );
}
