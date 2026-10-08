/**
 * What an event is allowed to do, and which phase it may move to next.
 * The server checks this on every mutation. The core does not persist it.
 */

export const PHASES = [
  "setup",
  "submissions_open",
  "submissions_closed",
  "judging_live",
  "judging_closed",
  "published",
  "archived",
] as const;

export type Phase = (typeof PHASES)[number];

export type PhaseAction =
  | "submit"
  | "apply"
  | "dispatch"
  | "vote"
  | "compute"
  | "publish";

const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  setup: ["submissions_open"],
  submissions_open: ["submissions_closed", "setup"],
  submissions_closed: ["judging_live", "submissions_open"],
  judging_live: ["judging_closed"],
  judging_closed: ["published", "judging_live"],
  published: ["archived", "judging_closed"],
  archived: [],
};

const PERMISSIONS: Record<PhaseAction, readonly Phase[]> = {
  submit: ["submissions_open"],
  apply: ["setup", "submissions_open", "submissions_closed"],
  dispatch: ["judging_live"],
  vote: ["judging_live"],
  compute: ["judging_live", "judging_closed"],
  publish: ["judging_closed"],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move an event from ${from} to ${to}`);
  }
}

export function phaseAllows(phase: Phase, action: PhaseAction): boolean {
  return PERMISSIONS[action].includes(phase);
}

export function assertPhaseAllows(phase: Phase, action: PhaseAction): void {
  if (!phaseAllows(phase, action)) {
    throw new Error(`${action} is not allowed while the event is ${phase}`);
  }
}
