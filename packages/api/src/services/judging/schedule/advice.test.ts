import { describe, expect, it } from "vitest";
import { adviceFor, slotsNeeded } from "./advice";
import type { AdviceRoom } from "./advice";
import type { JudgeInput } from "./judges";
import type { Placement, PlanInputs } from "./inputs";
import type { PlanResult } from "./solve";

const labels: Record<string, string> = { gen: "General", spon: "Sponsor Alpha" };
const labelOf = (id: string) => labels[id] ?? id;

const room = (
  id: string,
  challengeId: string,
  name: string,
  table = false,
  buildingId = "ENG",
): AdviceRoom => ({ id, challengeId, buildingId, name, table });

const task = (entryId: string, challengeId: string) => ({
  entryId,
  challengeId,
  sponsor: challengeId !== "gen",
});

const at = (
  entryId: string,
  challengeId: string,
  roomId: string,
  slot: number,
): Placement => ({ entryId, challengeId, roomId, slot });

const solved = (placements: Placement[]): PlanResult => ({
  ok: true,
  relaxed: false,
  placements,
  score: [0, 0, 0, 0, 0],
  reducedBreaks: [],
});

const members = (n: number): JudgeInput[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    kind: "member" as const,
    challengeIds: ["gen", "spon", "s0", "s1", "s2", "s3"],
    roomId: null,
  }));

const advise = (
  inputs: PlanInputs,
  result: PlanResult,
  rooms: AdviceRoom[],
  judges: JudgeInput[],
) => adviceFor({ inputs, result, rooms, judges, labelOf, slotMinutes: 10 });

describe("slotsNeeded", () => {
  it("is the larger of a challenge's crowding and a project's own presentations with breaks", () => {
    const inputs = {
      rooms: [room("r1", "gen", "Table 1"), room("r2", "gen", "Table 2")],
      tasks: [
        ...["a", "b", "c", "d", "e"].map((e) => task(e, "gen")),
        task("a", "spon"),
      ],
      sameGap: 2,
    };
    expect(slotsNeeded(inputs)).toBe(4);
    expect(slotsNeeded({ ...inputs, sameGap: 0 })).toBe(3);
  });
});

