'use client';

import { useState } from 'react';
import Image from 'next/image';

const ZONE_MAPS = [
    { id: 1, name: 'Zone A', location: 'Klaus Atrium', src: '/images/zones/1.png' },
    { id: 2, name: 'Zone B', location: 'Klaus 1456', src: '/images/zones/2.png' },
    { id: 3, name: 'Zone C', location: 'Klaus 1447', src: '/images/zones/3.png' },
    { id: 4, name: 'Zone D', location: 'Klaus 1116', src: '/images/zones/4.png' },
    { id: 5, name: 'Zone E', location: 'Klaus 1443', src: '/images/zones/5.png' },
    { id: 6, name: 'Zone F', location: 'Klaus 2456', src: '/images/zones/6.png' },
];

interface ZoneMapModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ZoneMapModal({ isOpen, onClose }: ZoneMapModalProps) {
    const [activeIndex, setActiveIndex] = useState(0);

    if (!isOpen) return null;

    const activeMap = ZONE_MAPS[activeIndex];
    if (!activeMap) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col"
            onClick={onClose}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <div>
                    <h2 className="text-lg font-bold text-white">Venue Maps</h2>
                    <p className="text-xs text-gray-500 font-mono">{activeMap.name} — {activeMap.location}</p>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-sm bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Zone Tabs */}
            <div
                className="flex gap-1 px-4 py-2 overflow-x-auto shrink-0 border-b border-white/5"
                onClick={(e) => e.stopPropagation()}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {ZONE_MAPS.map((zone, idx) => (
                    <button
                        key={zone.id}
                        onClick={() => setActiveIndex(idx)}
                        className={`px-3 py-1.5 rounded-none text-xs font-bold whitespace-nowrap transition-all ${idx === activeIndex
                            ? 'bg-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/30'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
                            }`}
                    >
                        {zone.name}
                    </button>
                ))}
            </div>

            {/* Map Image */}
            <div
                className="flex-1 overflow-auto p-4 flex items-start justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative w-full max-w-lg bg-white rounded-none overflow-hidden shadow-2xl">
                    <Image
                        src={activeMap.src}
                        alt={`${activeMap.name} - ${activeMap.location}`}
                        width={800}
                        height={1000}
                        className="w-full h-auto"
                        priority
                    />
                </div>
            </div>

            {/* Nav Arrows */}
            <div
                className="flex items-center justify-between px-4 py-3 border-t border-white/10 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
                    disabled={activeIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-none bg-white/5 border border-white/10 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Prev
                </button>
                <div className="flex gap-1.5">
                    {ZONE_MAPS.map((_, idx) => (
                        <div
                            key={idx}
                            className={`w-2 h-2 rounded-sm transition-all ${idx === activeIndex ? 'bg-[#00E5FF] scale-125' : 'bg-white/20'
                                }`}
                        />
                    ))}
                </div>
                <button
                    onClick={() => setActiveIndex(Math.min(ZONE_MAPS.length - 1, activeIndex + 1))}
                    disabled={activeIndex === ZONE_MAPS.length - 1}
                    className="flex items-center gap-2 px-4 py-2 rounded-none bg-white/5 border border-white/10 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

/** Button to trigger the zone map modal */
export function ViewMapButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-none bg-white/[0.05] border border-white/10 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all ${className}`}
        >
            <svg className="w-5 h-5 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            View Venue Maps
        </button>
    );
}
