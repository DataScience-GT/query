import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  CHECK_IN_CODE_ALPHABET,
  CHECK_IN_CODE_LENGTH,
  CHECK_IN_GAP_MS,
  alreadyCheckedInMessage,
  assignCheckInCode,
  attendanceConflict,
  attendanceConflictMessage,
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
import type { EarlierAttendance, PointsDb } from "./points";
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

const MIN = 60 * 1000;

describe("attendanceConflict", () => {
  const T0 = new Date("2026-10-10T18:00:00Z").getTime();
  const at = (minutes: number) => new Date(T0 + minutes * MIN);

  const ev = (
    id: string,
    startMin: number,
    endMin: number,
    type = "workshop",
  ) => ({
    id,
    type,
    startTime: at(startMin),
    endTime: at(endMin),
  });

  // An earlier check-in. Defaults to long ago, so only the overlap rule can
  // fire unless a test says otherwise.
  const attended = (
    id: string,
    startMin: number,
    endMin: number,
    opts: { type?: string; checkedInMin?: number; name?: string } = {},
  ): EarlierAttendance => ({
    event: {
      ...ev(id, startMin, endMin, opts.type),
      name: opts.name ?? `Event ${id}`,
    },
    checkedInAt: at(opts.checkedInMin ?? -600),
  });

  it("allows a first check-in", () => {
    expect(attendanceConflict(ev("a", 0, 60), [], at(0))).toBeNull();
  });

  it("refuses an event that runs at the same time as one already attended", () => {
    const bny = attended("bny", 0, 60, { name: "BNY Workshop" });
    expect(attendanceConflict(ev("fs", 30, 90), [bny], at(30))).toEqual({
      kind: "overlap",
      other: { name: "BNY Workshop" },
    });
    // Contained and containing count too.
    expect(attendanceConflict(ev("fs", 10, 20), [bny], at(30))?.kind).toBe(
      "overlap",
    );
    expect(attendanceConflict(ev("fs", -30, 120), [bny], at(30))?.kind).toBe(
      "overlap",
    );
  });

  it("lets back-to-back events through", () => {
    const first = attended("a", 0, 60);
    expect(attendanceConflict(ev("b", 60, 120), [first], at(60))).toBeNull();
    const second = attended("c", 60, 120);
    expect(attendanceConflict(ev("d", 0, 60), [second], at(30))).toBeNull();
  });

  it("refuses a second check-in 29 minutes after the first and allows it at 30", () => {
    const first = attended("a", 0, 60, { checkedInMin: 0, name: "Workshop" });
    // Back-to-back events, so only the gap is in play.
    const next = ev("b", 60, 120);
    expect(attendanceConflict(next, [first], at(29))).toEqual({
      kind: "too_soon",
      other: { name: "Workshop" },
      minutesAgo: 29,
    });
    expect(attendanceConflict(next, [first], at(30))).toBeNull();
    expect(CHECK_IN_GAP_MS).toBe(30 * MIN);
  });

  it("reports whole minutes, zero for a check-in just now", () => {
    const first = attended("a", 0, 60, { checkedInMin: 0 });
    const next = ev("b", 60, 120);
    expect(
      attendanceConflict(next, [first], new Date(T0 + 59 * 1000))?.minutesAgo,
    ).toBe(0);
    expect(
      attendanceConflict(next, [first], new Date(T0 + 61 * 1000))?.minutesAgo,
    ).toBe(1);
  });

  it("does not report a negative wait when the clock is behind the database", () => {
    const first = attended("a", 0, 60, { checkedInMin: 1 });
    expect(
      attendanceConflict(ev("b", 60, 120), [first], at(0))?.minutesAgo,
    ).toBe(0);
  });

  it("names the most recent check-in when several are too recent", () => {
    const older = attended("a", 0, 10, { checkedInMin: 0, name: "Older" });
    const newer = attended("b", 20, 30, { checkedInMin: 10, name: "Newer" });
    const expected = {
      kind: "too_soon",
      other: { name: "Newer" },
      minutesAgo: 10,
    };
    expect(attendanceConflict(ev("c", 60, 90), [newer, older], at(20))).toEqual(
      expected,
    );
    expect(attendanceConflict(ev("c", 60, 90), [older, newer], at(20))).toEqual(
      expected,
    );
  });

  it("does not block a meal, and a meal does not block anything", () => {
    const workshop = attended("w", 0, 60, { checkedInMin: 0 });
    expect(
      attendanceConflict(ev("lunch", 10, 50, "meal"), [workshop], at(10)),
    ).toBeNull();

    const lunch = attended("lunch", 0, 60, { type: "meal", checkedInMin: 0 });
    expect(attendanceConflict(ev("w", 10, 50), [lunch], at(10))).toBeNull();
  });

  it("ignores the same event, which the unique index handles", () => {
    const same = attended("a", 0, 60, { checkedInMin: 0 });
    expect(attendanceConflict(ev("a", 0, 60), [same], at(5))).toBeNull();
    // A check-in elsewhere since then does not turn a repeat into "too soon":
    // the true answer is still "already checked in".
    const since = attended("b", 60, 120, { checkedInMin: 50 });
    expect(
      attendanceConflict(ev("a", 0, 60), [same, since], at(55)),
    ).toBeNull();
  });

  it("reports an overlap before a recent check-in", () => {
    const overlapping = attended("a", 0, 60, {
      checkedInMin: 10,
      name: "Overlaps",
    });
    const recent = attended("b", -120, -90, {
      checkedInMin: 14,
      name: "Recent",
    });
    expect(
      attendanceConflict(ev("c", 30, 90), [recent, overlapping], at(15)),
    ).toEqual({ kind: "overlap", other: { name: "Overlaps" } });
  });
});

