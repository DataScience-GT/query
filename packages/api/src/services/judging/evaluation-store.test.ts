import { describe, expect, it } from "vitest";
import {
  evaluatedChallenge,
  guestScope,
  inJudgeScope,
  reconcileDueDrafts,
} from "./evaluation-store";
import type { ChallengeRow, Seat } from "./evaluation-store";
import type { Judge } from "./principal";
import type { DrizzleDB } from "@query/db";

// General (scheduled)
// Sponsor prize (scheduled)
// MLH Challenges (unscheduled group)
//   ├── Best Use of MongoDB
//   └── Best Domain Name
const row = (id: string, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  id,
  parentId: null,
  mode: "scheduled",
  label: id,
  isGeneral: false,
  isGroup: false,
  ...over,
});
const challenges: ChallengeRow[] = [
  row("sponsor"),
  row("general", { isGeneral: true }),
  row("mlh", { isGroup: true, mode: "unscheduled" }),
  row("mongo", { parentId: "mlh" }),
  row("domain", { parentId: "mlh" }),
];

const member: Judge = {
  kind: "member",
  hackathonId: "h",
  userId: "u",
  judgeId: "j",
  displayName: "Ada",
};
const guest: Judge = {
  kind: "guest",
  hackathonId: "h",
  sessionId: "s",
  linkId: "l",
  roomId: "r",
  roomChallengeId: "mlh",
  judgeId: "g",
  displayName: "Grace",
};
const seat = (challengeId: string): Seat => ({
  roomId: "room",
  roomName: "Room",
  challengeId,
});

describe("guest scope", () => {
  it("is the room's challenge and everything below it", () => {
    expect([...guestScope(challenges, "mlh")].sort()).toEqual([
      "domain",
      "mlh",
      "mongo",
    ]);
  });

  it("lets members see every challenge, guests only their room's", () => {
    expect(inJudgeScope(member, challenges, "sponsor")).toBe(true);
    expect(inJudgeScope(member, challenges, "missing")).toBe(false);
    expect(inJudgeScope(guest, challenges, "mongo")).toBe(true);
    expect(inJudgeScope(guest, challenges, "general")).toBe(false);
  });
});

describe("evaluatedChallenge", () => {
  it("evaluates a child challenge under its root", () => {
    expect(evaluatedChallenge(member, challenges, "mongo", null).id).toBe(
      "mlh",
    );
  });

  it("defaults a member to their room's challenge, then General", () => {
    expect(
      evaluatedChallenge(member, challenges, undefined, seat("sponsor")).id,
    ).toBe("sponsor");
    expect(evaluatedChallenge(member, challenges, undefined, null).id).toBe(
      "general",
    );
  });

  it("falls back to the first root when there is no General", () => {
    const noGeneral = challenges.filter((c) => c.id !== "general");
    expect(evaluatedChallenge(member, noGeneral, undefined, null).id).toBe(
      "sponsor",
    );
  });

  it("keeps a guest on their room's challenge", () => {
    expect(evaluatedChallenge(guest, challenges, undefined, null).id).toBe(
      "mlh",
    );
    expect(evaluatedChallenge(guest, challenges, "domain", null).id).toBe(
      "mlh",
    );
  });

  it("refuses a guest a challenge outside their room", () => {
    expect(() =>
      evaluatedChallenge(guest, challenges, "general", null),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("refuses a member an unknown challenge", () => {
    expect(() =>
      evaluatedChallenge(member, challenges, "missing", null),
    ).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("explains an edition with no challenges yet", () => {
    expect(() => evaluatedChallenge(member, [], undefined, null)).toThrowError(
      expect.objectContaining({ code: "PRECONDITION_FAILED" }),
    );
  });
});

describe("reconcileDueDrafts", () => {
  it("opens no transaction when nothing is due", async () => {
    let transactions = 0;
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where"]) {
      builder[method] = () => builder;
    }
    builder.limit = () => Promise.resolve([]);
    const db = {
      select: () => builder,
      transaction: () => {
        transactions += 1;
        return Promise.resolve();
      },
    } as unknown as DrizzleDB;

    await reconcileDueDrafts(db, "h");
    expect(transactions).toBe(0);
  });
});
