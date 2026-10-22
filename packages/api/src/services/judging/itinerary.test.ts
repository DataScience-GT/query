import { describe, expect, it } from "vitest";
import {
  buildItinerary,
  evaluationsForAppointment,
  groupFeedback,
  visibleChallenges,
} from "./itinerary";
import type {
  ItineraryAppointment,
  ItineraryChallenge,
  ItineraryRoom,
} from "./itinerary";

const challenge = (
  id: string,
  over: Partial<ItineraryChallenge> = {},
): ItineraryChallenge => ({
  id,
  label: id,
  parentId: null,
  mode: "scheduled",
  displayOrder: 0,
  ...over,
});

const challenges: ItineraryChallenge[] = [
  challenge("general", { label: "General", displayOrder: 0 }),
  challenge("mlh", {
    label: "MLH Challenges",
    mode: "unscheduled",
    displayOrder: 2,
  }),
  challenge("mongo", {
    label: "Best use of MongoDB",
    parentId: "mlh",
    mode: "scheduled",
  }),
  challenge("cloud", { label: "Best use of Cloudflare", parentId: "mlh" }),
  challenge("sponsor", { label: "Sponsor Prize", displayOrder: 1 }),
  challenge("online", { label: "Online Judging", mode: "remote" }),
];

const room = (
  id: string,
  over: Partial<ItineraryRoom> = {},
): ItineraryRoom => ({
  id,
  challengeId: "general",
  name: id,
  kind: "room",
  building: "Klaus",
  displayOrder: 0,
  archived: false,
  ...over,
});

const at = (minute: number) => new Date(Date.UTC(2027, 1, 8, 15, minute));
// Grading closes 15s past a deadline (timing.ts).
const closes = (minute: number) => new Date(at(minute).getTime() + 15_000);

const slot = (
  id: string,
  challengeId: string,
  roomId: string,
  startMinute: number,
): ItineraryAppointment => ({
  id,
  challengeId,
  roomId,
  startsAt: at(startMinute),
  deadlineAt: at(startMinute + 8),
  endsAt: at(startMinute + 10),
});

describe("visibleChallenges", () => {
  it("groups under roots, drops remote, keeps display order", () => {
    expect(
      visibleChallenges(challenges, [
        "online",
        "mongo",
        "mlh",
        "general",
        "sponsor",
        "general",
      ]),
    ).toEqual([
      { id: "general", label: "General", mode: "scheduled", children: [] },
      {
        id: "sponsor",
        label: "Sponsor Prize",
        mode: "scheduled",
        children: [],
      },
      {
        id: "mlh",
        label: "MLH Challenges",
        // A child is judged the way its root is.
        mode: "unscheduled",
        children: ["Best use of MongoDB"],
      },
    ]);
  });

  it("shows a root reached only through a child", () => {
    expect(visibleChallenges(challenges, ["cloud"])).toEqual([
      {
        id: "mlh",
        label: "MLH Challenges",
        mode: "unscheduled",
        children: ["Best use of Cloudflare"],
      },
    ]);
  });
});

describe("evaluationsForAppointment", () => {
  it("takes evaluations of the slot and untimed ones in its challenge tree", () => {
    const evaluations = [
      {
        judgeId: "a",
        challengeId: "general",
        appointmentId: "s1",
        ratingsComplete: true,
      },
      {
        judgeId: "b",
        challengeId: "general",
        appointmentId: null,
        ratingsComplete: true,
      },
      {
        judgeId: "c",
        challengeId: "general",
        appointmentId: "s9",
        ratingsComplete: true,
      },
      {
        judgeId: "d",
        challengeId: "sponsor",
        appointmentId: null,
        ratingsComplete: true,
      },
    ];
    expect(
      evaluationsForAppointment(
        { id: "s1", challengeId: "general" },
        evaluations,
        challenges,
      ).map((e) => e.judgeId),
    ).toEqual(["a", "b"]);
  });
});

