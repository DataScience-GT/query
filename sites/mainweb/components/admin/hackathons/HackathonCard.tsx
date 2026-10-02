"use client";

import React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Eye, EyeOff, MapPin } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { adminHackathonPath } from "@/lib/hackathon-slug";
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
  const { data: interestCount } = trpc.hackathon.interestCount.useQuery(
    { hackathonId: hackathon.id },
    { enabled: hackathon.status === "announced" },
  );

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
    // A mistyped name and a blocking paid-membership reference both come back
    // here. Silently doing nothing would read as "deleted".
    onError: (error) => window.alert(error.message),
  });

  return (
    <LiquidGlass printed className="p-6 md:p-8">
      <div className="flex flex-col gap-10">
        {/* Info Section */}
        <div className="min-w-0">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={adminHackathonPath(hackathon.name, hackathon.id)}
            >
              <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase hover:text-accent transition-colors leading-tight">
                {hackathon.name}
              </h3>
            </Link>
          </div>
          {hackathon.description && (
            <p className="text-sm text-[var(--text-muted)] mb-6 line-clamp-4 leading-relaxed max-w-5xl">
              {hackathon.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="p-5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                Location
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)] truncate">
                {hackathon.location || "No location"}
              </p>
            </div>
            <div className="p-5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                Duration
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)]">
                {new Date(hackathon.startDate).toLocaleDateString()} –{" "}
                {new Date(hackathon.endDate).toLocaleDateString()}
              </p>
            </div>
            <div className="p-5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  {hackathon.status === "announced"
                    ? "Interest list"
                    : "Participants"}
                </p>
                {hackathon.status !== "announced" &&
                  hackathon.maxParticipants && (
                  <span className="text-xs text-accent font-bold">
                    {Math.round(
                      (hackathon.currentParticipants /
                        hackathon.maxParticipants) *
                        100,
                    )}
                    %
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-accent">
                {hackathon.status === "announced"
                  ? `${interestCount ?? "…"} interested`
                  : `${hackathon.currentParticipants}${
                      hackathon.maxParticipants
                        ? ` of ${hackathon.maxParticipants}`
                        : " registered"
                    }`}
              </p>
            </div>
          </div>

          {/* Registration Progress Bar */}
          {hackathon.status !== "announced" && hackathon.maxParticipants && (
            <div className="mt-6 space-y-2">
              <div className="h-2 w-full bg-[var(--bg-secondary)] rounded-sm overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className="h-full bg-accent rounded-sm transition-ui duration-500"
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
              <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                Schedule
              </h4>
              {events && events.length > 0 && (
                <Link
                  href={adminHackathonPath(hackathon.name, hackathon.id)}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  Manage schedule ({events.length})
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              )}
            </div>

            {eventsLoading ? (
              <div className="py-4 text-left text-sm text-[var(--text-muted)]">
                Loading events…
              </div>
            ) : !events || events.length === 0 ? (
              <div className="p-4 border border-dashed border-[var(--border-subtle)] rounded-sm text-center text-sm text-[var(--text-muted)]">
                No schedule yet. Open the dashboard to add workshops
                and meals for this edition — club meetings stay on Club Hub.
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
                      border: "border-accent/20",
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
                    bg: "bg-[var(--bg-secondary)]",
                    text: "text-[var(--text-muted)]",
                    border: "border-[var(--border-subtle)]",
                  };

                  return (
                    <div
                      key={event.id}
                      className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm flex flex-col justify-between gap-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <h5 className="font-semibold text-[var(--text-primary)] text-sm truncate">
                          {event.name}
                        </h5>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-1 mb-1">
                        <div className="flex flex-col p-2 rounded-sm border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Attendance
                          </span>
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {event.attendeeCount || 0} checked in
                          </span>
                        </div>
                        <div className="flex flex-col p-2 rounded-sm border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
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
                            % of registrants
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-sm border text-[11px] uppercase font-bold tracking-wider ${tc.bg} ${tc.text} ${tc.border}`}
                        >
                          {event.type.replace("_", " ")}
                        </span>
                        <span className="truncate max-w-[120px] text-[11px] flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[var(--text-subtle)]" aria-hidden="true" />
                          {event.location}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {events.length > 4 && (
                  <div className="md:col-span-2 p-3 border border-[var(--border-subtle)] rounded-sm text-center">
                    <Link
                      href={adminHackathonPath(hackathon.name, hackathon.id)}
                      className="text-xs font-semibold text-[var(--text-muted)] hover:text-accent transition-colors"
                    >
                      {events.length - 4} more events. View the full schedule
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions Section — full width row */}
        <div className="flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-[var(--border-subtle)]">
          {/* Left group: Status + Visibility */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                updateMutation.mutate({
                  id: hackathon.id,
                  isPublic: !hackathon.isPublic,
                });
              }}
              className={`whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 border text-xs font-bold uppercase tracking-widest rounded-sm transition-colors ${
                hackathon.isPublic
                  ? "border-accent/25 text-accent hover:bg-accent/10"
                  : "border-red-500/30 text-red-400 hover:bg-red-500/10"
              }`}
              title={
                hackathon.isPublic
                  ? "Hiding removes this edition from the public funnel and from /judge/register and /scan. Staff judging tools keep showing it."
                  : "Hidden: invisible on the public funnel, /judge/register and /scan. Staff judging tools still show it."
              }
            >
              {hackathon.isPublic ? (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {hackathon.isPublic ? "Public" : "Hidden"}
            </button>
            {!hackathon.isPublic && (
              <p className="text-xs text-amber-400">
                Hidden — judges cannot find this at /judge/register, and it is
                absent from /scan.
              </p>
            )}
          </div>

          {/* Right group: Dashboard + Edit */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onEdit}
              className="whitespace-nowrap px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
            >
              Edit
            </button>

            <button
              type="button"
              onClick={() => {
                // Typing the name, not clicking OK. Deleting an edition takes
                // every participant, team, project and judge vote with it, and
                // a confirm() dialog is one stray Enter key away from doing it.
                const typed = window.prompt(
                  `This deletes "${hackathon.name}" and every participant, team, project and vote attached to it. This cannot be undone.\n\nType the hackathon's name to confirm:`,
                );
                if (typed === null) return;
                deleteMutation.mutate({
                  hackathonId: hackathon.id,
                  confirmName: typed,
                });
              }}
              disabled={deleteMutation.isPending}
              className="whitespace-nowrap px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>

            <Link
              href={adminHackathonPath(hackathon.name, hackathon.id)}
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
            >
              Dashboard
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </LiquidGlass>
  );
}
