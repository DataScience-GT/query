'use client';

import React from 'react';

interface RubricSliderProps {
    label: string;
    description: string;
    value: number;
    onChange: (value: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

export function RubricSlider({
    label,
    description,
    value,
    onChange,
    isExpanded,
    onToggleExpand,
}: RubricSliderProps) {
    return (
        <div className="space-y-2">
            <button
                onClick={onToggleExpand}
                className="w-full flex items-center justify-between text-left"
            >
                <span className="text-xs font-semibold text-white">{label}</span>
                <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-[#00A8A8] min-w-[2rem] text-right">
                        {value}
                    </span>
                    <svg
                        className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {isExpanded && (
                <p className="text-[10px] text-gray-400 font-mono pl-1 pb-1">{description}</p>
            )}

            {/* Slider */}
            <div className="relative">
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full h-12 appearance-none bg-transparent cursor-pointer touch-pan-y rubric-slider"
                    style={{
                        background: `linear-gradient(to right, #00A8A8 0%, #00A8A8 ${(value - 1) * 11.11}%, rgba(255,255,255,0.1) ${(value - 1) * 11.11}%, rgba(255,255,255,0.1) 100%)`,
                        borderRadius: '8px',
                    }}
                />
                <div className="flex justify-between text-[8px] text-gray-600 font-mono px-1 -mt-1">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                </div>
            </div>
        </div>
    );
}

// Slider styles component to be included in the page
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
        width: 28px;
        height: 28px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 2px 8px rgba(0,0,0,0.3);
        border: 3px solid #00A8A8;
      }
      .rubric-slider::-moz-range-thumb {
        width: 28px;
        height: 28px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 2px 8px rgba(0,0,0,0.3);
        border: 3px solid #00A8A8;
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
