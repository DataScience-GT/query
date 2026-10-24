import { describe, expect, it } from "vitest";
import {
  LEFT_GRACE_MS,
  QUIET_AFTER_MS,
  absentJudgeIds,
  rebalancePlan,
  receiverIds,
} from "./rebalance";
import type { SavedAppointment } from "./judge-plan";

const NOW = new Date("2027-02-06T15:00:00Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * MIN);

const judges = [
  { id: "m1", kind: "member" as const },
  { id: "m2", kind: "member" as const },
  { id: "gs", kind: "guest" as const },
];
const seen = (judgeId: string, lastSeenMs: number, leftAt: Date | null = null) => ({
  judgeId,
  joinedAt: ago(120 * MIN),
  lastSeenAt: ago(lastSeenMs),
  leftAt,
});
const due = (
  assignedJudgeId: string | null,
  startsAt: Date,
  over: { open?: boolean; status?: string } = {},
) => ({
  assignedJudgeId,
  startsAt,
  open: true,
  status: "future",
  ...over,
});
// Judging is under way unless a test says otherwise: something began an hour ago.
const started = due(null, ahead(-60), { open: false, status: "complete" });
const absent = (
  presence: ReturnType<typeof seen>[],
  appointments: ReturnType<typeof due>[] = [started],
) => [...absentJudgeIds({ judges, presence, appointments, now: NOW })].sort();

describe("absentJudgeIds", () => {
  it("keeps a judge who left a room and joined another on the way", () => {
    expect(
      absent([
        seen("m1", 3 * MIN, ago(2 * MIN)),
        seen("m1", 10_000),
        seen("m2", 0),
      ]),
    ).toEqual([]);
    // Still walking: left two minutes ago, nothing joined yet.
    expect(absent([seen("m1", 3 * MIN, ago(2 * MIN))])).toEqual([]);
  });

  it("counts a judge who left more than five minutes ago and joined nothing", () => {
    expect(absent([seen("m1", 8 * MIN, ago(LEFT_GRACE_MS + 1))])).toEqual(["m1"]);
    expect(absent([seen("m1", 8 * MIN, ago(6 * MIN)), seen("m2", 0)])).toEqual([
      "m1",
    ]);
  });

  it("counts a judge quiet for more than ten minutes, not one quiet for nine", () => {
    expect(absent([seen("m1", 9 * MIN)])).toEqual([]);
    expect(absent([seen("m1", QUIET_AFTER_MS), seen("m2", 11 * MIN)])).toEqual([
      "m2",
    ]);
  });

  it("counts a judge who missed a presentation and was not seen since it began", () => {
    const missed = due("m1", ago(20 * MIN), { open: false, status: "missed" });
    // No presence at all.
    expect(absent([], [started, missed])).toEqual(["m1"]);
    // Seen only before it began.
    expect(
      absent(
        [{ ...seen("m1", 0), joinedAt: ago(90 * MIN), lastSeenAt: ago(40 * MIN) }],
        [started, missed],
      ),
    ).toEqual(["m1"]);
  });

  it("keeps a judge who missed a presentation but was seen after it began", () => {
    const missed = due("m1", ago(20 * MIN), { open: false, status: "missed" });
    expect(absent([seen("m1", 5 * MIN)], [started, missed])).toEqual([]);
  });

  it("keeps a judge nobody has seen before judging starts", () => {
    expect(
      absent([], [due("m1", ahead(5)), due("m2", ahead(8))]),
    ).toEqual([]);
  });

  it("counts a judge never seen once judging is under way and theirs is near", () => {
    expect(
      absent([], [started, due("m1", ahead(8)), due("m2", ahead(11))]),
    ).toEqual(["m1"]);
  });

  it("keeps a judge never seen while nothing of theirs is near", () => {
    expect(absent([], [started, due("m1", ahead(60)), due(null, ahead(1))])).toEqual(
      [],
    );
  });

  it("leaves guests alone, however quiet", () => {
    expect(
      absent([seen("gs", 600 * MIN, ago(60 * MIN))], [started, due("gs", ahead(1))]),
    ).toEqual([]);
  });
});

describe("receiverIds", () => {
  const receivers = (
    presence: ReturnType<typeof seen>[],
    absentIds: string[] = [],
  ) =>
    [
      ...receiverIds({ judges, presence, absent: new Set(absentIds), now: NOW }),
    ].sort();

  it("lets a member with a room open or seen lately take work, and guests always", () => {
    expect(receivers([seen("m1", 0), seen("m2", 9 * MIN)])).toEqual([
      "gs",
      "m1",
      "m2",
    ]);
  });

  it("does not let a member who never arrived take work", () => {
    expect(receivers([seen("m1", 0)])).toEqual(["gs", "m1"]);
  });

  it("does not let an absent member take work", () => {
    expect(receivers([seen("m1", 0), seen("m2", 0)], ["m2"])).toEqual([
      "gs",
      "m1",
    ]);
  });

  it("lets a member who walked off and is not yet absent take work", () => {
    expect(receivers([seen("m1", 2 * MIN, ago(MIN))])).toEqual(["gs", "m1"]);
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
