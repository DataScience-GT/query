import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";
import type * as CountHelpers from "../services/derived-counts";

/**
 * Real-Postgres test for the derived counts that replaced the stored counters
 * events.current_check_ins, hackathon_team.current_members and
 * hackathon.current_participants.
 *
 * The mocked suites cannot see SQL: a correlated subquery in a relational
 * query's extras bound its outer id to the wrong table and returned 0 for every
 * row, and no mock noticed. This file runs the real procedures and helpers
 * against a real database.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It inserts its own rows under a random
 * suffix and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("derived counts against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const userIds = Array.from({ length: 6 }, (_, i) => `dc-${suffix}-u${i}`);

  let ctx: any;
  let appRouter: any;
  let S: typeof DbModule;
  let helpers: typeof CountHelpers;
  let drizzleOps: typeof DrizzleOps;
  let eventId: string;
  let cappedEventId: string;
  let cappedQr: string;
  let hackathonId: string;
  let teamId: string;
  let emptyTeamId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    drizzleOps = await import("drizzle-orm");
    helpers = await import("../services/derived-counts");
    ({ appRouter } = await import("../root"));
    const { cache } = await import("../middleware/cache");
    const db = S.db!;

    ctx = (userId?: string) => ({
      db,
      session: userId ? { user: { id: userId } } : null,
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    });

    await db.insert(S.users).values(
      userIds.map((id) => ({ id, email: `${id}@example.test`, name: id })),
    );

    // Event with 3 check-ins.
    const [event] = await db
      .insert(S.events)
      .values({
        title: `dc event ${suffix}`,
        eventDate: new Date(),
        qrCode: crypto.randomUUID(),
        createdById: userIds[0]!,
      })
      .returning({ id: S.events.id });
    eventId = event!.id;
    await db.insert(S.eventCheckIns).values(
      userIds.slice(0, 3).map((userId) => ({ eventId, userId })),
    );

    // Capped event: cap 2, two real rows.
    cappedQr = crypto.randomUUID();
    const [capped] = await db
      .insert(S.events)
      .values({
        title: `dc capped ${suffix}`,
        eventDate: new Date(),
        qrCode: cappedQr,
        createdById: userIds[0]!,
        maxCheckIns: 2,
      })
      .returning({ id: S.events.id });
    cappedEventId = capped!.id;
    await db.insert(S.eventCheckIns).values(
      userIds.slice(0, 2).map((userId) => ({ eventId: cappedEventId, userId })),
    );

    // Hackathon: 2 approved + 1 checked_in + 2 pending/rejected = 3 seats.
    const [hackathon] = await db
      .insert(S.hackathons)
      .values({
        name: `dc hackathon ${suffix}`,
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 2 * 86_400_000),
        status: "open",
        maxParticipants: 10,
      })
      .returning({ id: S.hackathons.id });
    hackathonId = hackathon!.id;

    const [team, emptyTeam] = await db
      .insert(S.hackathonTeams)
      .values([
        {
          hackathonId,
          name: `dc team ${suffix}`,
          captainId: userIds[0]!,
        },
        {
          hackathonId,
          name: `dc empty ${suffix}`,
          captainId: userIds[5]!,
        },
      ])
      .returning({ id: S.hackathonTeams.id });
    teamId = team!.id;
    emptyTeamId = emptyTeam!.id;

    const statuses = [
      "approved",
      "approved",
      "checked_in",
      "pending",
      "rejected",
    ] as const;
    await db.insert(S.hackathonParticipants).values(
      statuses.map((registrationStatus, i) => ({
        hackathonId,
        userId: userIds[i]!,
        registrationStatus,
        // Three of the five are on the team.
        teamId: i < 3 ? teamId : null,
      })),
    );
  }, 60_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    const { inArray } = drizzleOps;
    await db
      .delete(S.events)
      .where(inArray(S.events.id, [eventId, cappedEventId].filter(Boolean)));
    if (hackathonId) {
      await db
        .delete(S.hackathons)
        .where(drizzleOps.eq(S.hackathons.id, hackathonId));
    }
    await db.delete(S.users).where(inArray(S.users.id, userIds));
  }, 60_000);

  it("counts check-ins per event in one grouped read", async () => {
    const counts = await helpers.checkInCounts(S.db!, [
      eventId,
      cappedEventId,
      null,
    ]);
    expect(counts.get(eventId)).toBe(3);
    expect(counts.get(cappedEventId)).toBe(2);
  });

  it("counts team members and gives an empty team no entry", async () => {
    const counts = await helpers.teamMemberCounts(S.db!, [teamId, emptyTeamId]);
    expect(counts.get(teamId)).toBe(3);
    expect(counts.get(emptyTeamId)).toBeUndefined();
    const merged = await helpers.withTeamMemberCounts(S.db!, [
      { id: teamId },
      { id: emptyTeamId },
    ]);
    expect(merged.map((t) => t.currentMembers)).toEqual([3, 0]);
  });

  it("counts only approved and checked_in participants as seats", async () => {
    const counts = await helpers.seatedCounts(S.db!, [hackathonId]);
    expect(counts.get(hackathonId)).toBe(3);
  });

  it("does not query for an empty id list", async () => {
    const counts = await helpers.checkInCounts(
      { select: () => { throw new Error("queried"); } } as any,
      [],
    );
    expect(counts.size).toBe(0);
  });

  it("events.list returns the row count", async () => {
    const { cache } = await import("../middleware/cache");
    cache.clear();
    const list = await appRouter.createCaller(ctx()).events.list();
    const mine = list.find((e: any) => e.id === eventId);
    expect(mine?.currentCheckIns).toBe(3);
    expect(list.find((e: any) => e.id === cappedEventId)?.currentCheckIns).toBe(
      2,
    );
  });

  it("hackathon.getById returns the seats held by rows", async () => {
    const { cache } = await import("../middleware/cache");
    cache.clear();
    const row = await appRouter
      .createCaller(ctx())
      .hackathon.getById({ id: hackathonId });
    expect(row.currentParticipants).toBe(3);
  });

  it("hackathon.list returns the seats held by rows", async () => {
    const { cache } = await import("../middleware/cache");
    cache.clear();
    const rows = await appRouter.createCaller(ctx()).hackathon.list({});
    expect(
      rows.find((h: any) => h.id === hackathonId)?.currentParticipants,
    ).toBe(3);
  });

  it("team.list returns the roster size", async () => {
    const { cache } = await import("../middleware/cache");
    cache.clear();
    const teams = await appRouter
      .createCaller(ctx(userIds[0]))
      .team.list({ hackathonId });
    expect(teams.find((t: any) => t.id === teamId)?.currentMembers).toBe(3);
    expect(teams.find((t: any) => t.id === emptyTeamId)?.currentMembers).toBe(
      0,
    );
  });

  it("refuses a check-in when the rows fill the event", async () => {
    await expect(
      appRouter
        .createCaller(ctx(userIds[4]))
        .events.checkIn({ qrCode: cappedQr }),
    ).rejects.toMatchObject({ message: "Event is full" });
  });

  it("admits a check-in once a row leaves room", async () => {
    const db = S.db!;
    const { and, eq } = drizzleOps;
    // Free a seat by deleting a row.
    await db
      .delete(S.eventCheckIns)
      .where(
        and(
          eq(S.eventCheckIns.eventId, cappedEventId),
          eq(S.eventCheckIns.userId, userIds[1]!),
        ),
      );
    await expect(
      appRouter
        .createCaller(ctx(userIds[4]))
        .events.checkIn({ qrCode: cappedQr }),
    ).resolves.toMatchObject({ success: true });

    const counts = await helpers.checkInCounts(db, [cappedEventId]);
    expect(counts.get(cappedEventId)).toBe(2);
    // And the next one is refused again, by rows.
    await expect(
      appRouter
        .createCaller(ctx(userIds[5]))
        .events.checkIn({ qrCode: cappedQr }),
    ).rejects.toMatchObject({ message: "Event is full" });
  });

  it("a deleted user's rows leave every count with nothing to maintain", async () => {
    const db = S.db!;
    const { eq } = drizzleOps;
    // Cascades their check-in and participant rows, the drift that motivated
    // deriving these numbers.
    await db.delete(S.users).where(eq(S.users.id, userIds[2]!));
    expect(
      (await helpers.checkInCounts(db, [eventId])).get(eventId),
    ).toBe(2);
    expect(
      (await helpers.teamMemberCounts(db, [teamId])).get(teamId),
    ).toBe(2);
    expect(
      (await helpers.seatedCounts(db, [hackathonId])).get(hackathonId),
    ).toBe(2);
  });
});
