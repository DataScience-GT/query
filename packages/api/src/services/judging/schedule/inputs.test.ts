import { describe, expect, it } from "vitest";
import {
  candidateKey,
  planFingerprint,
  planInputs,
  scheduledChallengeIds,
  selectPlan,
} from "./inputs";
import type { SourceChallenge, SourceRoom } from "./inputs";
import type { ScheduleTiming } from "./slots";

const challenges: SourceChallenge[] = [
  { id: "general", parentId: null, mode: "scheduled", isGeneral: true },
  { id: "mongo", parentId: null, mode: "scheduled", isGeneral: false },
  { id: "mlh", parentId: null, mode: "unscheduled", isGeneral: false },
  { id: "mlh-ai", parentId: "mlh", mode: "scheduled", isGeneral: false },
  { id: "remote", parentId: null, mode: "remote", isGeneral: false },
];

const rooms: SourceRoom[] = [
  { id: "r2", challengeId: "general", buildingId: "eng", archivedAt: null },
  { id: "r1", challengeId: "general", buildingId: "eng", archivedAt: null },
  { id: "r3", challengeId: "general", buildingId: null, archivedAt: null },
  { id: "r4", challengeId: "mongo", buildingId: "hec", archivedAt: new Date() },
  { id: "r5", challengeId: "mlh", buildingId: "hec", archivedAt: null },
];

const memberships = [
  { entryId: "b", challengeId: "general" },
  { entryId: "a", challengeId: "mongo" },
  { entryId: "a", challengeId: "general" },
  { entryId: "a", challengeId: "mlh" },
  { entryId: "a", challengeId: "mlh-ai" },
  { entryId: "a", challengeId: "remote" },
];

const timing: ScheduleTiming = {
  windowStart: new Date("2027-02-08T14:00:00Z"),
  windowEnd: new Date("2027-02-08T16:00:00Z"),
  setupMinutes: 2,
  judgingMinutes: 6,
  teardownMinutes: 2,
  sameBuildingBreakMinutes: 10,
  crossBuildingBreakMinutes: 20,
};

describe("selectPlan", () => {
  it("schedules only top-level challenges judged on the schedule", () => {
    expect([...scheduledChallengeIds(challenges)]).toEqual(["general", "mongo"]);
  });

  it("keeps rooms in service with a building, sorted by id", () => {
    expect(selectPlan({ challenges, rooms, memberships }).rooms).toEqual([
      { id: "r1", challengeId: "general", buildingId: "eng" },
      { id: "r2", challengeId: "general", buildingId: "eng" },
    ]);
  });

  it("makes one task per project and scheduled challenge, sponsors flagged", () => {
    expect(selectPlan({ challenges, rooms, memberships }).tasks).toEqual([
      { entryId: "a", challengeId: "general", sponsor: false },
      { entryId: "a", challengeId: "mongo", sponsor: true },
      { entryId: "b", challengeId: "general", sponsor: false },
    ]);
  });

  it("counts a challenge whose parent link loops as unscheduled", () => {
    expect([
      ...scheduledChallengeIds([
        { id: "x", parentId: "y", mode: "scheduled", isGeneral: false },
        { id: "y", parentId: "x", mode: "scheduled", isGeneral: false },
      ]),
    ]).toEqual([]);
  });
});

describe("fingerprint and candidate key", () => {
  const plan = selectPlan({ challenges, rooms, memberships });

  it("puts the timing on the grid", () => {
    expect(planInputs(plan, timing)).toMatchObject({
      slots: 12,
      sameGap: 1,
      crossGap: 2,
    });
  });

  it("ignores input order but not content", () => {
    const shuffled = {
      rooms: [...plan.rooms].reverse(),
      tasks: [...plan.tasks].reverse(),
    };
    expect(planFingerprint(shuffled, timing)).toBe(planFingerprint(plan, timing));
    expect(
      planFingerprint({ ...plan, tasks: plan.tasks.slice(1) }, timing),
    ).not.toBe(planFingerprint(plan, timing));
    expect(
      planFingerprint(plan, { ...timing, crossBuildingBreakMinutes: 30 }),
    ).not.toBe(planFingerprint(plan, timing));
  });

  it("changes with any placement or the relaxed flag", () => {
    const fp = planFingerprint(plan, timing);
    const placements = [
      { entryId: "a", challengeId: "general", roomId: "r1", slot: 3 },
      { entryId: "b", challengeId: "general", roomId: "r1", slot: 0 },
    ];
    const key = candidateKey(fp, false, placements);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(candidateKey(fp, false, [...placements].reverse())).toBe(key);
    expect(candidateKey(fp, true, placements)).not.toBe(key);
    expect(
      candidateKey(fp, false, [{ ...placements[0]!, slot: 4 }, placements[1]!]),
    ).not.toBe(key);
  });
});
