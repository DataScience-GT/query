"use client";

import React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff } from "lucide-react";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  object,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
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
    <article className={`${object} p-5 md:p-8`}>
      <div className="flex flex-col gap-8">
        {/* Info Section */}
        <div className="min-w-0">
          <Link
            href={adminHackathonPath(hackathon.name, hackathon.id)}
            className="decoration-accent decoration-2 underline-offset-[5px] hover:underline"
          >
            <h3 className={sectionTitle}>{hackathon.name}</h3>
          </Link>
          {hackathon.description && (
            <p className={`mt-2 line-clamp-4 max-w-3xl ${body}`}>
              {hackathon.description}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-y-4 sm:grid-cols-3 sm:gap-x-8">
            <div className="min-w-0">
              <dt className={label}>Location</dt>
              <dd className="mt-1 truncate text-[15px] text-[var(--text-primary)]">
                {hackathon.location || "No location"}
              </dd>
            </div>
            <div className="min-w-0 sm:border-l sm:border-[var(--border-subtle)] sm:pl-8">
              <dt className={label}>Dates</dt>
              <dd className="mt-1 text-[15px] tabular-nums text-[var(--text-primary)]">
                {new Date(hackathon.startDate).toLocaleDateString()} –{" "}
                {new Date(hackathon.endDate).toLocaleDateString()}
              </dd>
            </div>
            <div className="min-w-0 sm:border-l sm:border-[var(--border-subtle)] sm:pl-8">
              <dt className={label}>
                {hackathon.status === "announced"
                  ? "Interest list"
                  : "Participants"}
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight tabular-nums text-[var(--text-primary)]">
                  {hackathon.status === "announced"
                    ? `${interestCount ?? "…"} interested`
                    : `${hackathon.currentParticipants}${
                        hackathon.maxParticipants
                          ? ` of ${hackathon.maxParticipants}`
                          : " registered"
                      }`}
                </span>
                {hackathon.status !== "announced" &&
                  hackathon.maxParticipants && (
                  <span className={`tabular-nums ${meta}`}>
                    {Math.round(
                      (hackathon.currentParticipants /
                        hackathon.maxParticipants) *
                        100,
                    )}
                    % full
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* Registration Progress Bar */}
          {hackathon.status !== "announced" && hackathon.maxParticipants && (
            <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, Math.max(4, (hackathon.currentParticipants / hackathon.maxParticipants) * 100))}%`,
                }}
              />
            </div>
          )}

          {/* Events Showcase Section */}
          <div className="mt-8 border-t border-[var(--border-subtle)] pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className={itemTitle}>Schedule</h4>
              {events && events.length > 0 && (
                <Link
                  href={adminHackathonPath(hackathon.name, hackathon.id)}
                  className={textLink}
                >
                  Manage schedule ({events.length})
                </Link>
              )}
            </div>

            {eventsLoading ? (
              <p className={`mt-3 ${meta}`}>Loading events…</p>
            ) : !events || events.length === 0 ? (
              <p className={`mt-3 ${body}`}>
                No schedule yet. Open the dashboard to add workshops
                and meals for this edition — club meetings stay on Club Hub.
              </p>
            ) : (
              <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
                {events.slice(0, 4).map((event) => (
                  <li
                    key={event.id}
                    className="min-w-0 border-b border-[var(--border-subtle)] py-3"
                  >
                    <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
                      {event.name}
                    </p>
                    <p className={`mt-0.5 truncate ${meta}`}>
                      <span className="capitalize">
                        {event.type.replace("_", " ")}
                      </span>
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    <p className="mt-1 text-[13px] tabular-nums text-[var(--text-muted)]">
                      {event.attendeeCount || 0} checked in ·{" "}
                      {hackathon.currentParticipants > 0
                        ? Math.round(
                            ((event.attendeeCount || 0) /
                              hackathon.currentParticipants) *
                              100,
                          )
                        : 0}
                      % of registrants
                    </p>
                  </li>
                ))}
                {events.length > 4 && (
                  <li className="pt-3 md:col-span-2">
                    <Link
                      href={adminHackathonPath(hackathon.name, hackathon.id)}
                      className="text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      {events.length - 4} more events. View the full schedule
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Actions Section — full width row */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-[var(--border-subtle)] pt-6">
          {/* Left group: Visibility, with Delete kept away from the primary action */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                updateMutation.mutate({
                  id: hackathon.id,
                  isPublic: !hackathon.isPublic,
                });
              }}
              className={btnSecondary}
              title={
                hackathon.isPublic
                  ? "Hiding removes this edition from the public funnel and from /judge/register and /scan. Staff judging tools keep showing it."
                  : "Hidden: invisible on the public funnel, /judge/register and /scan. Staff judging tools still show it."
              }
            >
              {hackathon.isPublic ? (
                <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              {hackathon.isPublic ? "Public" : "Hidden"}
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
              className={btnDanger}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
            {!hackathon.isPublic && (
              <p className="basis-full text-[13px] text-[var(--warning)]">
                Hidden. Judges can&apos;t find it at /judge/register, and it
                isn&apos;t listed on /scan.
              </p>
            )}
          </div>

          {/* Right group: Edit + Dashboard */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onEdit} className={btnSecondary}>
              Edit
            </button>
            <Link
              href={adminHackathonPath(hackathon.name, hackathon.id)}
              className={btnPrimary}
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
