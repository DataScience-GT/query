import { describe, it, expect, vi } from "vitest";
import {
  createOrUpdateMembership,
  resolveCurrentHackathonId,
  splitName,
} from "./membership";
import type { DrizzleDB } from "../client";

const DAY = 24 * 60 * 60 * 1000;

/**
 * A hackathons table that actually evaluates the `where` callback, so a test
 * can tell a query that filters drafts from one that only says it does. The
 * column references drizzle passes in are stood in for by their own names, and
 * each operator returns a predicate over a plain row.
 */
function fakeHackathons(rows: Record<string, unknown>[]) {
  const columns = { status: "status", startDate: "startDate", endDate: "endDate" };

  type Pred = (row: Record<string, unknown>) => boolean;
  const ops = {
    and: (...preds: Pred[]): Pred => (row) => preds.every((p) => p(row)),
    ne: (col: string, val: unknown): Pred => (row) => row[col] !== val,
    notInArray: (col: string, vals: unknown[]): Pred => (row) =>
      !vals.includes(row[col]),
    lte: (col: string, val: Date): Pred => (row) => (row[col] as Date) <= val,
    gte: (col: string, val: Date): Pred => (row) => (row[col] as Date) >= val,
    desc: (col: string) => col,
  };

  return {
    query: {
      hackathons: {
        findFirst: vi.fn(
          async (args?: {
            where?: (c: typeof columns, o: typeof ops) => Pred;
            orderBy?: unknown;
          }) => {
            let matching = args?.where
              ? rows.filter(args.where(columns, ops))
              : [...rows];
            if (args?.orderBy) {
              matching = [...matching].sort(
                (a, b) =>
                  (b.startDate as Date).getTime() -
                  (a.startDate as Date).getTime(),
              );
            }
            return matching[0];
          },
        ),
      },
    },
  } as unknown as DrizzleDB;
}

/**
 * A fake just wide enough for createOrUpdateMembership: one members row, and
 * recorders for the insert/update it performs.
 */
function fakeDb(existingMember: Record<string, unknown> | undefined) {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];

  const db = {
    query: {
      hackathons: { findFirst: vi.fn(async () => ({ id: "hack_1" })) },
      members: { findFirst: vi.fn(async () => existingMember) },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push(values);
      },
    }),
  } as unknown as DrizzleDB;

  return { db, updates, inserts };
}

describe("resolveCurrentHackathonId", () => {
  const running = {
    id: "hack_running",
    status: "open",
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + DAY),
  };
  const lastYear = {
    id: "hack_last_year",
    status: "completed",
    startDate: new Date(Date.now() - 300 * DAY),
    endDate: new Date(Date.now() - 298 * DAY),
  };
  const nextYearDraft = {
    id: "hack_next_draft",
    status: "draft",
    startDate: new Date(Date.now() + 300 * DAY),
    endDate: new Date(Date.now() + 302 * DAY),
  };
  const nextYearAnnounced = {
    ...nextYearDraft,
    id: "hack_next_announced",
    status: "announced",
  };

  it("prefers the edition actually running", async () => {
    const db = fakeHackathons([lastYear, running, nextYearDraft]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBe("hack_running");
  });

  /**
   * The one that mattered. The fallback ordered by start date with no filter,
   * so the day staff drafted next year's edition it became "current" for the
   * whole platform: every paying member read as lapsed, club check-in refused
   * them, project leaders lost their portal tab, and Stripe grants landed
   * against an edition nobody had announced.
   */
  it("falls back to the newest edition that is not a draft", async () => {
    const db = fakeHackathons([lastYear, nextYearDraft]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBe("hack_last_year");
  });

  /**
   * Announcing next year is a marketing act, not an administrative one. The
   * landing page and the interest form go live months ahead; memberships,
   * check-in and the portal gates must stay pointed at the edition people
   * actually belong to until registration opens.
   */
  it("does not hand the current edition to one that is only announced", async () => {
    const db = fakeHackathons([lastYear, nextYearAnnounced]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBe("hack_last_year");
  });

  it("hands it over once the announced edition opens", async () => {
    const db = fakeHackathons([
      lastYear,
      { ...nextYearAnnounced, status: "open" },
    ]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBe(
      "hack_next_announced",
    );
  });

  it("resolves nothing when every edition is a draft", async () => {
    const db = fakeHackathons([nextYearDraft]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBeUndefined();
  });

  it("resolves nothing when there are no editions at all", async () => {
    const db = fakeHackathons([]);
    await expect(resolveCurrentHackathonId(db)).resolves.toBeUndefined();
  });
});

describe("splitName", () => {
  /**
   * A copy of this in the Stripe webhook lost a backslash and split on the
   * letter "s" instead of whitespace, so every name containing an s was
   * mangled before being written to the members table. "Chris Smith" is the
   * case that catches it — it passes under /\s+/ and fails under /s+/.
   */
  it.each([
    ["Chris Smith", "Chris", "Smith"],
    ["Jane Doe", "Jane", "Doe"],
    ["Mary Jane Watson", "Mary", "Jane Watson"],
    ["  Ada   Lovelace  ", "Ada", "Lovelace"],
  ])("splits %s on whitespace", (input, first, last) => {
    expect(splitName(input)).toEqual({ firstName: first, lastName: last });
  });

  it("falls back for a single name or nothing at all", () => {
    expect(splitName("Prince")).toEqual({
      firstName: "Prince",
      lastName: "Member",
    });
    expect(splitName(null)).toEqual({
      firstName: "Member",
      lastName: "Member",
    });
  });
});

describe("createOrUpdateMembership", () => {
  it("gives a brand new member a year from today", async () => {
    const { db, inserts } = fakeDb(undefined);

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(inserts).toHaveLength(1);
    const end = inserts[0]?.membershipEndDate as Date;
    expect(end.getTime()).toBeGreaterThan(Date.now() + 360 * DAY);
    expect(inserts[0]?.renewalCount).toBe(0);
  });

  /**
   * Renewal is a paid year, so paying while still covered has to push the end
   * date out from where the term already ended. Measuring from today instead
   * would mean renewing a month early silently costs you that month.
   */
  it("extends from the existing end date when renewing early", async () => {
    const existingEnd = new Date(Date.now() + 100 * DAY);
    const { db, updates } = fakeDb({
      id: "m1",
      renewalCount: 1,
      membershipEndDate: existingEnd,
      phoneNumber: null,
    });

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(updates).toHaveLength(1);
    const end = updates[0]?.membershipEndDate as Date;
    const expected = new Date(existingEnd);
    expected.setFullYear(expected.getFullYear() + 1);

    expect(end.getTime()).toBe(expected.getTime());
    // The 100 remaining days survived the renewal.
    expect(end.getTime()).toBeGreaterThan(Date.now() + 460 * DAY);
    expect(updates[0]?.renewalCount).toBe(2);
    expect(updates[0]?.memberType).toBe("continuous");
  });

  it("restarts from today when the membership already lapsed", async () => {
    const { db, updates } = fakeDb({
      id: "m1",
      renewalCount: 3,
      membershipEndDate: new Date(Date.now() - 30 * DAY),
      phoneNumber: null,
    });

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    const end = updates[0]?.membershipEndDate as Date;
    // A year from now, not a year from the date it lapsed — no credit for the
    // gap, and no term that is already partly spent.
    expect(end.getTime()).toBeGreaterThan(Date.now() + 360 * DAY);
    expect(end.getTime()).toBeLessThan(Date.now() + 370 * DAY);
  });
});
