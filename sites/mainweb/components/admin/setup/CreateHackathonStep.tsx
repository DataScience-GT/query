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
  /** `datetime-local` strings. The submission window is derived from the
   *  hacking start time, so a wrong value here shifts every deadline. */
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  hackingStartTime: string;
  setHackingStartTime: (value: string) => void;
  createHackathonPending: boolean;
  /** Server-side refusal, e.g. the CONFLICT raised when a hackathon with this
   *  name already exists. Without somewhere to render it the button simply
   *  does nothing. */
  createHackathonError?: string | null;
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
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  hackingStartTime,
  setHackingStartTime,
  createHackathonPending,
  createHackathonError,
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
        {/* Real dates, not "now" and "now + 24h".
            createHackathon used to stamp both from the moment the button was
            pressed, and the whole submission window is derived from the hacking
            start time — so every deadline the product enforces was anchored to
            an accident. */}
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--text-subtle)] mb-1">
              Event starts
            </span>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent/40 transition-colors [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--text-subtle)] mb-1">
              Event ends
            </span>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent/40 transition-colors [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--text-subtle)] mb-1">
              Hacking starts (team and submission windows are measured from
              this)
            </span>
            <input
              type="datetime-local"
              value={hackingStartTime}
              onChange={(e) => setHackingStartTime(e.target.value)}
              className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent/40 transition-colors [color-scheme:dark]"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onCreateHackathon}
          disabled={
            !hackathonName.trim() ||
            !startDate ||
            !endDate ||
            createHackathonPending
          }
          className="w-full px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-ui disabled:opacity-30 font-mono"
        >
          {createHackathonPending ? "Creating..." : "Create Event"}
        </button>
        {createHackathonError && (
          <p
            role="alert"
            className="text-xs font-mono text-red-400 leading-relaxed"
          >
            {createHackathonError}
          </p>
        )}
      </div>
    </LiquidGlass>
  );
}
