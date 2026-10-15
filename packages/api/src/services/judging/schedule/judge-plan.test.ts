import { describe, expect, it } from "vitest";
import {
  judgeChanges,
  judgeChoices,
  judgePlanOf,
  rosterOf,
} from "./judge-plan";
import type { JudgeRow, SavedAppointment } from "./judge-plan";
import type { ChallengeRow } from "../evaluation-store";

const challenge = (
  id: string,
  over: Partial<ChallengeRow> = {},
): ChallengeRow => ({
  id,
  parentId: null,
  mode: "scheduled",
  label: id,
  isGeneral: false,
  isGroup: false,
  ...over,
});

// General and one sponsor are scheduled; MLH is a group of two unscheduled prizes.
const challenges: ChallengeRow[] = [
  challenge("general", { isGeneral: true }),
  challenge("acme"),
  challenge("mlh", { isGroup: true, mode: "unscheduled" }),
  challenge("mongo", { parentId: "mlh", mode: "unscheduled" }),
];

const rooms = [
  { id: "g1", challengeId: "general", buildingId: "ENG" },
  { id: "a1", challengeId: "acme", buildingId: "HEC" },
];

const judgeRows: JudgeRow[] = [
  { id: "m1", kind: "member", userId: "u1", displayName: "Ada" },
  { id: "gs", kind: "guest", userId: null, displayName: "Grace" },
  { id: "lost", kind: "guest", userId: null, displayName: "Nobody" },
];

describe("rosterOf", () => {
  const roster = (over: Partial<Parameters<typeof rosterOf>[0]> = {}) =>
    rosterOf({
      hackathonId: "h",
      judges: judgeRows,
      seats: [
        {
          judgeId: "gs",
          roomId: "a1",
          createdAt: new Date("2027-02-06T12:00:00Z"),
        },
      ],
      challenges,
      rooms,
      ...over,
    });

  it("lets a member grade every scheduled challenge and a guest only their room's", () => {
    const { judges } = roster();
    expect(judges).toEqual([
      { id: "gs", kind: "guest", challengeIds: ["acme"], roomId: "a1" },
      {
        id: "m1",
        kind: "member",
        challengeIds: ["acme", "general"],
        roomId: null,
      },
    ]);
  });

  it("leaves out a guest with no session, or whose room takes no appointments", () => {
    expect(roster({ seats: [] }).judges.map((j) => j.id)).toEqual(["m1"]);
    expect(
      roster({
        seats: [
          { judgeId: "gs", roomId: "unscheduled-room", createdAt: new Date() },
        ],
      }).judges.map((j) => j.id),
    ).toEqual(["m1"]);
  });

  it("seats a guest in the room of their latest session", () => {
    const { judges } = roster({
      seats: [
        {
          judgeId: "gs",
          roomId: "g1",
          createdAt: new Date("2027-02-06T09:00:00Z"),
        },
        {
          judgeId: "gs",
          roomId: "a1",
          createdAt: new Date("2027-02-06T13:00:00Z"),
        },
        {
          judgeId: "gs",
          roomId: "g1",
          createdAt: new Date("2027-02-06T11:00:00Z"),
        },
      ],
    });
    expect(judges.find((j) => j.id === "gs")).toMatchObject({
      roomId: "a1",
      challengeIds: ["acme"],
    });
  });

  it("names every judge, including those it cannot assign", () => {
    expect(roster().names.get("lost")).toBe("Nobody");
  });
});

const appointment = (
  id: string,
  over: Partial<SavedAppointment> = {},
): SavedAppointment => ({
  id,
  entryId: `e-${id}`,
  challengeId: "general",
  roomId: "g1",
  slot: 0,
  assignedJudgeId: null,
  removed: false,
  open: true,
  ...over,
});

