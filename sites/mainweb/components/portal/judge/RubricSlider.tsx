'use client';

import React from 'react';

interface RubricSliderProps {
    label: string;
    description: string;
    value: number;
    onChange: (value: number) => void;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
}

export function RubricSlider({
    label,
    description,
    value,
    onChange,
}: RubricSliderProps) {
    return (
        <div className="space-y-3">
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

            {/* Button-based scoring - much better for mobile */}
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                        key={num}
                        onClick={() => onChange(num)}
                        className={`
                            flex-1 py-3 rounded-lg font-bold text-sm transition-all active:scale-95
                            ${value === num
                                ? 'bg-[#00A8A8] text-black shadow-[0_0_15px_rgba(0,168,168,0.4)]'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 active:bg-white/15'
                            }
                        `}
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );
}

// Keep for backward compatibility but no longer needed
export function RubricSliderStyles() {
    return null;
}
