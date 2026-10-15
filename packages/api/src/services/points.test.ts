import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  CHECK_IN_CODE_ALPHABET,
  CHECK_IN_CODE_LENGTH,
  alreadyCheckedInMessage,
  assignCheckInCode,
  canSupply,
  fullName,
  generateCheckInCode,
  isSoldOut,
  leaderboardName,
  ledgerTotals,
  normalizeCheckInCode,
  personName,
  pointsBalance,
  pointsShort,
  rankLeaderboard,
  recordEventAttendance,
  selfCheckInWindow,
} from "./points";
import type { PointsDb } from "./points";
import type { DrizzleDB } from "@query/db";

// Drizzle wraps the pg error, so the SQLSTATE sits on `.cause`.
const uniqueViolation = () =>
  Object.assign(new Error("duplicate key value"), {
    cause: { code: "23505" },
  });

describe("pointsBalance", () => {
  it("earns from events and adjustments and spends from purchases", () => {
    expect(pointsBalance({ awarded: 100, adjusted: 20, spent: 30 })).toEqual({
      earned: 120,
      spent: 30,
      available: 90,
    });
  });

  it("never offers negative spending power after a deduction", () => {
    expect(pointsBalance({ awarded: 50, adjusted: -40, spent: 30 })).toEqual({
      earned: 10,
      spent: 30,
      available: 0,
    });
  });

  it("keeps a negative earned total as it is", () => {
    expect(pointsBalance({ awarded: 0, adjusted: -5, spent: 0 })).toEqual({
      earned: -5,
      spent: 0,
      available: 0,
    });
  });
});

describe("ledgerTotals", () => {
  it("counts a null award as zero and skips voided purchases", () => {
    const totals = ledgerTotals({
      attendance: [
        { pointsAwarded: 10 },
        { pointsAwarded: null },
        { pointsAwarded: 5 },
      ],
      adjustments: [{ delta: 25 }, { delta: -10 }],
      purchases: [
        { total: 12, voidedAt: null },
        { total: 100, voidedAt: new Date() },
      ],
    });
    expect(totals).toEqual({ awarded: 15, adjusted: 15, spent: 12 });
    expect(pointsBalance(totals)).toEqual({
      earned: 30,
      spent: 12,
      available: 18,
    });
  });

  it("is all zeros for an empty ledger", () => {
    expect(
      ledgerTotals({ attendance: [], adjustments: [], purchases: [] }),
    ).toEqual({ awarded: 0, adjusted: 0, spent: 0 });
  });
});

describe("store stock", () => {
  it("counts tracked stock against the quantity", () => {
    expect(canSupply({ stock: 3, soldOut: false }, 3)).toBe(true);
    expect(canSupply({ stock: 3, soldOut: false }, 4)).toBe(false);
    expect(isSoldOut({ stock: 0, soldOut: false })).toBe(true);
  });

  it("ignores the switch while stock is counted", () => {
    expect(canSupply({ stock: 2, soldOut: true }, 1)).toBe(true);
  });

  it("uses the switch when nobody counts", () => {
    expect(canSupply({ stock: null, soldOut: false }, 500)).toBe(true);
    expect(canSupply({ stock: null, soldOut: true }, 1)).toBe(false);
    expect(isSoldOut({ stock: null, soldOut: true })).toBe(true);
  });

  it("says how many more points an item needs", () => {
    expect(pointsShort(50, 20)).toBe(30);
    expect(pointsShort(50, 50)).toBe(0);
    expect(pointsShort(0, 0)).toBe(0);
  });
});

describe("names", () => {
  it("uses the registration's names when present", () => {
    expect(
      personName({
        firstName: " Ada ",
        lastName: "Lovelace",
        accountName: "x y",
      }),
    ).toEqual({ first: "Ada", last: "Lovelace" });
  });

  it("splits the account name when the registration has none", () => {
    expect(
      personName({
        firstName: null,
        lastName: null,
        accountName: "Grace  Brewster Hopper",
      }),
    ).toEqual({ first: "Grace", last: "Brewster Hopper" });
    expect(
      personName({ firstName: "", lastName: null, accountName: null }),
    ).toEqual({ first: "", last: "" });
  });

  it("shows first name and last initial on the leaderboard", () => {
    expect(leaderboardName({ first: "Ada", last: "lovelace" })).toBe("Ada L.");
    expect(leaderboardName({ first: "Ada", last: "" })).toBe("Ada");
    expect(leaderboardName({ first: "", last: "Lovelace" })).toBe("L.");
    expect(leaderboardName({ first: "", last: "" })).toBe("Hacker");
  });

  it("takes a whole character for the initial", () => {
    expect(leaderboardName({ first: "Zoë", last: "Ölund" })).toBe("Zoë Ö.");
  });

  it("falls back when a full name is blank", () => {
    expect(fullName({ first: "Ada", last: "Lovelace" }, "a@x.io")).toBe(
      "Ada Lovelace",
    );
    expect(fullName({ first: "", last: "" }, "a@x.io")).toBe("a@x.io");
  });
});

