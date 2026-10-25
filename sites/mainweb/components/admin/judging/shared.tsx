"use client";

import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { fieldHint, fieldLabel, input } from "@/components/portal/ui";

// Pieces every section of the judging console shares.

export type Overview = RouterOutputs["judging"]["admin"]["overview"];
export type Challenge =
  RouterOutputs["judging"]["admin"]["listChallenges"]["challenges"][number];

export const SECTIONS = [
  { id: "checklist", label: "Checklist" },
  { id: "projects", label: "Projects" },
  { id: "challenges", label: "Challenges" },
  { id: "rooms", label: "Rooms" },
  { id: "rubric", label: "Rubric" },
  { id: "launch", label: "State and launch" },
  { id: "schedule", label: "Schedule" },
  { id: "claims", label: "Claims" },
  { id: "results", label: "Results" },
  { id: "repo-check", label: "Repo check" },
  { id: "announcements", label: "Announcements" },
  { id: "danger", label: "Danger zone" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Officer screens poll at this rate while the tab is visible. */
export const OFFICER_POLL_MS = 10_000;

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Judging stations counted by kind: "3 rooms", "30 tables", "2 rooms · 30
 * tables". `stations` is rooms and tables together.
 */
export const stationCount = (stations: number, tables: number) => {
  const rooms = stations - tables;
  if (tables === 0) return plural(rooms, "room");
  if (rooms === 0) return plural(tables, "table");
  return `${plural(rooms, "room")} · ${plural(tables, "table")}`;
};

export const MODE_LABEL = {
  scheduled: "Scheduled",
  unscheduled: "Unscheduled",
  remote: "Remote",
} as const;

export const MODE_HINT = {
  scheduled: "Timed presentations at rooms or tables",
  unscheduled: "Drop-in, no set times",
  remote: "Judged without the team present",
} as const;

export const shortTime = (value: Date | string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** A 44px square button around a single icon (reorder, remove). */
export const iconButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * A write here can change what any judging screen shows: a room move changes
 * the schedule preview, a reset empties everything. Only mounted queries
 * refetch, so invalidating the whole namespace stays cheap.
 */
export function useRefreshJudging() {
  const utils = trpc.useUtils();
  return () => utils.judging.invalidate();
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
    >
      {children}
    </p>
  );
}

export function NoticeLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]"
    >
      {children}
    </p>
  );
}

/** A labelled on/off switch with a line saying what it does. */
export function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  title,
  onChange,
}: {
  id: string;
  label: string;
  hint: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="text-[15px] font-semibold text-[var(--text-primary)]"
        >
          {label}
        </label>
        <div className="mt-0.5 text-[13px] text-[var(--text-subtle)]">
          {hint}
        </div>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        title={title}
        onClick={() => onChange(!checked)}
        className="group flex min-h-11 shrink-0 items-center disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            checked
              ? "border-accent bg-accent"
              : "border-[var(--border-medium)] bg-[var(--bg-input)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-[left] ${
              checked
                ? "left-[22px] bg-[var(--text-on-accent)]"
                : "left-0.5 bg-[var(--text-subtle)]"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

/** The "type the name to confirm" field destructive actions sit behind. */
export function TypedConfirm({
  id,
  expected,
  value,
  onChange,
  what,
}: {
  id: string;
  expected: string;
  value: string;
  onChange: (value: string) => void;
  what: string;
}) {
  return (
    <div className="max-w-md">
      <label htmlFor={id} className={fieldLabel}>
        Type <span className="text-[var(--text-primary)]">{expected}</span> to
        confirm
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      />
      <p className={fieldHint}>{what}</p>
    </div>
  );
}

export const typedMatches = (typed: string, expected: string) =>
  typed.trim() === expected.trim();
