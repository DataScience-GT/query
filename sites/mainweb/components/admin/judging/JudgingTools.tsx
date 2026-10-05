"use client";

import React from "react";
import { chip, label, tab, tabList } from "@/components/portal/ui";

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
    <div className="flex flex-col gap-6 mb-10">
      {/* Hackathon Selector */}
      {hackathons && hackathons.length > 0 && (
        <div className="flex flex-col">
          <label className={`${label} mb-2`}>
            Hackathon
          </label>
          <div className="flex flex-wrap gap-2">
            {hackathons.map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => setSelectedHackathon(h.id)}
                aria-pressed={selectedHackathon === h.id}
                className={chip(selectedHackathon === h.id)}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      {selectedHackathon && (
        <div role="tablist" aria-label="View" className={tabList}>
          {(["results", "rooms", "judges"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={tab(viewMode === mode)}
            >
              {mode === "results"
                ? "Results"
                : mode === "rooms"
                  ? "Room assignments"
                  : "Judge performance"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category Filter */}
        {categories.length > 1 && (
          <div className="flex flex-col">
            <label className={`${label} mb-2`}>
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  aria-pressed={selectedCategory === cat}
                  className={chip(selectedCategory === cat)}
                >
                  {cat === "ALL" ? "All" : cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Track Filter */}
        {tracks.length > 1 && (
          <div className="flex flex-col">
            <label className={`${label} mb-2`}>
              Track
            </label>
            <div className="flex flex-wrap gap-2">
              {tracks.map((track) => (
                <button
                  type="button"
                  key={track}
                  onClick={() => setSelectedTrack(track)}
                  aria-pressed={selectedTrack === track}
                  className={chip(selectedTrack === track)}
                >
                  {track === "ALL" ? "All" : track}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
