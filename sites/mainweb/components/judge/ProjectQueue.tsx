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
  object,
  textLink,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";
import {
  ICON_STROKE,
  clockTime,
  deskLabel,
  deskMeta,
  deskStatus,
  inOrAt,
  nextPresentation,
  roomPlace,
  startsIn,
} from "./desk";
import type { DeskContext, ListedProject, StationKind } from "./desk";
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

/** When and who; the place too, unless the list is already that place's. */
function where(project: ListedProject, showPlace: boolean) {
  const p = project.presentation;
  const team =
    project.participantCount === 1
      ? "Solo"
      : `Team of ${project.participantCount}`;
  if (!p) return team;
  if (!showPlace) return `${clockTime(p.startsAt)} · ${team}`;
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
  onShowSubmitted,
  onPickRoom,
}: {
  hackathonId: string;
  context: DeskContext;
  filters: QueueFilters;
  onFilters: (next: QueueFilters) => void;
  onOpen: (entryId: string, challengeId: string) => void;
  /** Switches the desk to the judge's submitted evaluations. */
  onShowSubmitted: () => void;
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

  // Nothing left to judge. With no search to blame, that is the one thing the
  // judge needs to hear, so it sits above the filters instead of under them.
  const empty =
    data && challenge && !next && rest.length === 0 ? (
      <EmptyQueue
        search={search}
        hideJudged={filters.hideJudged}
        roomOnly={data.roomFilter === "applied"}
        roomKind={context.room?.kind ?? "room"}
        challengeLabel={challenge.label}
        judgedCount={data.judgedCount}
        onShowSubmitted={onShowSubmitted}
        onShowAll={() => onFilters({ ...filters, inMyRoomOnly: false })}
      />
    ) : null;
  const emptyFirst = !!empty && !search;

  // With judged projects shown, a count of all of them hides how many are left.
  const judged = rest.filter((p) => p.myEvaluation?.isComplete).length;
  const mixed = !filters.hideJudged && judged > 0;

  // Above the filters, so it is the first thing on a phone's screen. It only
  // exists in the judge's own room, which the heading already names.
  const upNext =
    data && challenge && next?.presentation ? (
      <div className={`mb-6 ${object} p-5`}>
        {now !== null && next.presentation.startsAt.getTime() <= now ? (
          <p className={deskStatus("accent")}>Presenting now</p>
        ) : (
          <p className={deskStatus("neutral")}>
            Up next
            {now !== null &&
              `, ${startsIn(next.presentation.startsAt.getTime() - now)}`}
          </p>
        )}
        <h2 className={`mt-2 ${itemTitle}`}>{next.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className={deskMeta}>{where(next, false)}</p>
          {next.flagged && (
            <span
              className={deskStatus("warning")}
              title="Organisers flagged this team for a check-in rule."
            >
              Flagged
            </span>
          )}
        </div>
        <button
          type="button"
          className={`${btnPrimary} mt-5 min-h-11 w-full sm:w-auto`}
          onClick={() => onOpen(next.id, challenge.id)}
        >
          {next.hasDraft ? "Keep judging" : "Judge this project"}
        </button>
      </div>
    ) : null;

  return (
    <div className="mt-6">
      {upNext}

      {emptyFirst && <div className="mb-8">{empty}</div>}

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
              className="h-5 w-5 min-h-0! min-w-0! shrink-0 cursor-pointer accent-[var(--accent)]"
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
              className="h-5 w-5 min-h-0! min-w-0! shrink-0 cursor-pointer accent-[var(--accent)]"
              checked={filters.inMyRoomOnly}
              onChange={(e) =>
                onFilters({ ...filters, inMyRoomOnly: e.target.checked })
              }
            />
            {context.room
              ? `Only my ${context.room.kind}'s presentations`
              : "Only presentations where I sit"}
          </label>
        </div>

        {data && challenge && (
          <RoomFilterNote
            filter={data.roomFilter}
            challengeLabel={challenge.label}
            roomName={context.room?.name ?? null}
            roomKind={context.room?.kind ?? "room"}
            onPickRoom={onPickRoom}
          />
        )}
      </div>

      {list.isPending ? (
        <p role="status" className={`mt-8 ${deskMeta}`}>
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
          {rest.length > 0 ? (
            <section
              className="mt-8"
              aria-label={`Projects in ${challenge.label}`}
            >
              <h2 className={deskLabel}>
                {mixed ? (
                  `${rest.length - judged} ${next ? "more " : ""}to judge · ${judged} judged`
                ) : (
                  <>
                    {rest.length} {next ? "more " : ""}
                    {rest.length === 1 ? "project" : "projects"}
                    {filters.hideJudged ? " to judge" : ""}
                  </>
                )}
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
                          <span
                            className={`line-clamp-2 break-words ${itemTitle}`}
                          >
                            {project.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={deskMeta}>
                              {where(project, data.roomFilter !== "applied")}
                            </span>
                            {state && (
                              <span className={deskStatus(state.tone)}>
                                {state.text}
                              </span>
                            )}
                            {project.flagged && (
                              <span
                                className={deskStatus("warning")}
                                title="Organisers flagged this team for a check-in rule."
                              >
                                Flagged
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
            empty && !emptyFirst && <div className="mt-8">{empty}</div>
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
  roomKind,
  onPickRoom,
}: {
  filter: "off" | "untimed" | "no-room" | "applied";
  challengeLabel: string;
  roomName: string | null;
  roomKind: StationKind;
  onPickRoom?: () => void;
}) {
  if (filter === "off") return null;
  if (filter === "applied") {
    return (
      <p className={deskMeta}>
        Showing presentations {inOrAt(roomKind)}{" "}
        {roomName ?? `your ${roomKind}`}, in presentation order.
      </p>
    );
  }
  if (filter === "untimed") {
    return (
      <p className={deskMeta}>
        {challengeLabel} has no presentation times, so every project is listed.
        Judge them in any order.
      </p>
    );
  }
  return (
    <p className={deskMeta}>
      You are not seated where {challengeLabel} is judged, so every project is
      listed.{" "}
      {onPickRoom && (
        <button
          type="button"
          className={`${textLink} min-h-11`}
          onClick={onPickRoom}
        >
          Pick your room or table
        </button>
      )}
    </p>
  );
}

function EmptyQueue({
  search,
  hideJudged,
  roomOnly,
  roomKind,
  challengeLabel,
  judgedCount,
  onShowSubmitted,
  onShowAll,
}: {
  search: string;
  hideJudged: boolean;
  roomOnly: boolean;
  roomKind: StationKind;
  challengeLabel: string;
  judgedCount: number;
  onShowSubmitted: () => void;
  onShowAll: () => void;
}) {
  if (search) {
    return (
      <p className={body}>
        No project in {challengeLabel} matches &ldquo;{search}&rdquo;. Check the
        spelling, or clear the search.
      </p>
    );
  }
  if (hideJudged && judgedCount > 0) {
    return (
      <div>
        <p className={`text-balance ${itemTitle}`}>
          You&rsquo;ve judged every presentation here
        </p>
        <p className={`mt-1 ${body}`}>
          {judgedCount} {judgedCount === 1 ? "evaluation" : "evaluations"}{" "}
          submitted for {challengeLabel}. Organisers post what comes next as
          announcements at the top of this page.
        </p>
        <button
          type="button"
          className={`${textLink} mt-2 min-h-11`}
          onClick={onShowSubmitted}
        >
          See what you submitted
        </button>
      </div>
    );
  }
  if (roomOnly) {
    return (
      <div>
        <p className={body}>
          Nothing in {challengeLabel} presents {inOrAt(roomKind)} your{" "}
          {roomKind}.
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
    <p className={body}>
      No projects are entered in {challengeLabel} yet. Organisers add them
      before judging starts; this list refreshes on its own.
    </p>
  );
}
