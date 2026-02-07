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
        <div className="space-y-2">
            {/* Label and current score */}
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                    <span className="text-sm font-bold text-white block">{label}</span>
                    <span className="text-[10px] text-gray-500 font-mono block mt-0.5">{description}</span>
                </div>
                <span className="text-2xl font-black text-[#00A8A8] tabular-nums min-w-[2.5rem] text-right">
                    {value}
                </span>
            </div>

            {/* Slider - Large touch target */}
            <div className="relative py-2">
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full h-14 appearance-none bg-transparent cursor-pointer touch-pan-y rubric-slider"
                    style={{
                        background: `linear-gradient(to right, #00A8A8 0%, #00A8A8 ${(value - 1) * 11.11}%, rgba(255,255,255,0.1) ${(value - 1) * 11.11}%, rgba(255,255,255,0.1) 100%)`,
                        borderRadius: '12px',
                    }}
                />
                <div className="flex justify-between text-xs text-gray-500 font-mono px-1 mt-1">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                </div>
            </div>
        </div>
    );
}

// Slider styles for the page
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
        width: 36px;
        height: 36px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 4px 12px rgba(0,0,0,0.4);
        border: 4px solid #00A8A8;
      }
      .rubric-slider::-moz-range-thumb {
        width: 36px;
        height: 36px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 4px 12px rgba(0,0,0,0.4);
        border: 4px solid #00A8A8;
      }
      .rubric-slider:active::-webkit-slider-thumb {
        transform: scale(1.15);
      }
      .rubric-slider:active::-moz-range-thumb {
        transform: scale(1.15);
      }
    `}</style>
    );
}
