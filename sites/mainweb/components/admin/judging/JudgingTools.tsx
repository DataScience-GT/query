"use client";

import React from "react";

type Hackathon = {
  id: string;
  name: string;
};

type JudgingToolsProps = {
  hackathons: Hackathon[];
  selectedHackathon: string | null;
  setSelectedHackathon: (id: string) => void;
  viewMode: "results" | "rooms" | "judges";
  setViewMode: (mode: "results" | "rooms" | "judges") => void;
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
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Hackathon
          </label>
          <div className="flex flex-wrap gap-3">
            {hackathons.map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => setSelectedHackathon(h.id)}
                className={`px-5 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-ui border ${
                  selectedHackathon === h.id
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
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
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            View
          </label>
          <div className="flex flex-wrap gap-3">
            {(["results", "rooms", "judges"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-5 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-ui border ${
                  viewMode === mode
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                }`}
              >
                {mode === "results"
                  ? "Results"
                  : mode === "rooms"
                    ? "Room assignments"
                    : "Judge performance"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Category Filter */}
        {categories.length > 1 && (
          <div className="flex flex-col">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Category
            </label>
            <div className="flex flex-wrap gap-3">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-ui border ${
                    selectedCategory === cat
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
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
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Track
            </label>
            <div className="flex flex-wrap gap-3">
              {tracks.map((track) => (
                <button
                  type="button"
                  key={track}
                  onClick={() => setSelectedTrack(track)}
                  className={`px-3 py-1.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-ui border ${
                    selectedTrack === track
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
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
