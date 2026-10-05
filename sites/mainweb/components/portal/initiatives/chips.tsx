import type { ApplicationStatus, InitiativeStatus } from "@query/db";
import { status as statusClass } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

/**
 * One definition of each state, shared by the member list, the leader's queue
 * and the admin screen — defining them per screen is how "Accepted" ends up
 * green in one place and grey in another.
 */

const applicationTones: Record<
  ApplicationStatus,
  { member: string; leader: string; tone: Tone }
> = {
  pending: {
    member: "Waiting on the leader",
    leader: "Undecided",
    tone: "warning",
  },
  accepted: {
    member: "On the team",
    leader: "Accepted",
    tone: "success",
  },
  rejected: {
    member: "Not this time",
    leader: "Rejected",
    tone: "neutral",
  },
  withdrawn: {
    member: "Withdrawn",
    leader: "Withdrawn",
    tone: "neutral",
  },
};

export function ApplicationChip({
  status,
  side = "member",
}: {
  status: ApplicationStatus;
  side?: "member" | "leader";
}) {
  const tone = applicationTones[status];
  return (
    <span className={`${statusClass(tone.tone)} shrink-0`}>{tone[side]}</span>
  );
}

/** Archived is a timestamp, not a status, but it outranks the other three. */
export type InitiativeState = InitiativeStatus | "archived";

const initiativeTones: Record<
  InitiativeState,
  { label: string; tone: Tone }
> = {
  proposed: {
    label: "Waiting on review",
    tone: "warning",
  },
  declined: { label: "Not approved", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  open: {
    label: "Taking applications",
    tone: "accent",
  },
  closed: { label: "Applications closed", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

export function initiativeState(initiative: {
  status: InitiativeStatus;
  archivedAt: Date | string | null;
}): InitiativeState {
  return initiative.archivedAt !== null ? "archived" : initiative.status;
}

export function InitiativeChip({ state }: { state: InitiativeState }) {
  const tone = initiativeTones[state];
  return (
    <span className={`${statusClass(tone.tone)} shrink-0`}>{tone.label}</span>
  );
}

/** A null cap is uncapped, not zero — "4 of 0" reads as nobody can join. */
export function seatLabel(accepted: number, maxMembers: number | null) {
  return maxMembers === null
    ? `${accepted} on the team`
    : `${accepted} of ${maxMembers} spots taken`;
}
