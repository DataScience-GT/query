import { isOutboxTopic } from "@query/judging-core";
import type { LogKind } from "@query/judging-core";

export type LogDraft = {
  kind: LogKind;
  subject: Record<string, unknown>;
  payload: Record<string, unknown>;
};

/** One log row per void, then one for the hand-out. A reload writes none. */
export function logsForHandout(voidedVisitIds: readonly string[]): LogDraft[] {
  return [
    ...voidedVisitIds.map((visitId) => ({
      kind: "visit.voided" as const,
      subject: { visitId },
      payload: {},
    })),
    {
      kind: "visit.handed_out" as const,
      subject: {},
      payload: {},
    },
  ];
}

export function isDeliveredTopic(kind: LogKind): boolean {
  return isOutboxTopic(kind);
}
