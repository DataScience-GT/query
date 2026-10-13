"use client";

import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  btnPrimary,
  btnSecondary,
  body,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  status,
  textLink,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";
import {
  ICON_STROKE,
  clockTime,
  nextPresentation,
  roomPlace,
  startsIn,
} from "./desk";
import type { DeskContext, ListedProject } from "./desk";
import { useServerNow } from "./use-server-now";

export type QueueFilters = {
  /** Null: the server's pick, the judge's room's challenge or General. */
  challengeId: string | null;
  search: string;
  hideJudged: boolean;
  inMyRoomOnly: boolean;
};

export const DEFAULT_FILTERS: QueueFilters = {
  challengeId: null,
  search: "",
  hideJudged: true,
  inMyRoomOnly: true,
};

function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function progress(
  project: ListedProject,
  now: number | null,
): { tone: Tone; text: string } | null {
  if (project.myEvaluation?.isComplete)
    return { tone: "success", text: "Judged" };
  if (project.myEvaluation) return { tone: "warning", text: "Incomplete" };
  if (project.hasDraft) return { tone: "warning", text: "Draft saved" };
  const p = project.presentation;
  if (
    p &&
    now !== null &&
    p.startsAt.getTime() <= now &&
    now < p.endsAt.getTime()
  ) {
    return { tone: "neutral", text: "Presenting now" };
  }
  return null;
}

function where(project: ListedProject) {
  const p = project.presentation;
  const team =
    project.participantCount === 1
      ? "Solo"
      : `Team of ${project.participantCount}`;
  if (!p) return team;
  return `${clockTime(p.startsAt)} · ${roomPlace(p.roomName, p.buildingName)} · ${team}`;
}

/**
 * The projects to judge. With a schedule and a seat, the presentation in the
 * judge's room that is on now, or next, sits on top as the one thing to do.
 */
