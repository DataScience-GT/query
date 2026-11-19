import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as DbModule from "@query/db";

/**
 * Real-Postgres test for the portal's hot reads. It counts database round
 * trips in a row (a query that starts after another finished is one more),
 * because that, not the number of queries, is what a request pays for when each
 * trip costs a network hop to the database.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It inserts its own rows under a random
 * suffix and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)(
  "portal hot reads: round trips on a real database",
  () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const ids = Array.from({ length: 5 }, (_, i) => `rt-${suffix}-u${i}`);
    const [captain, mate, solo, loner, admin] = ids as [
      string,
      string,
      string,
      string,
      string,
    ];

    let S: typeof DbModule;
    let appRouter: any;
    let cache: any;
    let hackathonId: string;
    let draftId: string;
    let teamId: string;
    let teamProjectId: string;
    let soloProjectId: string;
    let eventId: string;

    // Start and end of every query, in order of arrival.
    const trips: { start: number; end: number }[] = [];
    let tick = 0;
    const watch = () => {
      const pool = (S.db as any).$client as {
        query: (...args: unknown[]) => Promise<unknown>;
      };
      const original = pool.query.bind(pool);
      pool.query = (...args: unknown[]) => {
        const trip = { start: ++tick, end: Infinity };
        trips.push(trip);
        return Promise.resolve(original(...args)).finally(() => {
          trip.end = ++tick;
        });
      };
      return () => {
        pool.query = original;
      };
    };

    /** Longest chain of queries where each began after the one before ended. */
    const roundTrips = () => {
      const depth: number[] = [];
      const sorted = [...trips].sort((a, b) => a.start - b.start);
      sorted.forEach((trip, i) => {
        let best = 0;
        for (let j = 0; j < i; j += 1) {
          if (sorted[j]!.end < trip.start) best = Math.max(best, depth[j]!);
        }
        depth[i] = best + 1;
      });
      return Math.max(0, ...depth);
    };

    const ctx = (userId: string) => ({
      db: S.db,
      session: { user: { id: userId } },
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: undefined,
    });

    const measure = async (run: () => Promise<any>) => {
      cache.clear();
      trips.length = 0;
      const unwatch = watch();
      try {
        return { value: await run(), trips: roundTrips() };
      } finally {
        unwatch();
      }
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = URL;
      S = await import("@query/db");
      ({ appRouter } = await import("../root"));
      ({ cache } = await import("../middleware/cache"));
      const db = S.db!;

      await db
        .insert(S.users)
        .values(
          ids.map((id) => ({ id, email: `${id}@example.test`, name: id })),
        );
      await db
        .insert(S.admins)
        .values({ userId: admin, role: "admin", isActive: true });

      const [open, draft] = await db
        .insert(S.hackathons)
        .values([
          {
            name: `rt open ${suffix}`,
            startDate: new Date(Date.now() + 400 * 86_400_000),
            endDate: new Date(Date.now() + 401 * 86_400_000),
            status: "open",
          },
          {
            name: `rt draft ${suffix}`,
            startDate: new Date(Date.now() + 400 * 86_400_000),
            endDate: new Date(Date.now() + 401 * 86_400_000),
            status: "draft",
          },
        ])
        .returning({ id: S.hackathons.id });
      hackathonId = open!.id;
      draftId = draft!.id;

      const [team] = await db
        .insert(S.hackathonTeams)
        .values({ hackathonId, name: `rt team ${suffix}`, captainId: captain })
        .returning({ id: S.hackathonTeams.id });
      teamId = team!.id;

      const participants = await db
        .insert(S.hackathonParticipants)
        .values([
          {
            hackathonId,
            userId: captain,
            registrationStatus: "approved",
            teamId,
          },
          { hackathonId, userId: mate, registrationStatus: "approved", teamId },
          { hackathonId, userId: solo, registrationStatus: "approved" },
        ])
        .returning({
          id: S.hackathonParticipants.id,
          userId: S.hackathonParticipants.userId,
        });
      const soloParticipant = participants.find((p) => p.userId === solo)!;

      const [teamProject] = await db
        .insert(S.hackathonProjects)
        .values({
          hackathonId,
          teamId,
          name: `rt team project ${suffix}`,
          description: "d",
        })
        .returning({ id: S.hackathonProjects.id });
      teamProjectId = teamProject!.id;
      const [soloProject] = await db
        .insert(S.hackathonProjects)
        .values({
          hackathonId,
          submittedById: soloParticipant.id,
          name: `rt solo project ${suffix}`,
          description: "d",
        })
        .returning({ id: S.hackathonProjects.id });
      soloProjectId = soloProject!.id;

      // Newest of all events, so it is inside the fifty events.list returns.
      const [event] = await db
        .insert(S.events)
        .values({
          title: `rt event ${suffix}`,
          eventDate: new Date(Date.now() + 400 * 86_400_000),
          qrCode: crypto.randomUUID(),
          createdById: admin,
        })
        .returning({ id: S.events.id });
      eventId = event!.id;
      await db.insert(S.eventCheckIns).values([
        { eventId, userId: captain },
        { eventId, userId: mate },
      ]);
    }, 60_000);

    afterAll(async () => {
      const db = S?.db;
      if (!db) return;
      const { inArray } = await import("drizzle-orm");
      await db
        .delete(S.hackathons)
        .where(
          inArray(S.hackathons.id, [hackathonId, draftId].filter(Boolean)),
        );
      if (eventId) {
        await db.delete(S.events).where(inArray(S.events.id, [eventId]));
      }
      await db.delete(S.users).where(inArray(S.users.id, ids));
    }, 60_000);

    describe("hackathon.myRegistrations", () => {
      it("reads the list and the team counts in one round trip", async () => {
        const { value, trips: n } = await measure(() =>
          appRouter.createCaller(ctx(captain)).hackathon.myRegistrations(),
        );
        expect(n).toBe(1);
        expect(value).toHaveLength(1);
        expect(value[0].team).toMatchObject({ id: teamId, currentMembers: 2 });
      });

      it("keeps a null team for a solo registration and returns nothing for no registration", async () => {
        const soloRead = await measure(() =>
          appRouter.createCaller(ctx(solo)).hackathon.myRegistrations(),
        );
        expect(soloRead.value[0].team).toBeNull();
        const none = await measure(() =>
          appRouter.createCaller(ctx(loner)).hackathon.myRegistrations(),
        );
        expect(none.value).toEqual([]);
      });
    });

    describe("team.myProjects", () => {
      it("finds a team project in one round trip", async () => {
        const { value, trips: n } = await measure(() =>
          appRouter.createCaller(ctx(mate)).team.myProjects(),
        );
        expect(n).toBe(1);
        expect(value.map((p: { id: string }) => p.id)).toEqual([teamProjectId]);
      });

      it("finds a solo project by its submitter and never another person's", async () => {
        const { value } = await measure(() =>
          appRouter.createCaller(ctx(solo)).team.myProjects(),
        );
        expect(value.map((p: { id: string }) => p.id)).toEqual([soloProjectId]);
      });

      it("returns nothing, not every project, for a caller with no registration", async () => {
        const { value } = await measure(() =>
          appRouter.createCaller(ctx(loner)).team.myProjects(),
        );
        expect(value).toEqual([]);
      });
    });

    describe("hackathon.list", () => {
      it("hides a draft edition from a non-admin and shows it to an admin", async () => {
        const publicList = await measure(() =>
          appRouter.createCaller(ctx(loner)).hackathon.list({}),
        );
        const publicIds = publicList.value.map((h: { id: string }) => h.id);
        expect(publicIds).toContain(hackathonId);
        expect(publicIds).not.toContain(draftId);

        const adminList = await measure(() =>
          appRouter.createCaller(ctx(admin)).hackathon.list({}),
        );
        const adminIds = adminList.value.map((h: { id: string }) => h.id);
        expect(adminIds).toContain(hackathonId);
        expect(adminIds).toContain(draftId);
      });

      it("returns nothing for a non-admin who asks for a staff-only status", async () => {
        const { value } = await measure(() =>
          appRouter
            .createCaller(ctx(loner))
            .hackathon.list({ status: "draft" }),
        );
        expect(value).toEqual([]);
      });

      it("reads the role, the list and the seat counts in one round trip", async () => {
        const { value, trips: n } = await measure(() =>
          appRouter.createCaller(ctx(loner)).hackathon.list({}),
        );
        expect(n).toBe(1);
        const mine = value.find((h: { id: string }) => h.id === hackathonId);
        // captain, mate and solo are approved
        expect(mine.currentParticipants).toBe(3);
      });

      it("gives each page the right seat count when editions share a start date", async () => {
        const { inArray } = await import("drizzle-orm");
        const db = S.db!;
        const startDate = new Date(Date.now() + 500 * 86_400_000);
        const endDate = new Date(Date.now() + 501 * 86_400_000);
        const [a, b] = await db
          .insert(S.hackathons)
          .values(
            ["a", "b"].map((k) => ({
              name: `rt tie ${k} ${suffix}`,
              startDate,
              endDate,
              status: "open" as const,
            })),
          )
          .returning({ id: S.hackathons.id, name: S.hackathons.name });
        try {
          // a has one seat, b has two
          await db.insert(S.hackathonParticipants).values([
            {
              hackathonId: a!.id,
              userId: captain,
              registrationStatus: "approved",
            },
            {
              hackathonId: b!.id,
              userId: captain,
              registrationStatus: "approved",
            },
            {
              hackathonId: b!.id,
              userId: mate,
              registrationStatus: "approved",
            },
          ]);
          const expected = new Map([
            [a!.id, 1],
            [b!.id, 2],
          ]);
          for (const offset of [0, 1]) {
            const { value } = await measure(() =>
              appRouter
                .createCaller(ctx(loner))
                .hackathon.list({ limit: 1, offset }),
            );
            expect(value).toHaveLength(1);
            expect(value[0].currentParticipants).toBe(
              expected.get(value[0].id),
            );
          }
        } finally {
          await db
            .delete(S.hackathons)
            .where(inArray(S.hackathons.id, [a!.id, b!.id]));
        }
      });
    });

    describe("events.list", () => {
      it("reads the list and the check-in counts in one round trip", async () => {
        const { value, trips: n } = await measure(() =>
          appRouter.createCaller(ctx(loner)).events.list(),
        );
        expect(n).toBe(1);
        const mine = value.find((e: { id: string }) => e.id === eventId);
        expect(mine.currentCheckIns).toBe(2);
        expect(mine.qrCode).toBeUndefined();
      });
    });

    describe("primePool", () => {
      it("opens connections once, and only while the pool holds none", async () => {
        const pool = (S.db as any).$client;
        // This suite has queried, so the pool is warm: nothing to do.
        const before = pool.totalCount;
        S.primePool();
        expect(pool.totalCount).toBe(before);
      });
    });
  },
);
