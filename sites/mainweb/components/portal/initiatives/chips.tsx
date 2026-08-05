import type { ApplicationStatus, InitiativeStatus } from "@query/db";

/**
 * One definition of each state, shared by the member list, the leader's queue
 * and the admin screen — defining them per screen is how "Accepted" ends up
 * green in one place and grey in another.
 */

const base =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold";

const applicationTones: Record<
  ApplicationStatus,
  { member: string; leader: string; className: string }
> = {
  pending: {
    member: "Waiting on the leader",
    leader: "Undecided",
    className: "bg-white/10 text-white/70",
  },
  accepted: {
    member: "On the team",
    leader: "Accepted",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  rejected: {
    member: "Not this time",
    leader: "Rejected",
    className: "bg-white/5 text-white/50",
  },
  withdrawn: {
    member: "Withdrawn",
    leader: "Withdrawn",
    className: "bg-white/5 text-white/50",
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
    <span className={`${base} ${tone.className}`}>{tone[side]}</span>
  );
}

/** Archived is a timestamp, not a status, but it outranks the other three. */
export type InitiativeState = InitiativeStatus | "archived";

const initiativeTones: Record<
  InitiativeState,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-white/10 text-white/60" },
  open: {
    label: "Taking applications",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  closed: { label: "Applications closed", className: "bg-white/10 text-white/60" },
  archived: { label: "Archived", className: "bg-amber-500/15 text-amber-300" },
};

export function initiativeState(initiative: {
  status: InitiativeStatus;
  archivedAt: Date | string | null;
}): InitiativeState {
  return initiative.archivedAt !== null ? "archived" : initiative.status;
}

export function InitiativeChip({ state }: { state: InitiativeState }) {
  const tone = initiativeTones[state];
  return <span className={`${base} ${tone.className}`}>{tone.label}</span>;
}

/** A null cap is uncapped, not zero — "4 of 0" reads as nobody can join. */
export function seatLabel(accepted: number, maxMembers: number | null) {
  return maxMembers === null
    ? `${accepted} on the team`
    : `${accepted} of ${maxMembers} spots taken`;
}
