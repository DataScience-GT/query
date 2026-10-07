/**
 * One vocabulary for the append-only log, the outbox, and the websocket.
 * The server and the web both import this so a topic cannot drift.
 */

export const LOG_KINDS = [
  "phase.changed",
  "project.upserted",
  "project.withdrawn",
  "project.table_assigned",
  "judge.upserted",
  "judge.approved",
  "judge.suspended",
  "visit.handed_out",
  "visit.arrived",
  "visit.voided",
  "vote.cast",
  "comparison.cast",
  "results.computed",
  "results.published",
  "results.unpublished",
  "judge.recalled",
] as const;

export type LogKind = (typeof LOG_KINDS)[number];

export const OUTBOX_TOPICS = [
  "visit.handed_out",
  "visit.arrived",
  "visit.voided",
  "vote.cast",
  "phase.changed",
  "results.published",
  "judge.recalled",
] as const;

export type OutboxTopic = (typeof OUTBOX_TOPICS)[number];

const OUTBOX: ReadonlySet<string> = new Set(OUTBOX_TOPICS);

export function isOutboxTopic(kind: LogKind): kind is OutboxTopic {
  return OUTBOX.has(kind);
}

export function boardChannel(eventId: string): string {
  return `event:${eventId}:board`;
}

export function leaderboardChannel(eventId: string): string {
  return `event:${eventId}:leaderboard`;
}

export function judgeChannel(judgeId: string): string {
  return `judge:${judgeId}`;
}
