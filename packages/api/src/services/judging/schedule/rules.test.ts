import { describe, expect, it } from "vitest";
import { compareScores, scoreSchedule, validateSchedule } from "./rules";
import type { Placement, PlanInputs } from "./inputs";

const inputs: PlanInputs = {
  rooms: [
    { id: "g1", challengeId: "general", buildingId: "ENG" },
    { id: "g2", challengeId: "general", buildingId: "ENG" },
    { id: "s1", challengeId: "sponsor", buildingId: "HEC" },
  ],
  tasks: [
    { entryId: "a", challengeId: "general", sponsor: false },
    { entryId: "a", challengeId: "sponsor", sponsor: true },
    { entryId: "b", challengeId: "general", sponsor: false },
  ],
  slots: 6,
  sameGap: 1,
  crossGap: 2,
};

const good: Placement[] = [
  { entryId: "a", challengeId: "sponsor", roomId: "s1", slot: 0 },
  { entryId: "a", challengeId: "general", roomId: "g1", slot: 3 },
  { entryId: "b", challengeId: "general", roomId: "g1", slot: 0 },
];

const replace = (index: number, change: Partial<Placement>) =>
  good.map((p, i) => (i === index ? { ...p, ...change } : p));

describe("validateSchedule", () => {
  it("accepts a schedule that keeps every rule", () => {
    expect(validateSchedule(inputs, good, { relaxed: false })).toEqual({
      valid: true,
      errors: [],
      reducedBreaks: [],
    });
  });

  it("catches a double-booked room", () => {
    const result = validateSchedule(inputs, replace(2, { slot: 3 }), {
      relaxed: false,
    });
    expect(result.errors).toEqual(["Room g1 is double-booked."]);
  });

  it("catches a room that judges another challenge", () => {
    const result = validateSchedule(inputs, replace(1, { roomId: "s1" }), {
      relaxed: false,
    });
    expect(result.errors.join(" ")).toMatch(/another challenge/);
  });

  it("catches a missing, duplicated or unknown presentation", () => {
    expect(
      validateSchedule(inputs, good.slice(0, 2), { relaxed: false }).errors,
    ).toContain("b:general has no appointment.");
    expect(
      validateSchedule(inputs, [...good, { ...good[2]!, roomId: "g2" }], {
        relaxed: false,
      }).errors,
    ).toContain("b:general is booked more than once.");
    expect(
      validateSchedule(
        inputs,
        [...good, { entryId: "z", challengeId: "general", roomId: "g2", slot: 1 }],
        { relaxed: false },
      ).valid,
    ).toBe(false);
  });

  it("catches a slot outside the window", () => {
    for (const slot of [-1, 6, 1.5]) {
      expect(
        validateSchedule(inputs, replace(2, { slot }), { relaxed: false })
          .errors,
      ).toContain("b:general is outside the judging window.");
    }
  });

  it("catches a project in two places at once", () => {
    const result = validateSchedule(
      inputs,
      [
        { entryId: "a", challengeId: "sponsor", roomId: "s1", slot: 2 },
        { entryId: "a", challengeId: "general", roomId: "g1", slot: 2 },
        good[2]!,
      ],
      { relaxed: true },
    );
    expect(result.errors).toContain("a has too little time between presentations.");
  });

  it("needs the same-building break within a building", () => {
    const tight: PlanInputs = {
      ...inputs,
      rooms: inputs.rooms.map((r) => ({ ...r, buildingId: "ENG" })),
    };
    expect(
      validateSchedule(tight, replace(1, { slot: 2 }), { relaxed: false }).valid,
    ).toBe(true);
    expect(
      validateSchedule(tight, replace(1, { slot: 1 }), { relaxed: false }).valid,
    ).toBe(false);
  });

  it("needs the cross-building break when the building changes", () => {
    const short = replace(1, { slot: 2 });
    expect(validateSchedule(inputs, short, { relaxed: false }).valid).toBe(false);

    const relaxed = validateSchedule(inputs, short, { relaxed: true });
    expect(relaxed.valid).toBe(true);
    expect(relaxed.reducedBreaks).toEqual([
      { entryId: "a", fromRoomId: "s1", toRoomId: "g1", gap: 1 },
    ]);
    // Relaxed still keeps the same-building minimum.
    expect(
      validateSchedule(inputs, replace(1, { slot: 1 }), { relaxed: true }).valid,
    ).toBe(false);
  });
});

describe("scoreSchedule", () => {
  it("scores finish times, sponsor idle, building changes and breaks", () => {
    // Sponsor ends after slot 0; everything after slot 3; "a" changes
    // building once with two empty slots between.
    expect(scoreSchedule(inputs, good)).toEqual([1, 0, 4, 1, -2]);
  });

  it("counts idle slots inside a sponsor room's busy span", () => {
    const sponsorOnly = {
      rooms: inputs.rooms,
      tasks: [
        { entryId: "a", challengeId: "sponsor", sponsor: true },
        { entryId: "b", challengeId: "sponsor", sponsor: true },
      ],
    };
    expect(
      scoreSchedule(sponsorOnly, [
        { entryId: "a", challengeId: "sponsor", roomId: "s1", slot: 1 },
        { entryId: "b", challengeId: "sponsor", roomId: "s1", slot: 4 },
      ]),
    ).toEqual([5, 2, 5, 0, 0]);
  });

  it("is all zeros for an empty schedule", () => {
    expect(scoreSchedule(inputs, [])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("compareScores", () => {
  it("compares left to right", () => {
    expect(compareScores([1, 9, 9, 9, 9], [2, 0, 0, 0, 0])).toBeLessThan(0);
    expect(compareScores([2, 0, 5, 0, 0], [2, 0, 4, 9, 9])).toBeGreaterThan(0);
    expect(compareScores([1, 2, 3, 4, -5], [1, 2, 3, 4, -5])).toBe(0);
    expect(compareScores([1, 2, 3, 4, -6], [1, 2, 3, 4, -5])).toBeLessThan(0);
  });
});
