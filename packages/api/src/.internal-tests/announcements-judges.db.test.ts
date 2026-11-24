import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";

/**
 * Real-Postgres test for the two judge audiences of the Email tab. The mocked
 * announcement suite cannot see SQL, and these audiences are all filtering:
 * which judge rows count, and which of them have not answered "can you attend
 * in person?".
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. Inserts its own rows under a random suffix
 * and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("judge announcement audiences (real database)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const id = (name: string) => `ja-${suffix}-${name}`;
  const userIds = [
    "admin",
    "null_waiting",
    "null_approved",
    "answered_yes",
    "answered_no",
    "rejected_null",
    "other_hack",
    "hacker",
  ].map(id);

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let admin: any;
  let hacker: any;
  let hackathonId: string;
  let otherHackathonId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    const { appRouter } = await import("../root");
    const { cache } = await import("../middleware/cache");
    const db = S.db!;

    const caller = (userId: string) =>
      appRouter.createCaller({
        db,
        session: { user: { id: userId } },
        userId,
        cache,
        clientIp: "127.0.0.1",
        req: { headers: { get: () => null } },
      } as never);
    admin = caller(id("admin"));
    hacker = caller(id("hacker"));

    await db.insert(S.users).values(
      userIds.map((u) => ({ id: u, email: `${u}@example.test`, name: u })),
    );
    await db.insert(S.admins).values({ userId: id("admin"), role: "admin" });

    const hack = (name: string) => ({
      name: `${name} ${suffix}`,
      startDate: new Date(Date.now() + 86_400_000),
      endDate: new Date(Date.now() + 2 * 86_400_000),
      status: "open" as const,
      maxParticipants: 10,
    });
    const [h1, h2] = await db
      .insert(S.hackathons)
      .values([hack("ja one"), hack("ja two")])
      .returning({ id: S.hackathons.id });
    hackathonId = h1!.id;
    otherHackathonId = h2!.id;

    const rows = await db
      .insert(S.judges)
      .values([
        { userId: id("null_waiting"), hackathonId, isActive: false, canAttendInPerson: null },
        { userId: id("null_approved"), hackathonId, isActive: true, canAttendInPerson: null },
        { userId: id("answered_yes"), hackathonId, isActive: true, canAttendInPerson: true },
        { userId: id("answered_no"), hackathonId, isActive: false, canAttendInPerson: false },
        { userId: id("rejected_null"), hackathonId, isActive: false, canAttendInPerson: null },
        { userId: id("other_hack"), hackathonId: otherHackathonId, isActive: true, canAttendInPerson: null },
      ])
      .returning({ id: S.judges.id, userId: S.judges.userId });

    const rejected = rows.find((r) => r.userId === id("rejected_null"))!;
    await db.insert(S.judgeAssignments).values({
      judgeId: rejected.id,
      hackathonId,
      status: "rejected",
    });
  }, 60_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    await db
      .delete(S.hackathons)
      .where(ops.inArray(S.hackathons.id, [hackathonId, otherHackathonId].filter(Boolean)));
    await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
  }, 60_000);

  const compose = (audience: "judges" | "judges_in_person_unanswered") => ({
    hackathonId,
    audience,
    subject: "Quick question",
    heading: "Can you attend in person?",
    body: "Please answer in the portal.",
    ctaLabel: "Answer in the portal",
    ctaUrl: "https://datasciencegt.org/judge",
  });

  const recipientEmails = async (announcementId: string) =>
    (
      await S.db!
        .select({ email: S.hackathonAnnouncementRecipients.email })
        .from(S.hackathonAnnouncementRecipients)
        .where(ops.eq(S.hackathonAnnouncementRecipients.announcementId, announcementId))
    )
      .map((r) => r.email)
      .sort();

  it("counts waiting and approved judges of this hackathon only", async () => {
    const counts = await admin.hackathon.audienceCounts({ hackathonId });
    // null_waiting, null_approved, answered_yes, answered_no. Not the rejected
    // judge, not the other hackathon's judge.
    expect(counts.judges).toBe(4);
    expect(counts.judges_in_person_unanswered).toBe(2);
    expect(counts.registered).toBe(0);
  });

  it("freezes only judges who have not answered into the unanswered audience", async () => {
    const res = await admin.hackathon.createAnnouncement(
      compose("judges_in_person_unanswered"),
    );
    expect(res.totalRecipients).toBe(2);
    expect(await recipientEmails(res.announcementId)).toEqual(
      [id("null_approved"), id("null_waiting")].map((u) => `${u}@example.test`).sort(),
    );
  });

  it("freezes every judge still in play into the judges audience", async () => {
    const res = await admin.hackathon.createAnnouncement(compose("judges"));
    expect(res.totalRecipients).toBe(4);
    const emails = await recipientEmails(res.announcementId);
    expect(emails).not.toContain(`${id("rejected_null")}@example.test`);
    expect(emails).not.toContain(`${id("other_hack")}@example.test`);
  });

  it("keeps judge announcements off hackers' event pages", async () => {
    // A judge who is also viewing the event page as a hacker would be a
    // recipient; they must still not see the judge message there.
    const shown = await admin.hackathon.createAnnouncement({
      ...compose("judges"),
      audience: "judges" as const,
    });
    expect(shown.totalRecipients).toBeGreaterThan(0);

    const db = S.db!;
    const judgeUser = id("null_waiting");
    const { cache } = await import("../middleware/cache");
    const { appRouter } = await import("../root");
    const asJudge = appRouter.createCaller({
      db,
      session: { user: { id: judgeUser } },
      userId: judgeUser,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    } as never);

    expect(await asJudge.hackathon.listForMe({ hackathonId })).toEqual([]);
    expect(await hacker.hackathon.listForMe({ hackathonId })).toEqual([]);
  });

  it("still shows a non-judge announcement to its recipient", async () => {
    const db = S.db!;
    await db.insert(S.hackathonParticipants).values({
      userId: id("hacker"),
      hackathonId,
      registrationStatus: "approved",
    } as never);
    const res = await admin.hackathon.createAnnouncement({
      ...compose("judges"),
      audience: "approved" as never,
      subject: "See you Saturday",
    });
    expect(res.totalRecipients).toBe(1);
    const mine = await hacker.hackathon.listForMe({ hackathonId });
    expect(mine.map((m: { subject: string }) => m.subject)).toEqual(["See you Saturday"]);
  });
});