export function ProjectQueue({
  hackathonId,
  context,
  filters,
  onFilters,
  onOpen,
  onPickRoom,
}: {
  hackathonId: string;
  context: DeskContext;
  filters: QueueFilters;
  onFilters: (next: QueueFilters) => void;
  onOpen: (entryId: string, challengeId: string) => void;
  /** Members only: opens the room picker. */
  onPickRoom?: () => void;
}) {
  const search = useDebounced(filters.search.trim(), 300);
  const list = trpc.judging.desk.projects.useQuery(
    {
      hackathonId,
      challengeId: filters.challengeId ?? undefined,
      search: search || undefined,
      hideJudged: filters.hideJudged,
      inMyRoomOnly: filters.inMyRoomOnly,
    },
    { refetchInterval: 15_000, placeholderData: keepPreviousData },
  );
  const now = useServerNow(list.data?.serverNow, list.dataUpdatedAt);

  // Tops are challenges whose parent the judge cannot see: the roots for a
  // member, the room's challenge for a guest.
  const visible = context.challenges;
  const roots = visible.filter(
    (c) => !c.parentId || !visible.some((p) => p.id === c.parentId),
  );
  const below = (id: string) => {
    const found: typeof visible = [];
    const queue = [id];
    while (queue.length > 0) {
      const parent = queue.shift();
      for (const c of visible) {
        if (c.parentId === parent) {
          found.push(c);
          queue.push(c.id);
        }
      }
    }
    return found;
  };

  const data = list.data;
  const challenge = data?.challenge;
  // Only a presentation in the judge's own room is theirs to do next.
  const next =
    data && data.roomFilter === "applied" && now !== null
      ? nextPresentation(data.projects, now)
      : null;
  const rest = data ? data.projects.filter((p) => p !== next) : [];

  return (
    <div className="mt-6">
      <div className="space-y-3">
        {context.challenges.length > 1 && (
          <div>
            <label htmlFor="desk-challenge" className={fieldLabel}>
              Challenge
            </label>
            <select
              id="desk-challenge"
              className={`${input} min-h-11`}
              value={filters.challengeId ?? challenge?.id ?? ""}
              onChange={(e) =>
                onFilters({ ...filters, challengeId: e.target.value || null })
              }
            >
              {!challenge && <option value="">Loading…</option>}
              {roots.map((root) => {
                const children = below(root.id);
                if (children.length === 0) {
                  return (
                    <option key={root.id} value={root.id}>
                      {root.label}
                    </option>
                  );
                }
                return (
                  <optgroup key={root.id} label={root.label}>
                    <option value={root.id}>All of {root.label}</option>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="desk-search" className="sr-only">
            Search projects
          </label>
          <input
            id="desk-search"
            type="search"
            className={`${input} min-h-11`}
            placeholder="Search by project name"
            maxLength={100}
            value={filters.search}
            onChange={(e) => onFilters({ ...filters, search: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-x-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              checked={filters.hideJudged}
              onChange={(e) =>
                onFilters({ ...filters, hideJudged: e.target.checked })
              }
            />
            Hide projects I judged
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              checked={filters.inMyRoomOnly}
              onChange={(e) =>
                onFilters({ ...filters, inMyRoomOnly: e.target.checked })
              }
            />
            Only my room&apos;s presentations
          </label>
        </div>

        {data && challenge && (
          <RoomFilterNote
            filter={data.roomFilter}
            challengeLabel={challenge.label}
            roomName={context.room?.name ?? null}
            onPickRoom={onPickRoom}
          />
        )}
      </div>

      {list.isPending ? (
        <p role="status" className={`mt-8 ${meta}`}>
          Loading projects…
        </p>
      ) : list.error && !data ? (
        <div role="alert" className="mt-8">
          <p className={body}>
            {trpcErrorMessage(list.error, "Projects did not load.")}
          </p>
          <button
            type="button"
            className={`${btnSecondary} mt-3 min-h-11`}
            onClick={() => void list.refetch()}
          >
            Try again
          </button>
        </div>
      ) : data && challenge ? (
        <>
          {next?.presentation && (
            <div className={`mt-8 ${object} p-5`}>
              {now !== null && next.presentation.startsAt.getTime() <= now ? (
                <p className={status("accent")}>Presenting now</p>
              ) : (
                <p className={status("neutral")}>
                  Up next
                  {now !== null &&
                    `, ${startsIn(next.presentation.startsAt.getTime() - now)}`}
                </p>
              )}
              <h2 className={`mt-2 ${itemTitle}`}>{next.title}</h2>
              <p className={`mt-1 ${meta}`}>{where(next)}</p>
              <button
                type="button"
                className={`${btnPrimary} mt-5 min-h-11 w-full sm:w-auto`}
                onClick={() => onOpen(next.id, challenge.id)}
              >
                {next.hasDraft ? "Keep judging" : "Judge this project"}
              </button>
            </div>
          )}

          {rest.length > 0 ? (
            <section
              className="mt-8"
              aria-label={`Projects in ${challenge.label}`}
            >
              <h2 className={label}>
                {rest.length} {next ? "more " : ""}
                {rest.length === 1 ? "project" : "projects"}
                {filters.hideJudged ? " to judge" : ""}
              </h2>
              <ul className="mt-3 border-t border-[var(--border-subtle)]">
                {rest.map((project) => {
                  const state = progress(project, now);
                  return (
                    <li
                      key={project.id}
                      className="border-b border-[var(--border-subtle)]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(project.id, challenge.id)}
                        className="flex w-full min-h-11 items-center gap-4 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate ${itemTitle}`}>
                            {project.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={meta}>{where(project)}</span>
                            {state && (
                              <span className={status(state.tone)}>
                                {state.text}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-[var(--text-subtle)]"
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            !next && (
              <EmptyQueue
                search={search}
                hideJudged={filters.hideJudged}
                roomOnly={data.roomFilter === "applied"}
                challengeLabel={challenge.label}
                onShowJudged={() =>
                  onFilters({ ...filters, hideJudged: false })
                }
                onShowAll={() => onFilters({ ...filters, inMyRoomOnly: false })}
              />
            )
          )}
        </>
      ) : null}
    </div>
  );
}

function RoomFilterNote({
  filter,
  challengeLabel,
  roomName,
  onPickRoom,
}: {
  filter: "off" | "untimed" | "no-room" | "applied";
  challengeLabel: string;
  roomName: string | null;
  onPickRoom?: () => void;
}) {
  if (filter === "off") return null;
  if (filter === "applied") {
    return (
      <p className={meta}>
        Showing presentations in {roomName ?? "your room"}, in presentation
        order.
      </p>
    );
  }
  if (filter === "untimed") {
    return (
      <p className={meta}>
        {challengeLabel} has no presentation times, so every project is listed.
        Judge them in any order.
      </p>
    );
  }
  return (
    <p className={meta}>
      You are not in a room that judges {challengeLabel}, so every project is
      listed.{" "}
      {onPickRoom && (
        <button
          type="button"
          className={`${textLink} min-h-11`}
          onClick={onPickRoom}
        >
          Pick your room
        </button>
      )}
    </p>
  );
}

function EmptyQueue({
  search,
  hideJudged,
  roomOnly,
  challengeLabel,
  onShowJudged,
  onShowAll,
}: {
  search: string;
  hideJudged: boolean;
  roomOnly: boolean;
  challengeLabel: string;
  onShowJudged: () => void;
  onShowAll: () => void;
}) {
  if (search) {
    return (
      <p className={`mt-8 ${body}`}>
        No project in {challengeLabel} matches &ldquo;{search}&rdquo;. Check the
        spelling, or clear the search.
      </p>
    );
  }
  if (hideJudged) {
    return (
      <div className="mt-8">
        <p className={body}>
          Nothing left to judge in this view. Projects you judged are hidden.
        </p>
        <button
          type="button"
          className={`${textLink} mt-2 min-h-11`}
          onClick={onShowJudged}
        >
          Show projects I judged
        </button>
      </div>
    );
  }
  if (roomOnly) {
    return (
      <div className="mt-8">
        <p className={body}>
          Nothing in {challengeLabel} presents in your room.
        </p>
        <button
          type="button"
          className={`${textLink} mt-2 min-h-11`}
          onClick={onShowAll}
        >
          Show every project
        </button>
      </div>
    );
  }
  return (
    <p className={`mt-8 ${body}`}>
      No projects are entered in {challengeLabel} yet. Organisers add them
      before judging starts; this list refreshes on its own.
    </p>
  );
}