describe("rankLeaderboard", () => {
  const row = (id: string, lastName: string, earned: number) => ({
    id,
    lastName,
    earned,
  });

  it("orders by points, then last name, then id", () => {
    const ranked = rankLeaderboard([
      row("c", "Zed", 10),
      row("b", "Adams", 10),
      row("a", "Adams", 10),
      row("d", "Young", 40),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("gives ties the same rank and skips the next", () => {
    const ranked = rankLeaderboard([
      row("a", "A", 50),
      row("b", "B", 30),
      row("c", "C", 30),
      row("d", "D", 10),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("compares last names without regard to case", () => {
    const ranked = rankLeaderboard([row("a", "zed", 0), row("b", "Adams", 0)]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not reorder its input", () => {
    const input = [row("a", "A", 1), row("b", "B", 2)];
    rankLeaderboard(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("handles an empty board", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });
});

describe("check-in codes", () => {
  it("leaves out the characters people misread", () => {
    for (const ch of ["0", "O", "1", "I", "L"]) {
      expect(CHECK_IN_CODE_ALPHABET).not.toContain(ch);
    }
    expect(new Set(CHECK_IN_CODE_ALPHABET).size).toBe(
      CHECK_IN_CODE_ALPHABET.length,
    );
  });

  it("draws six characters from the alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCheckInCode();
      expect(code).toHaveLength(CHECK_IN_CODE_LENGTH);
      for (const ch of code) expect(CHECK_IN_CODE_ALPHABET).toContain(ch);
    }
  });

  it("maps each draw to one character", () => {
    const draws = [0, 1, 2, 3, 4, CHECK_IN_CODE_ALPHABET.length - 1];
    const code = generateCheckInCode(() => draws.shift()!);
    expect(code).toBe(
      `${CHECK_IN_CODE_ALPHABET.slice(0, 5)}${CHECK_IN_CODE_ALPHABET.at(-1)}`,
    );
  });

  it("asks for draws over the whole alphabet", () => {
    const bounds: number[] = [];
    generateCheckInCode((max) => {
      bounds.push(max);
      return 0;
    });
    expect(bounds).toEqual(
      Array(CHECK_IN_CODE_LENGTH).fill(CHECK_IN_CODE_ALPHABET.length),
    );
  });

  it("forgives case, spaces and dashes in what was typed", () => {
    expect(normalizeCheckInCode("k7m pq2")).toBe("K7MPQ2");
    expect(normalizeCheckInCode(" K7M-PQ2 ")).toBe("K7MPQ2");
  });

  it("refuses anything that cannot be a code", () => {
    expect(normalizeCheckInCode("")).toBeNull();
    expect(normalizeCheckInCode("K7MPQ")).toBeNull();
    expect(normalizeCheckInCode("K7MPQ22")).toBeNull();
    // O, 0, I, 1 and L are never issued, so a code holding one is a typo.
    expect(normalizeCheckInCode("K7MPQO")).toBeNull();
    expect(normalizeCheckInCode("K7MPQ0")).toBeNull();
    expect(normalizeCheckInCode("K7MPQ1")).toBeNull();
    expect(normalizeCheckInCode("K7MPQL")).toBeNull();
    expect(normalizeCheckInCode("K7MPQ!")).toBeNull();
  });
});

describe("assignCheckInCode", () => {
  // Each update resolves or throws according to the next scripted outcome.
  const fakeDb = (outcomes: ("ok" | "taken" | "boom")[]) => {
    const written: string[] = [];
    const db = {
      update: () => ({
        set: (values: { checkInCode: string }) => ({
          where: async () => {
            const outcome = outcomes.shift() ?? "ok";
            if (outcome === "taken") throw uniqueViolation();
            if (outcome === "boom") throw new Error("connection reset");
            written.push(values.checkInCode);
          },
        }),
      }),
    };
    return { db: db as unknown as DrizzleDB, written };
  };

  const codes =
    (...list: string[]) =>
    () =>
      list.shift()!;

  it("writes the first free code", async () => {
    const { db, written } = fakeDb(["ok"]);
    await expect(
      assignCheckInCode(db, { id: "e", checkInCode: null }, codes("AAAAAA")),
    ).resolves.toBe("AAAAAA");
    expect(written).toEqual(["AAAAAA"]);
  });

  it("draws again when another event already holds the code", async () => {
    const { db, written } = fakeDb(["taken", "taken", "ok"]);
    await expect(
      assignCheckInCode(
        db,
        { id: "e", checkInCode: null },
        codes("AAAAAA", "BBBBBB", "CCCCCC"),
      ),
    ).resolves.toBe("CCCCCC");
    expect(written).toEqual(["CCCCCC"]);
  });

  it("never rotates to the code already on the screen", async () => {
    const { db, written } = fakeDb(["ok"]);
    await expect(
      assignCheckInCode(
        db,
        { id: "e", checkInCode: "AAAAAA" },
        codes("AAAAAA", "BBBBBB"),
      ),
    ).resolves.toBe("BBBBBB");
    expect(written).toEqual(["BBBBBB"]);
  });

  it("gives up with a sentence after repeated collisions", async () => {
    const { db } = fakeDb(["taken", "taken", "taken", "taken", "taken"]);
    const error = await assignCheckInCode(
      db,
      { id: "e", checkInCode: null },
      codes("A", "B", "C", "D", "E"),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("CONFLICT");
  });

  it("does not retry an unrelated failure", async () => {
    const { db } = fakeDb(["boom"]);
    await expect(
      assignCheckInCode(db, { id: "e", checkInCode: null }, codes("AAAAAA")),
    ).rejects.toThrow("connection reset");
  });
});

describe("selfCheckInWindow", () => {
  const start = new Date("2026-10-10T18:00:00Z");
  const end = new Date("2026-10-10T19:00:00Z");
  const at = (iso: string) =>
    selfCheckInWindow({ startTime: start, endTime: end }, new Date(iso));

  it("opens fifteen minutes before the start", () => {
    expect(at("2026-10-10T17:44:59.999Z")).toBe("early");
    expect(at("2026-10-10T17:45:00Z")).toBe("open");
  });

  it("stays open through the end", () => {
    expect(at("2026-10-10T18:30:00Z")).toBe("open");
    expect(at("2026-10-10T19:00:00Z")).toBe("open");
    expect(at("2026-10-10T19:00:00.001Z")).toBe("ended");
  });
});

describe("recordEventAttendance", () => {
  const fakeDb = (fail?: () => Error) => {
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({
        values: async (values: unknown) => {
          if (fail) throw fail();
          inserted.push(values);
        },
      }),
    };
    return { db: db as unknown as PointsDb, inserted };
  };

  const input = {
    event: { id: "event-1", name: "Lunch", points: 15 },
    participant: { id: "part-1", name: "Ada Lovelace" },
    method: "manual" as const,
    actorId: "staff-1",
  };

  it("copies the event's points and records how and by whom", async () => {
    const { db, inserted } = fakeDb();
    await expect(recordEventAttendance(db, input)).resolves.toEqual({
      pointsAwarded: 15,
    });
    expect(inserted).toEqual([
      {
        eventId: "event-1",
        participantId: "part-1",
        pointsAwarded: 15,
        method: "manual",
        checkedInById: "staff-1",
      },
    ]);
  });

  it("reads a duplicate as already checked in", async () => {
    const { db } = fakeDb(uniqueViolation);
    const error = await recordEventAttendance(db, input).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("CONFLICT");
    expect((error as TRPCError).message).toBe(
      "Ada Lovelace is already checked into Lunch.",
    );
  });

  it("speaks to the hacker when they entered the code", async () => {
    const { db } = fakeDb(uniqueViolation);
    await expect(
      recordEventAttendance(db, { ...input, method: "code" }),
    ).rejects.toThrow("You are already checked into Lunch.");
  });

  it("passes other failures through", async () => {
    const { db } = fakeDb(() => new Error("connection reset"));
    await expect(recordEventAttendance(db, input)).rejects.toThrow(
      "connection reset",
    );
  });

  it("words the duplicate the same way for every staff path", () => {
    for (const method of ["scan", "manual"] as const) {
      expect(alreadyCheckedInMessage({ ...input, method })).toBe(
        "Ada Lovelace is already checked into Lunch.",
      );
    }
  });
});