describe("buildItinerary", () => {
  const rooms = [
    room("r1", { name: "Room 1" }),
    room("r2", { name: "Room 2", challengeId: "sponsor", building: "CULC" }),
    room("m1", {
      name: "MLH Table",
      kind: "table",
      challengeId: "mlh",
      displayOrder: 1,
    }),
    room("m0", { name: "MLH Booth", challengeId: "mlh", building: null }),
    room("m9", { name: "Old Table", challengeId: "mlh", archived: true }),
  ];
  const base = {
    challenges,
    entryChallengeIds: ["general", "sponsor", "mlh", "mongo", "online"],
    rooms,
    appointments: [
      slot("s2", "sponsor", "r2", 30),
      slot("s1", "general", "r1", 0),
      slot("s3", "online", "r1", 60),
    ],
    evaluations: [],
  };

  it("lists appointments in time order with room, building and status", () => {
    const itinerary = buildItinerary({ ...base, now: at(5) });
    expect(itinerary.appointments).toEqual([
      expect.objectContaining({
        id: "s1",
        challenge: "General",
        room: "Room 1",
        building: "Klaus",
        status: "pending",
      }),
      expect.objectContaining({
        id: "s2",
        challenge: "Sponsor Prize",
        room: "Room 2",
        building: "CULC",
        status: "future",
      }),
    ]);
    // Remote judging never reaches hackers.
    expect(itinerary.appointments.map((a) => a.id)).not.toContain("s3");
    expect(itinerary.missed).toBe(false);
    expect(itinerary.nextEndsAt).toEqual(closes(8));
  });

  it("flags a missed slot and points the refetch at the next close", () => {
    const itinerary = buildItinerary({ ...base, now: at(9) });
    expect(itinerary.appointments[0]!.status).toBe("missed");
    expect(itinerary.missed).toBe(true);
    expect(itinerary.nextEndsAt).toEqual(closes(38));
    expect(buildItinerary({ ...base, now: at(45) }).nextEndsAt).toBeNull();
  });

  it("marks a slot complete once its judges submit", () => {
    const itinerary = buildItinerary({
      ...base,
      evaluations: [
        {
          judgeId: "j1",
          challengeId: "general",
          appointmentId: "s1",
          ratingsComplete: true,
        },
      ],
      now: at(12),
    });
    expect(itinerary.appointments[0]!.status).toBe("complete");
    expect(itinerary.missed).toBe(false);
  });

  it("keeps a slot incomplete while an evaluation lacks a rating", () => {
    const itinerary = buildItinerary({
      ...base,
      evaluations: [
        {
          judgeId: "j1",
          challengeId: "general",
          appointmentId: "s1",
          ratingsComplete: false,
        },
      ],
      now: at(12),
    });
    expect(itinerary.appointments[0]!.status).toBe("incomplete");
  });

  it("lists unscheduled challenges with their live rooms and whether judged", () => {
    const pending = buildItinerary({ ...base, now: at(5) });
    expect(pending.unscheduled).toEqual([
      {
        challengeId: "mlh",
        challenge: "MLH Challenges",
        children: ["Best use of MongoDB"],
        rooms: [
          { name: "MLH Booth", kind: "room", building: null },
          { name: "MLH Table", kind: "table", building: "Klaus" },
        ],
        judged: false,
      },
    ]);

    const judged = buildItinerary({
      ...base,
      evaluations: [
        {
          judgeId: "j1",
          challengeId: "mlh",
          appointmentId: null,
          ratingsComplete: true,
        },
      ],
      now: at(5),
    });
    expect(judged.unscheduled[0]!.judged).toBe(true);

    const unrated = buildItinerary({
      ...base,
      evaluations: [
        {
          judgeId: "j1",
          challengeId: "mlh",
          appointmentId: null,
          ratingsComplete: false,
        },
      ],
      now: at(5),
    });
    expect(unrated.unscheduled[0]!.judged).toBe(false);
  });
});

describe("groupFeedback", () => {
  it("orders by challenge then arrival, and drops blank answers", () => {
    const items = groupFeedback(
      [
        { id: "e2", challengeId: "sponsor", submittedAt: at(40) },
        { id: "e1", challengeId: "general", submittedAt: at(30) },
        { id: "e3", challengeId: "general", submittedAt: at(5) },
        { id: "e4", challengeId: "general", submittedAt: at(50) },
      ],
      [
        {
          evaluationId: "e1",
          label: "Next steps",
          displayOrder: 2,
          value: " Ship it ",
        },
        {
          evaluationId: "e1",
          label: "Strengths",
          displayOrder: 1,
          value: "Clear demo",
        },
        {
          evaluationId: "e2",
          label: "Strengths",
          displayOrder: 1,
          value: "Great API use",
        },
        {
          evaluationId: "e3",
          label: "Strengths",
          displayOrder: 1,
          value: "Bold idea",
        },
        {
          evaluationId: "e4",
          label: "Strengths",
          displayOrder: 1,
          value: "   ",
        },
      ],
      challenges,
    );
    expect(items).toEqual([
      {
        challenge: "General",
        responses: [{ label: "Strengths", value: "Bold idea" }],
      },
      {
        challenge: "General",
        responses: [
          { label: "Strengths", value: "Clear demo" },
          { label: "Next steps", value: "Ship it" },
        ],
      },
      {
        challenge: "Sponsor Prize",
        responses: [{ label: "Strengths", value: "Great API use" }],
      },
    ]);
  });
});
