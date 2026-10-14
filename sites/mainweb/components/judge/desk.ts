import type { RouterOutputs } from "@query/api";
import type { Tone } from "@/components/portal/ui";

type Desk = RouterOutputs["judging"]["desk"];
export type DeskContext = Desk["context"];
export type StationKind = NonNullable<DeskContext["room"]>["kind"];
export type ProjectList = Desk["projects"];
export type ListedProject = ProjectList["projects"][number];
export type ProjectSheet = Desk["project"];
export type Submission = Desk["myEvaluations"][number];
export type ShortlistSection = Desk["deliberation"]["list"][number];

/**
 * The desk's column. Narrower than the member pages: it is read on a phone
 * held in one hand, and on a laptop a long line of rubric text is no easier.
 */
export const deskPage =
  "mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 pb-10 md:pt-12";

/** A bare 44px icon button for list controls. */
export const iconButton =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const ICON_STROKE = 1.75;

const timeOfDay = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/** 2:40 PM, on the judge's own clock: they are in the building. */
export function clockTime(at: Date) {
  return timeOfDay.format(at);
}

/** What is left on a countdown: 4:05. */
export function countdown(seconds: number) {
  const left = Math.max(0, seconds);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/** Warning under three minutes, danger under ninety seconds. */
export function countdownTone(seconds: number): Tone {
  if (seconds < 90) return "danger";
  if (seconds < 180) return "warning";
  return "neutral";
}

export const toneText: Record<Tone, string> = {
  accent: "text-accent",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  neutral: "text-[var(--text-primary)]",
};

/** How long until something starts: "in 4 min", "in 1 h 5 min". */
export function startsIn(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Scores are means of 1–5 ratings; two places tells two projects apart. */
export function formatScore(score: number | null) {
  return score === null ? "None yet" : score.toFixed(2);
}

/**
 * The presentation a seated judge should do now, or next: the earliest one
 * still running or yet to start that they have not evaluated.
 */
export function nextPresentation<
  P extends {
    presentation: { startsAt: Date; endsAt: Date } | null;
    myEvaluation: unknown;
  },
>(projects: readonly P[], now: number): P | null {
  let next: P | null = null;
  let nextStart = Infinity;
  for (const project of projects) {
    const slot = project.presentation;
    if (!slot || project.myEvaluation || slot.endsAt.getTime() <= now) continue;
    if (slot.startsAt.getTime() < nextStart) {
      next = project;
      nextStart = slot.startsAt.getTime();
    }
  }
  return next;
}

/** Room, then building: "1116 · Klaus". */
export function roomPlace(room: string, building: string | null) {
  return building ? `${room} · ${building}` : room;
}

/** Judges sit in a room but at a table: "in your room", "at your table". */
export function inOrAt(kind: StationKind) {
  return kind === "table" ? "at" : "in";
}

/** A link's host, for a label: "github.com". */
export function linkHost(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}
