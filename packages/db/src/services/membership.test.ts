import { describe, it, expect, vi } from "vitest";
import {
  createOrUpdateMembership,
  currentTerm,
  isBootcampAddOnOnly,
  resolveCurrentHackathonId,
  splitName,
} from "./membership";
import type { DrizzleDB } from "../client";
import { membershipHistory } from "../schemas/members";

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
  const historyInserts: Record<string, unknown>[] = [];

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
    // Which table an insert targets decides which recorder it lands in, so a
    // test can assert the membership_history row separately from the member
    // row. Identity against the imported table objects, because the service
    // passes them straight through.
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        (table === membershipHistory ? historyInserts : inserts).push(values);
        // `.returning()` on the member insert is what gives the history row its
        // memberId, so the fake has to be both awaitable and returning-able.
        const rows = [{ id: "member_new" }];
        return {
          returning: async () => rows,
          then: (
            resolve: (v: typeof rows) => unknown,
            reject: (e: unknown) => unknown,
          ) => Promise.resolve(rows).then(resolve, reject),
        };
      },
    }),
  } as unknown as DrizzleDB;

  return { db, updates, inserts, historyInserts };
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

describe("isBootcampAddOnOnly", () => {
  it("reads the marker the add-on payment carries", () => {
    expect(isBootcampAddOnOnly('{"type":"bootcamp_addon"}')).toBe(true);
  });

  // Rows predating the add-on carry no type at all.
  it("treats a membership, a malformed blob and nothing as not-an-add-on", () => {
    expect(isBootcampAddOnOnly('{"type":"membership"}')).toBe(false);
    expect(isBootcampAddOnOnly('{"bootcamp":"true"}')).toBe(false);
    expect(isBootcampAddOnOnly("not json")).toBe(false);
    expect(isBootcampAddOnOnly(null)).toBe(false);
  });
});

describe("currentTerm", () => {
  it("splits the year at the end of May", () => {
    expect(currentTerm(new Date("2026-01-15T12:00:00"))).toBe("2026-spring");
    expect(currentTerm(new Date("2026-05-31T12:00:00"))).toBe("2026-spring");
    expect(currentTerm(new Date("2026-08-20T12:00:00"))).toBe("2026-fall");
    expect(currentTerm(new Date("2026-12-31T12:00:00"))).toBe("2026-fall");
  });

  // What is on sale in July is the autumn intake.
  it("sells the autumn bootcamp over the summer", () => {
    expect(currentTerm(new Date("2026-06-10T12:00:00"))).toBe("2026-fall");
    expect(currentTerm(new Date("2026-07-04T12:00:00"))).toBe("2026-fall");
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
    // No edition column any more: a membership is annual and belongs to the
    // person, so nothing here may name a hackathon.
    expect(inserts[0]).not.toHaveProperty("hackathonId");
  });

  /**
   * membership_history is the only record of which years somebody was a member
   * now that the hackathon column is gone — the table existed for a long time
   * with nothing ever writing to it.
   */
  it("records a joined history row for a new member", async () => {
    const { db, historyInserts } = fakeDb(undefined);

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(historyInserts).toHaveLength(1);
    expect(historyInserts[0]?.action).toBe("joined");
    expect(historyInserts[0]?.memberId).toBe("member_new");
    expect(historyInserts[0]?.endDate).toBeInstanceOf(Date);
  });

  it("records a renewed history row spanning the new term", async () => {
    const existingEnd = new Date(Date.now() + 100 * DAY);
    const { db, historyInserts } = fakeDb({
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

    expect(historyInserts).toHaveLength(1);
    expect(historyInserts[0]?.action).toBe("renewed");
    expect(historyInserts[0]?.memberId).toBe("m1");
    // The renewal overwrites membershipEndDate in place, so the history row is
    // what preserves where the new term started.
    expect((historyInserts[0]?.startDate as Date).getTime()).toBe(
      existingEnd.getTime(),
    );
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

  it("stamps the term a bootcamp purchase buys into", async () => {
    const { db, inserts } = fakeDb(undefined);

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
      bootcampMember: true,
    });

    expect(inserts[0]?.bootcampMember).toBe(true);
    expect(inserts[0]?.bootcampTerm).toBe(currentTerm());
  });

  it("leaves the term null for a membership bought without the bootcamp", async () => {
    const { db, inserts } = fakeDb(undefined);

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(inserts[0]?.bootcampTerm).toBeNull();
  });

  // Renewing the year must not silently re-buy the semester.
  it("does not move the bootcamp term on a plain renewal", async () => {
    const { db, updates } = fakeDb({
      id: "m1",
      renewalCount: 1,
      membershipEndDate: new Date(Date.now() + 10 * DAY),
      phoneNumber: null,
      bootcampMember: true,
      bootcampTerm: "1999-fall",
    });

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(updates[0]?.bootcampMember).toBe(true);
    expect(updates[0]?.bootcampTerm).toBe("1999-fall");
  });

  it("moves the term forward when the bootcamp is bought again", async () => {
    const { db, updates } = fakeDb({
      id: "m1",
      renewalCount: 1,
      membershipEndDate: new Date(Date.now() + 10 * DAY),
      phoneNumber: null,
      bootcampMember: true,
      bootcampTerm: "1999-fall",
    });

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
      bootcampMember: true,
    });

    expect(updates[0]?.bootcampTerm).toBe(currentTerm());
  });

  // Guards a paid add-on being read as a bought year by any grant path.
  it("stamps the term without extending the year for an add-on purchase", async () => {
    const existingEnd = new Date(Date.now() + 100 * DAY);
    const { db, updates, historyInserts } = fakeDb({
      id: "m1",
      renewalCount: 2,
      membershipEndDate: existingEnd,
      phoneNumber: null,
      bootcampMember: false,
      bootcampTerm: null,
    });

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
      bootcampMember: true,
      addOnOnly: true,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.bootcampTerm).toBe(currentTerm());
    expect(updates[0]?.bootcampMember).toBe(true);
    // The three things a renewal would have moved, and must not have.
    expect(updates[0]?.membershipEndDate).toBeUndefined();
    expect(updates[0]?.renewalCount).toBeUndefined();
    expect(historyInserts).toHaveLength(0);
  });

  // Nothing to stamp, and minting a year for $10 would be the worse failure.
  it("grants nothing when an add-on payment finds no membership", async () => {
    const { db, updates, inserts } = fakeDb(undefined);

    await createOrUpdateMembership(db, {
      userId: "u1",
      firstName: "Ada",
      lastName: "Lovelace",
      bootcampMember: true,
      addOnOnly: true,
    });

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
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
