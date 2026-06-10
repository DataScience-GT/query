"use client";

import React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import type { HackathonStatus } from "@/components/admin/hackathons/constants";

export function HackathonCard({
  hackathon,
  onEdit,
  onStatusChange,
}: {
  hackathon: {
    id: string;
    name: string;
    description?: string | null;
    location?: string | null;
    startDate: Date | string;
    endDate: Date | string;
    status: HackathonStatus;
    isPublic: boolean;
    currentParticipants: number;
    maxParticipants?: number | null;
  };
  onEdit: () => void;
  onStatusChange: (s: HackathonStatus) => void;
}) {
  const utils = trpc.useUtils();

  const { data: events, isLoading: eventsLoading } =
    trpc.hackathon.getEvents.useQuery({ hackathonId: hackathon.id });

  const updateMutation = trpc.hackathon.update.useMutation({
    onSuccess: () => {
      utils.hackathon.listAll.invalidate();
      onStatusChange(hackathon.status);
    },
  });

  const deleteMutation = trpc.hackathon.delete.useMutation({
    onSuccess: () => {
      utils.hackathon.listAll.invalidate();
    },
  });

  return (
    <LiquidGlass className="p-10 md:p-12 hover:border-white/20 transition-all shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col gap-10">
        {/* Info Section */}
        <div className="min-w-0">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={`/admin/hackathons/${encodeURIComponent(hackathon.name)}`}
            >
              <h3 className="text-3xl md:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight hover:text-accent transition-colors leading-tight">
                {hackathon.name}
              </h3>
            </Link>
          </div>
          {hackathon.description && (
            <p className="text-gray-300 text-base md:text-lg mb-8 line-clamp-4 leading-relaxed max-w-5xl">
              {hackathon.description}
            </p>
          )}

          {/* Modern Info Grid replacing the dot-separated list */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
            <div className="p-5 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none hover:bg-white/[0.04] transition-colors">
              <p className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                Location
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)] font-mono truncate">
                {hackathon.location || "No location"}
              </p>
            </div>
            <div className="p-5 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none hover:bg-white/[0.04] transition-colors">
              <p className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                Duration
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)] font-mono">
                {new Date(hackathon.startDate).toLocaleDateString()} –{" "}
                {new Date(hackathon.endDate).toLocaleDateString()}
              </p>
            </div>
            <div className="p-5 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none hover:bg-white/[0.04] transition-colors">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                  Participants
                </p>
                {hackathon.maxParticipants && (
                  <span className="text-xs font-mono text-accent font-bold">
                    {Math.round(
                      (hackathon.currentParticipants /
                        hackathon.maxParticipants) *
                        100,
                    )}
                    %
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-accent font-mono">
                {hackathon.currentParticipants}
                {hackathon.maxParticipants
                  ? ` / ${hackathon.maxParticipants}`
                  : " registered"}
              </p>
            </div>
          </div>

          {/* Registration Progress Bar */}
          {hackathon.maxParticipants && (
            <div className="mt-6 space-y-2">
              <div className="h-2 w-full bg-white/5 rounded-sm overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent rounded-sm transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(4, (hackathon.currentParticipants / hackathon.maxParticipants) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Events Showcase Section */}
          <div className="mt-10 pt-8 border-t border-[var(--border-subtle)] space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-sm bg-accent animate-pulse" />
                Event Itinerary Showcase
              </h4>
              {events && events.length > 0 && (
                <Link
                  href={`/admin/hackathons/${encodeURIComponent(hackathon.name)}`}
                  className="text-xs font-mono text-accent hover:underline flex items-center gap-1"
                >
                  Manage Events ({events.length}) →
                </Link>
              )}
            </div>

            {eventsLoading ? (
              <div className="py-4 text-left text-xs font-mono text-gray-600 animate-pulse">
                Fetching events...
              </div>
            ) : !events || events.length === 0 ? (
              <div className="p-4 bg-white/[0.01] border border-dashed border-[var(--border-subtle)] rounded-none text-center text-xs font-mono text-gray-600">
                No events scheduled for this hackathon yet. Click Dashboard to
                add some!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {events.slice(0, 4).map((event) => {
                  const typeColors: Record<
                    string,
                    { bg: string; text: string; border: string }
                  > = {
                    workshop: {
                      bg: "bg-accent/10",
                      text: "text-accent",
                      border: "border-emerald-500/20",
                    },
                    meal: {
                      bg: "bg-accent/10",
                      text: "text-accent",
                      border: "border-accent/20",
                    },
                    ceremony: {
                      bg: "bg-purple-500/10",
                      text: "text-purple-400",
                      border: "border-purple-500/20",
                    },
                    activity: {
                      bg: "bg-amber-500/10",
                      text: "text-amber-400",
                      border: "border-amber-500/20",
                    },
                    sponsor_session: {
                      bg: "bg-blue-500/10",
                      text: "text-blue-400",
                      border: "border-blue-500/20",
                    },
                  };
                  const tc = typeColors[event.type] || {
                    bg: "bg-white/5",
                    text: "text-[var(--text-primary)]/60",
                    border: "border-[var(--border-subtle)]",
                  };

                  return (
                    <div
                      key={event.id}
                      className="p-4 bg-white/[0.01] border border-[var(--border-subtle)] rounded-none hover:bg-white/[0.03] hover:border-[var(--border-subtle)] transition-all flex flex-col justify-between gap-3 group/item relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-transparent opacity-50" />
                      <div className="flex justify-between items-start gap-2">
                        <h5 className="font-semibold text-[var(--text-primary)] text-sm group-hover/item:text-emerald-300 transition-colors truncate pl-2">
                          {event.name}
                        </h5>
                        {event.points > 0 && (
                          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded shrink-0">
                            +{event.points} pts
                          </span>
                        )}
                      </div>

                      {/* Advanced Analytics Section for Event */}
                      <div className="grid grid-cols-2 gap-2 mt-1 mb-1 pl-2">
                        <div className="flex flex-col p-2 bg-[var(--bg-primary)]/20 rounded border border-[var(--border-subtle)]">
                          <span className="text-[8px] font-mono text-[var(--text-subtle)] uppercase tracking-widest">
                            Attendance
                          </span>
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {event.attendeeCount || 0} Checked-in
                          </span>
                        </div>
                        <div className="flex flex-col p-2 bg-[var(--bg-primary)]/20 rounded border border-[var(--border-subtle)]">
                          <span className="text-[8px] font-mono text-[var(--text-subtle)] uppercase tracking-widest">
                            Engagement
                          </span>
                          <span className="text-xs font-bold text-accent">
                            {hackathon.currentParticipants > 0
                              ? Math.round(
                                  ((event.attendeeCount || 0) /
                                    hackathon.currentParticipants) *
                                    100,
                                )
                              : 0}
                            % Active
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[var(--text-subtle)] pl-2">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-wider ${tc.bg} ${tc.text} ${tc.border}`}
                        >
                          {event.type.replace("_", " ")}
                        </span>
                        <span className="truncate max-w-[120px] text-[10px] flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {event.location}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {events.length > 4 && (
                  <div className="md:col-span-2 p-3 bg-white/[0.01] border border-[var(--border-subtle)] rounded-none text-center">
                    <Link
                      href={`/admin/hackathons/${encodeURIComponent(hackathon.name)}`}
                      className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      + {events.length - 4} more scheduled events (Click to view
                      full schedule)
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions Section — full width row */}
        <div className="flex flex-wrap items-center justify-between gap-6 pt-10 border-t border-[var(--border-subtle)]">
          {/* Left group: Status + Visibility */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Replaced Status Dropdown with just Hidden/Public toggle */}

            <button
              onClick={() => {
                updateMutation.mutate({
                  id: hackathon.id,
                  isPublic: !hackathon.isPublic,
                });
              }}
              className={`whitespace-nowrap px-6 py-3.5 border text-base font-semibold rounded-none transition-colors ${
                hackathon.isPublic
                  ? "border-green-500/20 text-green-400 hover:bg-green-500/10"
                  : "border-red-500/20 text-red-400 hover:bg-red-500/10"
              }`}
            >
              {hackathon.isPublic ? "● Public" : "● Hidden"}
            </button>
          </div>

          {/* Right group: Dashboard + Edit */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onEdit}
              className="whitespace-nowrap px-6 py-3.5 border border-[var(--border-subtle)] text-gray-300 text-base font-semibold rounded-none hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
            >
              Edit
            </button>

            <button
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to delete this hackathon? This cannot be undone.",
                  )
                ) {
                  deleteMutation.mutate({ hackathonId: hackathon.id });
                }
              }}
              disabled={deleteMutation.isPending}
              className="whitespace-nowrap px-6 py-3.5 border border-red-500/20 text-red-400 text-base font-semibold rounded-none hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </button>

            <Link
              href={`/admin/hackathons/${encodeURIComponent(hackathon.name)}`}
              className="whitespace-nowrap px-6 py-3.5 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] text-base font-bold rounded-none hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-[0.98] hover:scale-[1.02] transition-all flex items-center gap-2"
            >
              Dashboard <span className="text-lg leading-none">→</span>
            </Link>
          </div>
        </div>
      </div>
    </LiquidGlass>
  );
}