describe("attendanceConflictMessage", () => {
  const input = {
    event: { name: "Full Sail Fireside" },
    participant: { name: "Ada Lovelace" },
  };
  const overlap = { kind: "overlap", other: { name: "BNY Workshop" } } as const;
  const soon = (minutesAgo: number) =>
    ({
      kind: "too_soon",
      other: { name: "BNY Workshop" },
      minutesAgo,
    }) as const;

  it("speaks to the hacker who entered the code about an overlap", () => {
    expect(
      attendanceConflictMessage({ ...input, method: "code" }, overlap),
    ).toBe(
      "You're already checked into BNY Workshop, which runs at the same time as Full Sail Fireside. You can check into one event at a time.",
    );
  });

  it("tells staff to remove the participant from the other event", () => {
    for (const method of ["scan", "manual"] as const) {
      expect(attendanceConflictMessage({ ...input, method }, overlap)).toBe(
        "Ada Lovelace is already checked into BNY Workshop, which runs at the same time as Full Sail Fireside. If that was a mistake, remove them from BNY Workshop first.",
      );
    }
  });

  it("tells the hacker how long to wait", () => {
    expect(
      attendanceConflictMessage({ ...input, method: "code" }, soon(12)),
    ).toBe(
      "You checked into BNY Workshop 12 minutes ago. Event check-ins have to be at least 30 minutes apart, so try again in 18 minutes.",
    );
  });

  it("tells staff the same without a countdown", () => {
    for (const method of ["scan", "manual"] as const) {
      expect(attendanceConflictMessage({ ...input, method }, soon(12))).toBe(
        "Ada Lovelace checked into BNY Workshop 12 minutes ago. Event check-ins have to be at least 30 minutes apart. If that was a mistake, remove them from BNY Workshop first.",
      );
    }
  });

  it("uses singular wording at one minute", () => {
    expect(
      attendanceConflictMessage({ ...input, method: "code" }, soon(1)),
    ).toBe(
      "You checked into BNY Workshop 1 minute ago. Event check-ins have to be at least 30 minutes apart, so try again in 29 minutes.",
    );
    expect(
      attendanceConflictMessage({ ...input, method: "code" }, soon(29)),
    ).toContain("so try again in 1 minute.");
  });

  it("says less than a minute for zero", () => {
    expect(
      attendanceConflictMessage({ ...input, method: "code" }, soon(0)),
    ).toBe(
      "You checked into BNY Workshop less than a minute ago. Event check-ins have to be at least 30 minutes apart, so try again in 30 minutes.",
    );
    expect(
      attendanceConflictMessage({ ...input, method: "manual" }, soon(0)),
    ).toContain("checked into BNY Workshop less than a minute ago.");
  });
});