describe("adviceFor", () => {
  it("has nothing to say about a plan that fits", () => {
    const rooms = [room("g1", "gen", "Table 1", true)];
    const inputs: PlanInputs = {
      rooms,
      tasks: [task("a", "gen"), task("b", "gen")],
      slots: 10,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([at("a", "gen", "g1", 0), at("b", "gen", "g1", 1)]);
    expect(advise(inputs, result, rooms, members(2))).toEqual([]);
  });

  it("says how many presentations lack a judge and how many more judges cover them", () => {
    const rooms = ["g1", "g2", "g3", "g4"].map((id, i) =>
      room(id, "gen", `Table ${i + 1}`, true),
    );
    const inputs: PlanInputs = {
      rooms,
      tasks: ["a", "b", "c", "d"].map((e) => task(e, "gen")),
      slots: 10,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved(
      ["a", "b", "c", "d"].map((e, i) => at(e, "gen", `g${i + 1}`, 0)),
    );
    expect(advise(inputs, result, rooms, members(1))).toEqual([
      {
        kind: "judges",
        message:
          "3 presentations would have no judge. About 4 more table judges would cover them.",
      },
    ]);
  });

  it("does not count a room with a seated guest against the table judges", () => {
    const rooms = [
      room("g1", "gen", "Table 1", true),
      room("g2", "gen", "Table 2", true),
    ];
    const inputs: PlanInputs = {
      rooms,
      tasks: [task("a", "gen"), task("b", "gen")],
      slots: 10,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([at("a", "gen", "g1", 0), at("b", "gen", "g2", 0)]);
    const guest: JudgeInput = {
      id: "guest",
      kind: "guest",
      challengeIds: ["gen"],
      roomId: "g2",
    };
    expect(advise(inputs, result, rooms, [...members(1), guest])).toEqual([]);
  });

  it("offers one more room when a sponsor challenge finishes last", () => {
    const rooms = [
      room("g1", "gen", "Table 1", true),
      room("g2", "gen", "Table 2", true),
      room("s1", "spon", "Alpha 1"),
      room("x", "gen", "Alpha 2", false, "HEC"),
    ];
    const inputs: PlanInputs = {
      rooms: rooms.slice(0, 3),
      tasks: [
        task("a", "gen"),
        task("b", "gen"),
        ...["a", "b", "c", "d"].map((e) => task(e, "spon")),
      ],
      slots: 20,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([
      at("a", "gen", "g1", 0),
      at("b", "gen", "g2", 0),
      ...["a", "b", "c", "d"].map((e, i) => at(e, "spon", "s1", i)),
    ]);
    // "Alpha 2" is taken, but in another building, so it is free here.
    expect(advise(inputs, result, rooms, members(10))).toEqual([
      {
        kind: "sponsorRoom",
        message:
          "Sponsor Alpha decides when judging ends. One more room for it would finish about 20 min sooner.",
        action: {
          type: "addRooms",
          rooms: [
            { challengeId: "spon", buildingId: "ENG", name: "Alpha 2" },
          ],
        },
      },
    ]);
    // Taken in the same building: the next number.
    rooms[3] = room("x", "gen", "alpha 2");
    const [advice] = advise(inputs, result, rooms, members(10));
    expect(advice!.action).toMatchObject({
      rooms: [{ name: "Alpha 3" }],
    });
  });

  /** Sponsors s0.., each with `presentations[i]` projects over 2 rooms, back to back. */
  const sponsors = (presentations: number[]) => {
    const ids = presentations.map((_, i) => `s${i}`);
    for (const id of ids) labels[id] = `Sponsor ${id.toUpperCase()}`;
    const rooms = ids.flatMap((id, i) => [
      room(`${id}a`, id, `${id} 1`, false, i % 2 ? "HEC" : "ENG"),
      room(`${id}b`, id, `${id} 2`, false, i % 2 ? "HEC" : "ENG"),
    ]);
    const tasks = ids.flatMap((id, i) =>
      Array.from({ length: presentations[i]! }, (_, n) => task(`${id}e${n}`, id)),
    );
    const placements = ids.flatMap((id, i) =>
      Array.from({ length: presentations[i]! }, (_, n) =>
        at(`${id}e${n}`, id, `${id}${n % 2 ? "b" : "a"}`, Math.floor(n / 2)),
      ),
    );
    const inputs: PlanInputs = {
      rooms,
      tasks,
      slots: 40,
      sameGap: 1,
      crossGap: 2,
    };
    return { inputs, rooms, result: solved(placements) };
  };

  it("counts every sponsor tied for last, so one room each is advised together", () => {
    // 4 sponsors of 30 over 2 rooms all finish at slot 15; with 3 rooms, 10.
    const { inputs, rooms, result } = sponsors([30, 30, 30, 30]);
    const [advice] = advise(inputs, result, rooms, members(20));
    expect(advice!.kind).toBe("sponsorRoom");
    expect(advice!.message).toBe(
      "Sponsor S0, Sponsor S1, Sponsor S2 and Sponsor S3 decide when judging ends. One more room each would finish about 50 min sooner.",
    );
    expect(advice!.action).toEqual({
      type: "addRooms",
      rooms: [0, 1, 2, 3].map((i) => ({
        challengeId: `s${i}`,
        buildingId: i % 2 ? "HEC" : "ENG",
        name: `s${i} 3`,
      })),
    });
  });

  it("caps the saving at the slowest sponsor that is not tied", () => {
    // Two tie at 15; the third finishes at 13. Tied ones could reach 10, but
    // the day only ends at 13: 2 slots sooner.
    const { inputs, rooms, result } = sponsors([30, 30, 26]);
    const [advice] = advise(inputs, result, rooms, members(20));
    expect(advice!.message).toBe(
      "Sponsor S0 and Sponsor S1 decide when judging ends. One more room each would finish about 20 min sooner.",
    );
    expect((advice!.action as { rooms: unknown[] }).rooms).toHaveLength(2);
  });

  it("judges the sponsors against General's own floor, not where the solver put it", () => {
    // General needs 24 / 4 = 6 slots alone, but the solver left one of its
    // presentations at slot 15, level with the sponsors.
    const { inputs, rooms, result } = sponsors([30, 30]);
    const general = ["g1", "g2", "g3", "g4"].map((id, i) =>
      room(id, "gen", `Table ${i + 1}`, true),
    );
    const entries = Array.from({ length: 24 }, (_, i) => `e${i}`);
    const withGeneral: PlanInputs = {
      ...inputs,
      rooms: [...inputs.rooms, ...general],
      tasks: [...inputs.tasks, ...entries.map((e) => task(e, "gen"))],
    };
    const placed = entries.map((e, i) =>
      at(e, "gen", `g${(i % 4) + 1}`, i === 0 ? 14 : Math.floor(i / 4)),
    );
    const advice = advise(
      withGeneral,
      solved([...(result.ok ? result.placements : []), ...placed]),
      [...rooms, ...general],
      members(30),
    ).find((a) => a.kind === "sponsorRoom");
    expect(advice!.message).toBe(
      "Sponsor S0 and Sponsor S1 decide when judging ends. One more room each would finish about 50 min sooner.",
    );
  });

  it("only asks about the judges' scope when a challenge has no judge who may grade it", () => {
    const rooms = [room("s1", "spon", "Hall 1")];
    const inputs: PlanInputs = {
      rooms,
      tasks: [task("a", "spon")],
      slots: 20,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([at("a", "spon", "s1", 0)]);
    const only = members(1).map((j) => ({ ...j, challengeIds: ["gen"] }));
    expect(advise(inputs, result, rooms, only)[0]!.message).toBe(
      "1 presentation would have no judge. Check that your judges may grade these challenges.",
    );
    expect(advise(inputs, result, rooms, members(1))).toEqual([]);
  });

  it("gives no sponsor advice when a room each saves nothing", () => {
    // One sponsor of 2 projects is already one slot: no room helps.
    const { inputs, rooms, result } = sponsors([2]);
    expect(advise(inputs, result, rooms, members(20))).toEqual([]);
  });

  it("says more judges when several new rooms outrun the table judges", () => {
    const { inputs, rooms, result } = sponsors([30, 30]);
    const advice = advise(inputs, result, rooms, members(5)).find(
      (a) => a.kind === "sponsorRoom",
    );
    expect(advice!.message).toContain("It would also need more judges.");
  });

  it("names a room after the challenge when its rooms carry no number, and warns when no judge could staff it", () => {
    const rooms = [room("s1", "spon", "Main hall")];
    const inputs: PlanInputs = {
      rooms,
      tasks: ["a", "b"].map((e) => task(e, "spon")),
      slots: 20,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([at("a", "spon", "s1", 0), at("b", "spon", "s1", 1)]);
    const [advice] = advise(inputs, result, rooms, members(1));
    expect(advice).toMatchObject({
      kind: "sponsorRoom",
      action: { rooms: [{ name: "Sponsor Alpha 2" }] },
    });
    expect(advice!.message).toContain("It would also need another judge.");
  });

  it("offers to archive the tables left out, and only tables", () => {
    const all = [
      room("g1", "gen", "Table 1", true),
      room("g2", "gen", "Table 2", true),
      room("g3", "gen", "Table 3", true),
      room("g4", "gen", "Stage"),
    ];
    const inputs: PlanInputs = {
      rooms: [all[0]!],
      tasks: [task("a", "gen")],
      slots: 10,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved([at("a", "gen", "g1", 0)]);
    expect(advise(inputs, result, all, members(1))).toEqual([
      {
        kind: "unusedTables",
        message:
          "2 tables won't be used with 1 table judge. Archive them so they don't show on the room list.",
        action: { type: "archiveTables", roomIds: ["g2", "g3"] },
      },
    ]);
  });

  it("offers more tables when general judging fills the window and spare judges exist", () => {
    const rooms = [
      room("g1", "gen", "Table 1", true),
      room("g2", "gen", "Table 2", true),
    ];
    const entries = Array.from({ length: 10 }, (_, i) => `e${i}`);
    const inputs: PlanInputs = {
      rooms,
      tasks: entries.map((e) => task(e, "gen")),
      slots: 6,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved(
      entries.map((e, i) =>
        at(e, "gen", i % 2 ? "g2" : "g1", Math.floor(i / 2)),
      ),
    );
    // 10 judges seat 8 and 2 tables are in use, so 6 are spare; 10
    // presentations in 4 comfortable slots take 3 tables, so 1 more.
    expect(advise(inputs, result, rooms, members(10))).toEqual([
      {
        kind: "moreTables",
        message:
          "General decides when judging ends and your judges can staff 1 more table. Adding it would finish sooner.",
        action: {
          type: "addTables",
          challengeId: "gen",
          buildingId: "ENG",
          count: 1,
        },
      },
    ]);
  });

  it("offers more tables, and a longer window, when general judging does not fit", () => {
    const rooms = [room("g1", "gen", "Table 1", true)];
    const inputs: PlanInputs = {
      rooms,
      tasks: ["a", "b", "c", "d"].map((e) => task(e, "gen")),
      slots: 2,
      sameGap: 0,
      crossGap: 0,
    };
    const result: PlanResult = {
      ok: false,
      diagnostics: [
        {
          kind: "capacity",
          challengeId: "gen",
          presentations: 4,
          rooms: 1,
          capacity: 2,
        },
      ],
    };
    const advice = advise(inputs, result, rooms, members(5));
    expect(advice.map((a) => a.kind)).toEqual(["window", "moreTables"]);
    expect(advice[0]!.message).toBe(
      "The window holds 2 presentation slots per room, and this needs at least 4. Make the window at least 40 minutes long.",
    );
    expect(advice[1]!.action).toMatchObject({ type: "addTables", count: 3 });
  });

  it("gives no window advice when the window is long enough", () => {
    const rooms = [room("g1", "gen", "Table 1", true)];
    const inputs: PlanInputs = {
      rooms,
      tasks: [task("a", "gen")],
      slots: 5,
      sameGap: 0,
      crossGap: 0,
    };
    const result: PlanResult = {
      ok: false,
      diagnostics: [{ kind: "unplaced", entryId: "a", challengeId: "gen" }],
    };
    expect(advise(inputs, result, rooms, members(1))).toEqual([]);
  });

  it("keeps at most four, the window first", () => {
    const rooms = [room("g1", "gen", "Table 1", true)];
    const inputs: PlanInputs = {
      rooms,
      tasks: ["a", "b"].map((e) => task(e, "gen")),
      slots: 1,
      sameGap: 0,
      crossGap: 0,
    };
    const result: PlanResult = {
      ok: false,
      diagnostics: [
        {
          kind: "capacity",
          challengeId: "gen",
          presentations: 2,
          rooms: 1,
          capacity: 1,
        },
      ],
    };
    const all = [
      ...rooms,
      ...["x", "y", "z"].map((id) => room(id, "gen", id, true)),
    ];
    const advice = advise(inputs, result, all, members(5));
    expect(advice.length).toBeLessThanOrEqual(4);
    expect(advice[0]!.kind).toBe("window");
  });
});
