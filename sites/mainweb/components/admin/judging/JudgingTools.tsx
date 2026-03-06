'use client';

import React from 'react';

type JudgingToolsProps = {
    hackathons: any[];
    selectedHackathon: string | null;
    setSelectedHackathon: (id: string) => void;
    viewMode: 'results' | 'rooms' | 'judges';
    setViewMode: (mode: 'results' | 'rooms' | 'judges') => void;
    categories: string[];
    selectedCategory: string;
    setSelectedCategory: (cat: string) => void;
    tracks: string[];
    selectedTrack: string;
    setSelectedTrack: (track: string) => void;
};

export function JudgingTools({
    hackathons,
    selectedHackathon,
    setSelectedHackathon,
    viewMode,
    setViewMode,
    categories,
    selectedCategory,
    setSelectedCategory,
    tracks,
    selectedTrack,
    setSelectedTrack,
}: JudgingToolsProps) {
    return (
        <div className="flex flex-col gap-8 mb-12">
            {/* Hackathon Selector */}
            {hackathons && hackathons.length > 0 && (
                <div className="flex flex-col">
                    <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Select Target Event</label>
                    <div className="flex flex-wrap gap-3">
                        {hackathons.map((h) => (
                            <button
                                key={h.id}
                                onClick={() => setSelectedHackathon(h.id)}
                                className={`px-8 py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-300 border ${selectedHackathon === h.id
                                    ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white shadow-[0_0_20px_rgba(0,168,168,0.1)]'
                                    : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {h.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* View Mode Toggle */}
            {selectedHackathon && (
                <div className="flex flex-col">
                    <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">View Mode</label>
                    <div className="flex flex-wrap gap-3">
                        {(['results', 'rooms', 'judges'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 border font-mono ${viewMode === mode
                                    ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white shadow-[0_0_20px_rgba(0,168,168,0.1)]'
                                    : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {mode === 'results' ? 'Results' : mode === 'rooms' ? 'Room Assignments' : 'Judge Performance'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Category Filter */}
                {categories.length > 1 && (
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Filter By Category</label>
                        <div className="flex flex-wrap gap-3">
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-5 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-300 border ${selectedCategory === cat
                                        ? 'bg-white/10 border-white/20 text-white shadow-lg'
                                        : 'bg-white/[0.02] border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Track Filter */}
                {tracks.length > 1 && (
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Filter By Track</label>
                        <div className="flex flex-wrap gap-3">
                            {tracks.map((track) => (
                                <button
                                    key={track}
                                    onClick={() => setSelectedTrack(track)}
                                    className={`px-5 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-300 border ${selectedTrack === track
                                        ? 'bg-[#00A8A8]/20 border-[#00A8A8]/50 text-white shadow-lg'
                                        : 'bg-white/[0.02] border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5'
                                        }`}
                                >
                                    {track}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
