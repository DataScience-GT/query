"use client";

import React from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

type Hackathon = {
  id: string;
  name: string;
};

type CreateHackathonStepProps = {
  hackathons: Hackathon[];
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
  onCreateHackathon,
}: CreateHackathonStepProps) {
  return (
    <LiquidGlass className="rounded-none p-8">
      <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-6">
        Create Hackathon
      </h2>

      {/* Existing hackathons */}
      {hackathons && hackathons.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-[var(--text-subtle)] font-mono uppercase tracking-widest mb-3">
            Or select an existing event:
          </p>
          <div className="flex flex-wrap gap-2">
            {hackathons.map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => {
                  setSelectedHackathonId(h.id);
                  setActiveStep(2);
                }}
                className={`px-5 py-2.5 rounded-none font-bold text-xs uppercase tracking-widest transition-ui border ${
                  selectedHackathonId === h.id
                    ? "bg-accent/10 border-accent/50 text-[var(--text-primary)]"
                    : "bg-white/[0.02] border-[var(--border-subtle)] text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-white/5"
                }`}
              >
                {h.name}
              </button>
            ))}
          </div>
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-600 font-mono uppercase tracking-widest">
              or create new
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        </div>
      )}

      <div className="space-y-4 max-w-md">
        <input
          type="text"
          aria-label="Event name"
          placeholder="Event name (e.g. Hacklytics 2026)"
          value={hackathonName}
          onChange={(e) => setHackathonName(e.target.value)}
          className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono placeholder:text-gray-600 focus:outline-none focus:border-accent/40 transition-colors"
        />
        <input
          type="text"
          aria-label="Tracks, comma-separated"
          placeholder="Tracks (comma-separated, e.g. Sports, Finance)"
          value={hackathonTracks}
          onChange={(e) => setHackathonTracks(e.target.value)}
          className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono placeholder:text-gray-600 focus:outline-none focus:border-accent/40 transition-colors"
        />
        <input
          type="text"
          aria-label="Challenges, comma-separated"
          placeholder="Challenges (comma-separated, e.g. AWS, MongoDB)"
          value={hackathonChallenges}
          onChange={(e) => setHackathonChallenges(e.target.value)}
          className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono placeholder:text-gray-600 focus:outline-none focus:border-accent/40 transition-colors"
        />
        <button
          type="button"
          onClick={onCreateHackathon}
          disabled={!hackathonName.trim() || createHackathonPending}
          className="w-full px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-ui disabled:opacity-30 font-mono"
        >
          {createHackathonPending ? "Creating..." : "Create Event"}
        </button>
      </div>
    </LiquidGlass>
  );
}
