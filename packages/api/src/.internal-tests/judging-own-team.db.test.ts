import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";
import type * as Store from "../services/judging/evaluation-store";
import type { Judge } from "../services/judging/principal";

/**
 * Real-Postgres test for the rule that a judge never grades a project they are
 * on the team of. The mocked desk tests answer each select by the tables it
 * reads, so they cannot see which rows the comparison matches: this file runs
 * the real query against real entry members.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It inserts its own rows under a random
 * suffix and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("a judge on a project's team, against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const id = (name: string) => `own-${suffix}-${name}`;
  const userIds = ["by-user", "by-email", "by-roster", "by-case", "outsider"].map(id);
  const emailOf = (name: string) => `${id(name)}@example.test`;

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let store: typeof Store;
  let hackathonId: string;
  let entryId: string;
  const challenge = {
    id: "",
    parentId: null,
    mode: "unscheduled" as const,
    label: "General",
    isGeneral: true,
    isGroup: false,
  };

  const asMember = (name: string): Judge => ({
    kind: "member",
    hackathonId,
    userId: id(name),
    judgeId: crypto.randomUUID(),
    displayName: name,
  });
  const load = (judge: Judge) =>
    store.loadEntryInChallenge(S.db!, { hackathonId, entryId, challenge, judge });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    store = await import("../services/judging/evaluation-store");
    const db = S.db!;

    await db
      .insert(S.users)
      .values(userIds.map((userId) => ({ id: userId, email: `${userId}@example.test`, name: userId })));
    const [hackathon] = await db
      .insert(S.hackathons)
      .values({
        name: `own team ${suffix}`,
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 2 * 86_400_000),
        status: "open" as const,
        maxParticipants: 10,
      })
      .returning({ id: S.hackathons.id });
    hackathonId = hackathon!.id;

    const [general] = await db
      .insert(S.judgingChallenges)
      .values({ hackathonId, label: "General", isGeneral: true, mode: "unscheduled" })
      .returning({ id: S.judgingChallenges.id });
    challenge.id = general!.id;

    const [entry] = await db
      .insert(S.judgingEntries)
      .values({
        hackathonId,
        source: "devpost",
        title: "Tidewater",
        demoLinks: [],
        technologies: [],
        universities: [],
        prizeCategories: [],
      })
      .returning({ id: S.judgingEntries.id });
    entryId = entry!.id;
    await db.insert(S.judgingEntryChallenges).values({
      entryId,
      challengeId: challenge.id,
      hackathonId,
    });

    await db.insert(S.judgingEntryMembers).values([
      // Linked to an account.
      { entryId, hackathonId, name: "Linked", email: "linked@example.test", userId: id("by-user") },
      // Devpost listed them by email, and nobody has claimed the row.
      { entryId, hackathonId, name: "By email", email: emailOf("by-email") },
      // Listed under the address on their judge application, not their sign-in one.
      { entryId, hackathonId, name: "By roster", email: "Roster.Address@Example.test" },
      // Same address as the account, typed with capitals.
      { entryId, hackathonId, name: "By case", email: emailOf("by-case").toUpperCase() },
    ]);
    await db.insert(S.judges).values({
      userId: id("by-roster"),
      hackathonId,
      email: "roster.address@example.test",
      isActive: true,
    });
  }, 60_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    if (hackathonId) {
      await db.delete(S.hackathons).where(ops.eq(S.hackathons.id, hackathonId));
    }
    await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
  }, 60_000);

  const mine = /on this project's team/;

  it("refuses a judge whose account is linked to the entry", async () => {
    await expect(load(asMember("by-user"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(mine),
    });
  });

  it("refuses a judge listed by email on an unclaimed entry", async () => {
    await expect(load(asMember("by-email"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(mine),
    });
  });

  it("refuses a judge listed under the email on their judge application", async () => {
    await expect(load(asMember("by-roster"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(mine),
    });
  });

  it("compares emails without regard to case", async () => {
    await expect(load(asMember("by-case"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("still lets a judge grade a project they are not on", async () => {
    await expect(load(asMember("outsider"))).resolves.toMatchObject({
      id: entryId,
      title: "Tidewater",
    });
  });
});
