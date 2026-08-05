import { describe, it, expect, vi } from "vitest";
import { createOrUpdateMembership, splitName } from "./membership";
import type { DrizzleDB } from "../client";

const DAY = 24 * 60 * 60 * 1000;

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