describe("recordEventAttendance", () => {
  // Stands in for the pool: a transaction hands back a builder that answers the
  // participant lock, the attendance read and the insert, noting the order.
  const fakeDb = (
    opts: { fail?: () => Error; earlier?: EarlierAttendance[] } = {},
  ) => {
    const inserted: unknown[] = [];
    const calls: string[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async (mode: string) => {
              calls.push(`lock:${mode}`);
              return [{ id: "part-1" }];
            },
          }),
          innerJoin: () => ({
            where: async () => {
              calls.push("read");
              return opts.earlier ?? [];
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (values: unknown) => {
          calls.push("insert");
          if (opts.fail) throw opts.fail();
          inserted.push(values);
        },
      }),
    };
    const db = {
      transaction: async (run: (tx: unknown) => unknown) => run(tx),
    };
    return { db: db as unknown as PointsDb, inserted, calls };
  };

  // A meal, so the rules stay out of the way unless a test switches to the
  // workshop below.
  const input = {
    event: {
      id: "event-1",
      name: "Lunch",
      points: 15,
      type: "meal",
      startTime: new Date(Date.now() - 30 * MIN),
      endTime: new Date(Date.now() + 30 * MIN),
    },
    participant: { id: "part-1", name: "Ada Lovelace" },
    method: "manual" as const,
    actorId: "staff-1",
  };

  const workshop = {
    ...input.event,
    id: "event-2",
    name: "Workshop",
    type: "workshop",
  };

  const earlierRow = (
    event: Partial<EarlierAttendance["event"]> = {},
    checkedInAt = new Date(Date.now() - 300 * MIN),
  ): EarlierAttendance => ({
    event: {
      id: "event-9",
      name: "BNY Workshop",
      type: "workshop",
      startTime: new Date(Date.now() - 30 * MIN),
      endTime: new Date(Date.now() + 30 * MIN),
      ...event,
    },
    checkedInAt,
  });

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
        checkedInAt: expect.any(Date),
      },
    ]);
  });

  it("locks the participant before it reads their attendance", async () => {
    const { db, calls } = fakeDb();
    await recordEventAttendance(db, input);
    expect(calls).toEqual(["lock:no key update", "read", "insert"]);
  });

  it("refuses a check-in into an event that overlaps one already attended", async () => {
    const { db, inserted } = fakeDb({ earlier: [earlierRow()] });
    const error = await recordEventAttendance(db, {
      ...input,
      event: workshop,
      method: "code",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("FORBIDDEN");
    expect((error as TRPCError).message).toBe(
      "You're already checked into BNY Workshop, which runs at the same time as Workshop. You can check into one event at a time.",
    );
    expect(inserted).toEqual([]);
  });

  it("refuses a check-in under 30 minutes after the last one", async () => {
    const { db, inserted } = fakeDb({
      earlier: [
        earlierRow(
          {
            startTime: new Date(Date.now() - 300 * MIN),
            endTime: new Date(Date.now() - 240 * MIN),
          },
          new Date(Date.now() - 10 * MIN),
        ),
      ],
    });
    const error = await recordEventAttendance(db, {
      ...input,
      event: workshop,
    }).catch((e: unknown) => e);
    expect((error as TRPCError).code).toBe("FORBIDDEN");
    expect((error as TRPCError).message).toMatch(
      /^Ada Lovelace checked into BNY Workshop 10 minutes ago\./,
    );
    expect(inserted).toEqual([]);
  });

  it("lets a meal through alongside an overlapping event", async () => {
    const { db, inserted } = fakeDb({ earlier: [earlierRow()] });
    await recordEventAttendance(db, input);
    expect(inserted).toHaveLength(1);
  });

  it("reads a duplicate as already checked in", async () => {
    const { db } = fakeDb({ fail: uniqueViolation });
    const error = await recordEventAttendance(db, input).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("CONFLICT");
    expect((error as TRPCError).message).toBe(
      "Ada Lovelace is already checked into Lunch.",
    );
  });

  it("reads a repeat as already checked in after a later check-in elsewhere", async () => {
    const { db } = fakeDb({
      fail: uniqueViolation,
      earlier: [
        earlierRow(
          { id: workshop.id, name: workshop.name },
          new Date(Date.now() - 40 * MIN),
        ),
        // Starts as the workshop ends, checked into five minutes ago.
        earlierRow(
          {
            startTime: workshop.endTime,
            endTime: new Date(Date.now() + 90 * MIN),
          },
          new Date(Date.now() - 5 * MIN),
        ),
      ],
    });
    const error = await recordEventAttendance(db, {
      ...input,
      event: workshop,
      method: "code",
    }).catch((e: unknown) => e);
    expect((error as TRPCError).code).toBe("CONFLICT");
    expect((error as TRPCError).message).toBe(
      "You are already checked into Workshop.",
    );
  });

  it("speaks to the hacker when they entered the code", async () => {
    const { db } = fakeDb({ fail: uniqueViolation });
    await expect(
      recordEventAttendance(db, { ...input, method: "code" }),
    ).rejects.toThrow("You are already checked into Lunch.");
  });

  it("passes other failures through", async () => {
    const { db } = fakeDb({ fail: () => new Error("connection reset") });
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
