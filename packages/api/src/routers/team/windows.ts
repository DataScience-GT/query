// Hackathon clock: when teams may form and projects may be submitted.

import { TRPCError } from "@trpc/server";
import { hackathons } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

export const HOUR = 60 * 60 * 1000;

/** All hackathon milestones, as hour offsets from the hacking start time. */
export const SUBMISSION_OPEN_HOURS = 12;
export const TEAM_WINDOW_CLOSE_HOURS = 34;
export const SUBMISSION_HARD_DEADLINE_HOURS = 36;
/** Rosters freeze 12h before the hard submission deadline, i.e. at +24h. */
export const LEAVE_LOCK_HOURS = SUBMISSION_HARD_DEADLINE_HOURS - 12;

// Teams form any time before +34h, so accepted people can find teammates
// before kickoff. Who may form one is checkAdmitted's job, not the clock's:
// this window used to open only at +12h, a third of the way into the event.
export function computeTeamWindow(baseTime: Date, now: Date) {
  const at = (hours: number) => new Date(baseTime.getTime() + hours * HOUR);

  const closesAt = at(TEAM_WINDOW_CLOSE_HOURS);
  const leaveLocksAt = at(LEAVE_LOCK_HOURS);

  const isOpen = now <= closesAt;

  return {
    opensAt: null,
    closesAt,
    leaveLocksAt,
    isOpen,
    canCreate: isOpen,
    canJoin: isOpen,
    // Leaving shuts earlier than the rest of the window so rosters are stable
    // through the final crunch and judging.
    canLeave: isOpen && now < leaveLocksAt,
  };
}

// The submission window as three moments and the state between them.
// Exported and used by submitProject itself, so the page and the procedure
// cannot disagree: /submit rendered no window state, so an attendee could
// write a full description and learn it was refused only on submit.
export function computeSubmissionWindow(baseTime: Date, now: Date) {
  const at = (hours: number) => new Date(baseTime.getTime() + hours * HOUR);

  const opensAt = at(SUBMISSION_OPEN_HOURS);
  /** After this, an existing submission is frozen — new ones still land. */
  const editsCloseAt = at(TEAM_WINDOW_CLOSE_HOURS);
  const closesAt = at(SUBMISSION_HARD_DEADLINE_HOURS);

  return {
    opensAt,
    editsCloseAt,
    closesAt,
    isOpen: now >= opensAt && now <= closesAt,
    notYetOpen: now < opensAt,
    canEditExisting: now >= opensAt && now <= editsCloseAt,
  };
}

export async function loadHackathonBaseTime(db: DrizzleDB, hackathonId: string) {
  const hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
  });
  if (!hackathon) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found." });
  }
  return hackathon.hackingStartTime ?? hackathon.startDate;
}

export async function loadTeamWindow(db: DrizzleDB, hackathonId: string) {
  const baseTime = await loadHackathonBaseTime(db, hackathonId);
  return computeTeamWindow(baseTime, new Date());
}

// Withdrawal follows the submission window, not the team one. On the team
// window it shut at +34h while submitting ran to +36h, so for two hours a
// project could be filed and then not taken back.
export async function checkWithdrawWindow(db: DrizzleDB, hackathonId: string) {
  const baseTime = await loadHackathonBaseTime(db, hackathonId);
  const now = new Date();
  const window = computeSubmissionWindow(baseTime, now);

  if (window.notYetOpen) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Project submission is not open yet. It starts 12 hours after the hacking begins.",
    });
  }

  if (now > window.closesAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "The submission window has closed. Ask an organiser if a project needs to be pulled.",
    });
  }

  return window;
}

export async function checkTeamEditWindow(db: DrizzleDB, hackathonId: string) {
  const window = await loadTeamWindow(db, hackathonId);
  const now = new Date();

  if (now > window.closesAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Team creation and editing is closed. It ends 34 hours after the hacking begins.",
    });
  }
  return window;
}
