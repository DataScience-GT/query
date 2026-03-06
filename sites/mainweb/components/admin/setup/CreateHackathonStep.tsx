'use client';

import React from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type CreateHackathonStepProps = {
    hackathons: any[];
    selectedHackathonId: string | null;
    setSelectedHackathonId: (id: string | null) => void;
    setActiveStep: (step: number) => void;
    hackathonName: string;
    setHackathonName: (name: string) => void;
    hackathonTracks: string;
    setHackathonTracks: (tracks: string) => void;
    hackathonChallenges: string;
    setHackathonChallenges: (challenges: string) => void;
    createHackathonPending: boolean;
    onCreateHackathon: () => void;
};

export function CreateHackathonStep({
    hackathons,
    selectedHackathonId,
    setSelectedHackathonId,
    setActiveStep,
    hackathonName,
    setHackathonName,
    hackathonTracks,
    setHackathonTracks,
    hackathonChallenges,
    setHackathonChallenges,
    createHackathonPending,
    onCreateHackathon
}: CreateHackathonStepProps) {
    return (
        <LiquidGlass className="rounded-lg p-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">Create Hackathon</h2>

            {/* Existing hackathons */}
            {hackathons && hackathons.length > 0 && (
                <div className="mb-8">
                    <p className="text-xs text-gray-500 font-mono uppercase tracking-widest mb-3">Or select an existing event:</p>
                    <div className="flex flex-wrap gap-2">
                        {hackathons.map((h) => (
                            <button
                                key={h.id}
                                onClick={() => { setSelectedHackathonId(h.id); setActiveStep(2); }}
                                className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border ${selectedHackathonId === h.id
                                    ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white'
                                    : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {h.name}
                            </button>
                        ))}
                    </div>
                    <div className="my-6 flex items-center gap-4">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-gray-600 font-mono uppercase tracking-widest">or create new</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>
                </div>
            )}

            <div className="space-y-4 max-w-md">
                <input
                    type="text"
                    placeholder="Event name (e.g. Hacklytics 2026)"
                    value={hackathonName}
                    onChange={(e) => setHackathonName(e.target.value)}
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/40 transition-colors"
                />
                <input
                    type="text"
                    placeholder="Tracks (comma-separated, e.g. Sports, Finance)"
                    value={hackathonTracks}
                    onChange={(e) => setHackathonTracks(e.target.value)}
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/40 transition-colors"
                />
                <input
                    type="text"
                    placeholder="Challenges (comma-separated, e.g. AWS, MongoDB)"
                    value={hackathonChallenges}
                    onChange={(e) => setHackathonChallenges(e.target.value)}
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/40 transition-colors"
                />
                <button
                    onClick={onCreateHackathon}
                    disabled={!hackathonName.trim() || createHackathonPending}
                    className="w-full px-8 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all disabled:opacity-30 font-mono"
                >
                    {createHackathonPending ? 'Creating...' : 'Create Event'}
                </button>
            </div>
        </LiquidGlass>
    );
}
