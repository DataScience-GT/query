import { describe, expect, it } from "vitest";
import { moveChoices } from "./moves";
import type { MoveRequest } from "./moves";

// General in two ENG rooms and one HEC room; Mongo in HEC. "a" presents to
// Mongo at slot 2 and to General at slot 5; "b" holds g1 at slots 0-1.
const base: MoveRequest = {
  slots: 8,
  sameGap: 1,
  crossGap: 2,
  rooms: [
    { id: "g1", challengeId: "general", buildingId: "ENG" },
    { id: "g2", challengeId: "general", buildingId: "ENG" },
    { id: "g3", challengeId: "general", buildingId: "HEC" },
    { id: "m1", challengeId: "mongo", buildingId: "HEC" },
  ],
  sponsorChallengeIds: new Set(["mongo"]),
  booked: [
    { entryId: "a", challengeId: "mongo", roomId: "m1", slot: 2 },
    { entryId: "b", challengeId: "general", roomId: "g1", slot: 0 },
    { entryId: "c", challengeId: "general", roomId: "g1", slot: 1 },
  ],
  task: { entryId: "a", challengeId: "general" },
  current: { roomId: "g1", slot: 5 },
  openRoomIds: ["g1", "g2", "g3", "m1"],
  fromSlot: 1,
};

const places = (request: MoveRequest) =>
  moveChoices(request).map((c) => `${c.roomId}@${c.slot}`);

describe("moveChoices", () => {
  it("offers only free, future slots in rooms of the same challenge", () => {
    const all = places(base);
    expect(all).not.toContain("m1@6"); // another challenge's room
    expect(all).not.toContain("g1@1"); // taken by "c"
    expect(all).not.toContain("g2@0"); // already started
    expect(all).not.toContain("g1@5"); // where it already is
    expect(all).toContain("g2@6");
  });

  it("keeps at least the same-building break from the project's other presentations", () => {
    const all = places(base);
    // Mongo is at slot 2: slots 1, 2 and 3 are too close in any room.
    for (const room of ["g1", "g2", "g3"]) {
      for (const slot of [2, 3]) expect(all).not.toContain(`${room}@${slot}`);
    }
    expect(all).not.toContain("g3@1");
  });

  it("lists breaks short of the walk between buildings last, and counts them", () => {
    const choices = moveChoices(base);
    // g2@4 is in ENG, one empty slot after Mongo in HEC: a reduced break.
    const reduced = choices.find((c) => c.roomId === "g2" && c.slot === 4)!;
    expect(reduced.reducedBreaks).toBe(1);
    // g3@4 is in HEC with Mongo: a full break.
    expect(choices.find((c) => c.roomId === "g3" && c.slot === 4)!.reducedBreaks).toBe(0);
    const firstReduced = choices.findIndex((c) => c.reducedBreaks > 0);
    expect(choices.slice(firstReduced).every((c) => c.reducedBreaks > 0)).toBe(true);
    expect(choices[0]!.reducedBreaks).toBe(0);
  });

  it("ranks by the whole schedule's score", () => {
    const [smart] = moveChoices(base);
    // Ties on finish times; staying in HEC with Mongo avoids a building change.
    expect(smart).toMatchObject({ roomId: "g3", reducedBreaks: 0 });
    expect(smart!.score[3]).toBe(0);
  });

  it("skips rooms that are not open", () => {
    expect(places({ ...base, openRoomIds: ["g2"] }).every((p) => p.startsWith("g2@"))).toBe(true);
  });

  it("places a presentation that has no appointment yet", () => {
    const choices = moveChoices({
      ...base,
      task: { entryId: "d", challengeId: "general" },
      current: null,
    });
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => c.reducedBreaks === 0)).toBe(true);
    // Finishing earliest wins: g1@2 and g2@1 both end the day sooner than later slots.
    expect(choices[0]!.score[2]).toBe(3);
  });

  it("treats a room without a building as its own building", () => {
    const choices = moveChoices({
      ...base,
      rooms: base.rooms.map((r) => (r.id === "g3" ? { ...r, buildingId: null } : r)),
    });
    expect(choices.find((c) => c.roomId === "g3" && c.slot === 4)!.reducedBreaks).toBe(1);
  });

  it("offers nothing when the window is full", () => {
    expect(moveChoices({ ...base, fromSlot: 8 })).toEqual([]);
  });
});