describe("judgePlanOf", () => {
  const plan = (appointments: SavedAppointment[]) =>
    judgePlanOf({
      rooms: [
        ...rooms,
        { id: "old", challengeId: "general", buildingId: null },
      ],
      sponsorChallengeIds: new Set(["acme"]),
      grid: { slots: 10, sameGap: 1, crossGap: 2 },
      appointments,
      judgeIds: new Set(["m1", "m2"]),
    });

  it("plans the appointments that are open or already have a judge", () => {
    const result = plan([
      appointment("open"),
      appointment("kept", { open: false, assignedJudgeId: "m1", slot: 3 }),
      appointment("under-way", { open: false, slot: 5 }),
      appointment("gone", { removed: true, assignedJudgeId: "m1", slot: 6 }),
    ]);
    expect(result.placements.map((p) => p.entryId)).toEqual([
      "e-open",
      "e-kept",
    ]);
    expect(result.inputs.tasks).toHaveLength(2);
    expect(result.keep).toEqual([
      { entryId: "e-kept", challengeId: "general", judgeId: "m1" },
    ]);
    expect(result.current).toEqual(result.keep);
  });

  it("marks sponsor challenges and gives a room without a building its own", () => {
    const result = plan([
      appointment("s", { challengeId: "acme", roomId: "a1" }),
    ]);
    expect(result.inputs.tasks[0]).toMatchObject({ sponsor: true });
    expect(result.inputs.rooms.find((r) => r.id === "old")!.buildingId).toBe(
      "room:old",
    );
    expect(result.inputs).toMatchObject({ slots: 10, sameGap: 1, crossGap: 2 });
  });

  it("counts a judge on an open appointment as current, not kept", () => {
    const result = plan([appointment("o", { assignedJudgeId: "m1" })]);
    expect(result.keep).toEqual([]);
    expect(result.current).toHaveLength(1);
  });

  it("drops an appointment under way whose judge has left the roster", () => {
    // Kept, it would hold a presentation for a judge nobody can plan around,
    // and CP-SAT's answer would be refused for not keeping it.
    const result = plan([
      appointment("gone-judge", {
        open: false,
        assignedJudgeId: "g9",
        slot: 2,
      }),
      appointment("open-gone-judge", { assignedJudgeId: "g9", slot: 4 }),
    ]);
    expect(result.placements.map((p) => p.entryId)).toEqual([
      "e-open-gone-judge",
    ]);
    expect(result.keep).toEqual([]);
  });
});

describe("judgeChanges", () => {
  it("lists the open appointments whose judge differs, null where nobody is left", () => {
    const appointments = [
      appointment("same", { assignedJudgeId: "m1" }),
      appointment("new"),
      appointment("moved", { assignedJudgeId: "m1" }),
      appointment("dropped", { assignedJudgeId: "m1" }),
      appointment("closed", { open: false, assignedJudgeId: "m1" }),
    ];
    const changes = judgeChanges(appointments, [
      { entryId: "e-same", challengeId: "general", judgeId: "m1" },
      { entryId: "e-new", challengeId: "general", judgeId: "m2" },
      { entryId: "e-moved", challengeId: "general", judgeId: "m2" },
      { entryId: "e-closed", challengeId: "general", judgeId: "m2" },
    ]);
    expect(changes).toEqual([
      { id: "new", assignedJudgeId: "m2" },
      { id: "moved", assignedJudgeId: "m2" },
      { id: "dropped", assignedJudgeId: null },
    ]);
  });
});

describe("judgeChoices", () => {
  const roster = rosterOf({
    hackathonId: "h",
    judges: judgeRows,
    seats: [{ judgeId: "gs", roomId: "a1", createdAt: new Date() }],
    challenges,
    rooms,
  });

  it("offers the judges who may grade the appointment there, and marks the booked", () => {
    const target = appointment("t", { slot: 2 });
    const all = [
      target,
      appointment("other", {
        roomId: "a1",
        challengeId: "acme",
        slot: 2,
        assignedJudgeId: "m1",
      }),
    ];
    expect(judgeChoices(roster, target, all)).toEqual([
      { judgeId: "m1", bookedWith: "other" },
    ]);
    // Free once their other appointment is at another time.
    all[1] = { ...all[1]!, slot: 4 };
    expect(judgeChoices(roster, target, all)).toEqual([
      { judgeId: "m1", bookedWith: null },
    ]);
  });

  it("offers a guest only their own room", () => {
    const sponsor = appointment("s", { challengeId: "acme", roomId: "a1" });
    expect(
      judgeChoices(roster, sponsor, [sponsor]).map((c) => c.judgeId),
    ).toEqual(["gs", "m1"]);
  });

  it("ignores a booking for a project no longer entered", () => {
    const target = appointment("t", { slot: 2 });
    const gone = appointment("g", {
      removed: true,
      slot: 2,
      assignedJudgeId: "m1",
      roomId: "a1",
      challengeId: "acme",
    });
    expect(judgeChoices(roster, target, [target, gone])[0]).toMatchObject({
      bookedWith: null,
    });
  });
});
