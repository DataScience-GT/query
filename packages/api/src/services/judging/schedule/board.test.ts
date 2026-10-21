import { describe, expect, it } from "vitest";
import { staffedRoomIds, withStatus } from "./board";
import type { BoardEvaluation, BoardPresence } from "./board";

const at = (time: string) => new Date(`2027-02-08T${time}:00Z`);

const appointment = {
  id: "apt",
  entryId: "a",
  challengeId: "mlh",
  roomId: "r1",
  startsAt: at("15:00"),
  endsAt: at("15:10"),
};

const presence = (over: Partial<BoardPresence>): BoardPresence => ({
  judgeId: "j1",
  roomId: "r1",
  joinedAt: at("14:00"),
  lastSeenAt: at("15:05"),
  leftAt: null,
  ...over,
});

const evaluation = (over: Partial<BoardEvaluation>): BoardEvaluation => ({
  judgeId: "j1",
  entryId: "a",
  challengeId: "mlh",
  appointmentId: null,
  ratingsComplete: true,
  ...over,
});

const roots: Record<string, string> = { mlh: "mlh", "mlh-ai": "mlh", general: "general" };
const rootIdOf = (id: string) => roots[id] ?? null;

describe("staffedRoomIds", () => {
  it("counts judges still in a room and heard from in the last 15 minutes", () => {
    const now = at("15:20");
    expect([
      ...staffedRoomIds(
        [
          presence({ roomId: "r1", lastSeenAt: at("15:05") }),
          presence({ roomId: "r2", lastSeenAt: at("15:04") }),
          presence({ roomId: "r3", lastSeenAt: at("15:19"), leftAt: at("15:19") }),
        ],
        now,
      ),
    ]).toEqual(["r1"]);
  });
});

describe("withStatus", () => {
  it("follows the clock with no evaluations, and allows moving future and missed ones", () => {
    const [before] = withStatus([appointment], [], [], rootIdOf, at("14:59"));
    expect(before).toMatchObject({ status: "future", canMove: true, evaluationCount: 0 });
    const [during] = withStatus([appointment], [], [], rootIdOf, at("15:05"));
    expect(during).toMatchObject({ status: "pending", canMove: false });
    const [after] = withStatus([appointment], [], [], rootIdOf, at("15:30"));
    expect(after).toMatchObject({ status: "missed", canMove: true });
  });

  it("matches evaluations by appointment, or by project and challenge root", () => {
    const evaluations = [
      evaluation({ judgeId: "j1", challengeId: "mlh-ai" }),
      evaluation({ judgeId: "j2", appointmentId: "apt", challengeId: "mlh" }),
      evaluation({ judgeId: "j3", appointmentId: "other" }),
      evaluation({ judgeId: "j4", challengeId: "general" }),
      evaluation({ judgeId: "j5", entryId: "b" }),
    ];
    const [row] = withStatus([appointment], evaluations, [], rootIdOf, at("15:30"));
    expect(row).toMatchObject({ evaluationCount: 2, status: "complete", canMove: false });
  });

  it("is incomplete while a judge who was in the room has not submitted", () => {
    const [row] = withStatus(
      [appointment],
      [evaluation({ judgeId: "j1" })],
      [
        presence({ judgeId: "j1" }),
        presence({ judgeId: "j2" }),
        // Left before the slot: not expected to judge it.
        presence({ judgeId: "j3", leftAt: at("14:30"), lastSeenAt: at("14:30") }),
        // Another room.
        presence({ judgeId: "j4", roomId: "r2" }),
        // Arrived after it ended.
        presence({ judgeId: "j5", joinedAt: at("15:10") }),
      ],
      rootIdOf,
      at("15:30"),
    );
    expect(row!.status).toBe("incomplete");

    const [done] = withStatus(
      [appointment],
      [evaluation({ judgeId: "j1" }), evaluation({ judgeId: "j2" })],
      [presence({ judgeId: "j1" }), presence({ judgeId: "j2" })],
      rootIdOf,
      at("15:30"),
    );
    expect(done!.status).toBe("complete");
  });
});
