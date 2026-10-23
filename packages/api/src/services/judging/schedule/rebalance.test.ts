import { describe, expect, it } from "vitest";
import {
  ABSENT_AFTER_MS,
  absentJudgeIds,
  rebalancePlan,
} from "./rebalance";
import type { SavedAppointment } from "./judge-plan";

const NOW = new Date("2027-02-06T15:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const judges = [
  { id: "m1", kind: "member" as const },
  { id: "m2", kind: "member" as const },
  { id: "gs", kind: "guest" as const },
];
const seen = (judgeId: string, lastSeenMs: number, leftAt: Date | null = null) => ({
  judgeId,
  joinedAt: ago(60 * 60_000),
  lastSeenAt: ago(lastSeenMs),
  leftAt,
});
const due = (assignedJudgeId: string | null, startsAt: Date, open = true) => ({
  assignedJudgeId,
  startsAt,
  open,
});
const absent = (
  presence: ReturnType<typeof seen>[],
  appointments: ReturnType<typeof due>[] = [],
) => [...absentJudgeIds({ judges, presence, appointments, now: NOW })].sort();

describe("absentJudgeIds", () => {
  it("counts a judge who left and has no open row", () => {
    expect(
      absent([seen("m1", 60_000, ago(30_000)), seen("m2", 30_000)]),
    ).toEqual(["m1"]);
  });

  it("does not count a judge who left one room and joined another", () => {
    expect(
      absent([seen("m1", 600_000, ago(300_000)), seen("m1", 10_000), seen("m2", 0)]),
    ).toEqual([]);
  });

  it("counts a judge whose heartbeat is older than three minutes", () => {
    expect(
      absent([seen("m1", ABSENT_AFTER_MS + 1), seen("m2", ABSENT_AFTER_MS)]),
    ).toEqual(["m1"]);
  });

  it("counts a judge who never joined once a presentation of theirs is near", () => {
    expect(absent([], [due("m1", ahead(10)), due("m2", ahead(11))])).toEqual([
      "m1",
    ]);
    expect(absent([], [due("m1", ahead(-5))])).toEqual(["m1"]);
  });

  it("keeps a judge who never joined while nothing of theirs is due", () => {
    expect(absent([], [due("m1", ahead(60)), due(null, ahead(1))])).toEqual([]);
    // Over or under way: not open, so it says nothing about being late.
    expect(absent([], [due("m1", ahead(-30), false)])).toEqual([]);
  });

  it("leaves guests alone, however quiet", () => {
    expect(
      absent([seen("gs", 60 * 60_000, ago(1_000))], [due("gs", ahead(1))]),
    ).toEqual([]);
  });
});

const saved = (
  id: string,
  assignedJudgeId: string | null,
  over: Partial<SavedAppointment> = {},
): SavedAppointment => ({
  id,
  entryId: `e-${id}`,
  challengeId: "general",
  roomId: "g1",
  slot: 5,
  assignedJudgeId,
  removed: false,
  open: true,
  ...over,
});

describe("rebalancePlan", () => {
  it("frees open appointments of judges who are gone, and ones with no judge", () => {
    const plan = rebalancePlan(
      [saved("a", "m1"), saved("b", "m2"), saved("c", null), saved("d", "lost")],
      new Set(["m2"]),
    );
    expect(plan.free.map((a) => a.id)).toEqual(["a", "c", "d"]);
  });

  it("keeps the open appointments of judges who are here", () => {
    const plan = rebalancePlan(
      [saved("a", "m1"), saved("b", "m2")],
      new Set(["m2"]),
    );
    expect(plan.keep).toEqual([
      { entryId: "e-b", challengeId: "general", judgeId: "m2" },
    ]);
  });

  it("ignores appointments that are not open or are removed", () => {
    const plan = rebalancePlan(
      [
        saved("a", "m1", { open: false }),
        saved("b", null, { open: false }),
        saved("c", "m1", { removed: true }),
      ],
      new Set(),
    );
    expect(plan).toEqual({ free: [], keep: [] });
  });
});
