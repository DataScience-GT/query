'use client';

import React from 'react';

interface ProgressBarProps {
    percentage: number;
    className?: string;
}

export function ProgressBar({ percentage, className = '' }: ProgressBarProps) {
    return (
        <div className={`h-1 bg-white/5 relative ${className}`}>
            <div
                className="h-full bg-gradient-to-r from-[#EAFF2B] to-[#005a5a] transition-all duration-500 shadow-[0_0_10px_rgba(0,168,168,0.5)]"
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
}
