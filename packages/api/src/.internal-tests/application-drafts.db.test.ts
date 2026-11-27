import type * as DrizzleOps from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type * as DbModule from "@query/db";

import type * as Drafts from "../services/application-drafts";
import type * as Reminders from "../services/application-reminders";
import { applicationAnswers } from "./_application-answers";

/**
 * Real-Postgres test for saved application drafts and the three-day reminder.
 * The mailer is mocked, so nothing here can reach a real provider.
 * Needs TEST_DATABASE_URL (disposable; never Neon or production).
 */
const URL = process.env.TEST_DATABASE_URL;

const mailed = vi.hoisted(() => ({
  calls: [] as {
    email: string;
    hackathonName: string;
    hackathonUrl: string;
    deadline?: Date | null;
  }[],
  refuse: new Set<string>(),
  /** While set, a mail waits here before it counts as sent. */
  hold: undefined as Promise<void> | undefined,
  inFlight: 0,
}));
vi.mock("@query/auth/email", () => ({
  sendAcceptanceEmail: vi.fn(async () => {}),
  sendApplicationReminderEmail: vi.fn(
    async (message: (typeof mailed.calls)[number]) => {
      mailed.inFlight++;
      try {
        await mailed.hold;
      } finally {
        mailed.inFlight--;
      }
      if (mailed.refuse.has(message.email)) throw new Error("550 mailbox full");
      mailed.calls.push(message);
    },
  ),
}));

const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!URL)("application drafts against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const userIds: string[] = [];
  const hackathonIds: string[] = [];
  const banEmails: string[] = [];

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let appRouter: any;
  let ctx: any;
  let reminders: typeof Reminders;
  let drafts: typeof Drafts;

  const email = (tag: string) => `ad-${suffix}-${tag}@example.test`;
  const makeUser = async (tag: string, address = email(tag)) => {
    const id = `ad-${suffix}-${tag}`;
    await S.db!.insert(S.users).values({
      id,
      email: address,
      name: `User ${tag}`,
    });
    userIds.push(id);
    return id;
  };
  const makeHackathon = async (
    tag: string,
    extra: Record<string, unknown> = {},
  ) => {
    const [row] = await S.db!.insert(S.hackathons)
      .values({
        name: `AD ${suffix} ${tag}`,
        startDate: new Date("2027-02-26T14:00:00Z"),
        endDate: new Date("2027-02-28T17:00:00Z"),
        status: "open",
        ...extra,
      })
      .returning();
    hackathonIds.push(row!.id);
    return row!;
  };
  const as = (userId: string) => appRouter.createCaller(ctx(userId)).hackathon;

  const draftRow = async (userId: string, hackathonId: string) =>
    (
      await S.db!.select()
        .from(S.hackathonApplicationDrafts)
        .where(
          ops.and(
            ops.eq(S.hackathonApplicationDrafts.userId, userId),
            ops.eq(S.hackathonApplicationDrafts.hackathonId, hackathonId),
          ),
        )
    )[0];

  /** A draft written straight to the table, last touched `ageDays` before `now`. */
  const plantDraft = async (
    userId: string,
    hackathonId: string,
    now: Date,
    ageDays: number,
    extra: Record<string, unknown> = {},
  ) => {
    await S.db!.insert(S.hackathonApplicationDrafts).values({
      userId,
      hackathonId,
      data: { firstName: "Ada" },
      updatedAt: new Date(now.getTime() - ageDays * DAY),
      ...extra,
    });
  };

  const mailedTo = (addresses: string[]) =>
    mailed.calls.filter((c) => addresses.includes(c.email)).map((c) => c.email);

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    reminders = await import("../services/application-reminders");
    drafts = await import("../services/application-drafts");
    ({ appRouter } = await import("../root"));
    const { cache } = await import("../middleware/cache");
    ctx = (userId: string) => ({
      db: S.db,
      session: { user: { id: userId } },
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    });
  }, 120_000);

  beforeEach(() => {
    mailed.calls.length = 0;
    mailed.refuse.clear();
    mailed.hold = undefined;
  });

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    if (banEmails.length) {
      await db
        .delete(S.hackathonBans)
        .where(ops.inArray(S.hackathonBans.email, banEmails));
    }
    if (hackathonIds.length) {
      await db
        .delete(S.hackathons)
        .where(ops.inArray(S.hackathons.id, hackathonIds));
    }
    if (userIds.length) {
      await db
        .delete(S.auditLogs)
        .where(ops.inArray(S.auditLogs.userId, userIds));
      await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
    }
  });

  describe("saving and reading", () => {
    it("upserts one row per person and edition, and reads it back", async () => {
      const h = await makeHackathon("upsert");
      const u = await makeUser("upsert");

      expect(await as(u).getMyDraft({ hackathonId: h.id })).toBeNull();

      await as(u).saveMyDraft({
        hackathonId: h.id,
        data: {
          firstName: "Ada",
          whyAttend: "To build.",
          dietary: ["Vegan"],
          needsHardware: true,
        },
      });
      const first = await as(u).getMyDraft({ hackathonId: h.id });
      expect(first?.data).toEqual({
        firstName: "Ada",
        whyAttend: "To build.",
        dietary: ["Vegan"],
        needsHardware: true,
      });

      await new Promise((r) => setTimeout(r, 15));
      await as(u).saveMyDraft({
        hackathonId: h.id,
        data: { firstName: "Ada", lastName: "Lovelace" },
      });
      const second = await as(u).getMyDraft({ hackathonId: h.id });
      // Replaced whole, not merged: the earlier answers are gone.
      expect(second?.data).toEqual({ firstName: "Ada", lastName: "Lovelace" });
      expect(second!.updatedAt.getTime()).toBeGreaterThan(
        first!.updatedAt.getTime(),
      );

      const rows = await S.db!.select()
        .from(S.hackathonApplicationDrafts)
        .where(ops.eq(S.hackathonApplicationDrafts.hackathonId, h.id));
      expect(rows).toHaveLength(1);
    });

    it("keeps each person's draft to themselves", async () => {
      const h = await makeHackathon("private");
      const a = await makeUser("priv-a");
      const b = await makeUser("priv-b");
      await as(a).saveMyDraft({
        hackathonId: h.id,
        data: { firstName: "Ada" },
      });

      expect(await as(b).getMyDraft({ hackathonId: h.id })).toBeNull();
    });

    it("drops unknown keys and the sensitive answers a draft never holds", async () => {
      const h = await makeHackathon("strip");
      const u = await makeUser("strip");

      await as(u).saveMyDraft({
        hackathonId: h.id,
        data: {
          firstName: "Ada",
          // Never kept in a draft.
          usCitizen: "Yes",
          ramadanFasting: "Yes",
          phone: "555-0100",
          age: "20",
          gender: "Woman",
          race: "x",
          emergencyContact: "Mum",
          agreeToCodeOfConduct: true,
          mlhCodeOfConduct: true,
          mlhDataSharing: true,
          resumeFile: "data:application/pdf;base64,AAAA",
          // Not a field at all.
          invented: "x",
          __proto__: { polluted: true },
        } as any,
      });

      const row = await draftRow(u, h.id);
      expect(row?.data).toEqual({ firstName: "Ada" });
      expect(({} as any).polluted).toBeUndefined();
    });

    it("refuses a draft over the size cap", async () => {
      const h = await makeHackathon("size");
      const u = await makeUser("size");
      // Every field inside its own length limit, in a character that costs three
      // bytes, so the total is what trips.
      const wide = (n: number) => "日".repeat(n);
      const data = {
        whyAttend: wide(2000),
        techJourney: wide(2000),
        helpfulFeedback: wide(2000),
        dreamBuild: wide(2000),
        anythingElse: wide(2000),
        school: wide(300),
        major: wide(300),
        resumeUrl: wide(500),
        linkedinUrl: wide(500),
        githubUrl: wide(500),
      };
      expect(
        drafts.draftByteLength(drafts.applicationDraftData.parse(data)),
      ).toBeGreaterThan(drafts.MAX_DRAFT_BYTES);

      await expect(
        as(u).saveMyDraft({ hackathonId: h.id, data }),
      ).rejects.toThrow(/too large/i);
      expect(await draftRow(u, h.id)).toBeUndefined();
    });

    it("refuses a field longer than its own limit", async () => {
      const h = await makeHackathon("limit");
      const u = await makeUser("limit");
      await expect(
        as(u).saveMyDraft({
          hackathonId: h.id,
          data: { whyAttend: "x".repeat(2001) },
        }),
      ).rejects.toThrow();
    });
  });

  describe("who may save", () => {
    it("refuses once the person has applied, and register clears the draft", async () => {
      const h = await makeHackathon("register");
      const u = await makeUser("register");
      await as(u).saveMyDraft({
        hackathonId: h.id,
        data: { firstName: "Ada" },
      });
      expect(await draftRow(u, h.id)).toBeDefined();

      await as(u).register({
        hackathonId: h.id,
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "555-0100",
        age: 20,
        school: "Georgia Tech",
        major: "Computer Science",
        graduationYear: new Date().getFullYear() + 1,
        levelOfStudy: "Junior",
        country: "United States",
        whyAttend: "I want to build with data.",
        ...applicationAnswers,
        agreeToCodeOfConduct: true,
        mlhCodeOfConduct: true,
        mlhDataSharing: true,
      });

      // Same transaction as the participant row: no moment of one without the other.
      expect(await draftRow(u, h.id)).toBeUndefined();
      const [participant] = await S.db!.select()
        .from(S.hackathonParticipants)
        .where(ops.eq(S.hackathonParticipants.userId, u));
      expect(participant?.registrationStatus).toBe("pending");

      await expect(
        as(u).saveMyDraft({ hackathonId: h.id, data: { firstName: "Ada" } }),
      ).rejects.toThrow(/already registered/);
      expect(await draftRow(u, h.id)).toBeUndefined();
    });

    it("refuses when registration is not open", async () => {
      const closed = await makeHackathon("closed", { status: "closed" });
      const past = await makeHackathon("past", {
        registrationDeadline: new Date(Date.now() - DAY),
      });
      const announced = await makeHackathon("announced", {
        status: "announced",
      });
      const u = await makeUser("closed");

      for (const h of [closed, past, announced]) {
        await expect(
          as(u).saveMyDraft({ hackathonId: h.id, data: { firstName: "Ada" } }),
        ).rejects.toThrow(/not open/);
      }
      await expect(
        as(u).saveMyDraft({
          hackathonId: "00000000-0000-4000-8000-000000000000",
          data: { firstName: "Ada" },
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("refuses a banned address, whatever its case", async () => {
      const h = await makeHackathon("banned");
      const address = email("banned").toUpperCase();
      const u = await makeUser("banned", address);
      banEmails.push(address.toLowerCase());
      await S.db!.insert(S.hackathonBans).values({
        email: address.toLowerCase(),
        reason: "test",
      });

      await expect(
        as(u).saveMyDraft({ hackathonId: h.id, data: { firstName: "Ada" } }),
      ).rejects.toThrow(/can't take part/);
    });

    it("limits how fast one person can save", async () => {
      const h = await makeHackathon("rate");
      const u = await makeUser("rate");
      const results: string[] = [];
      for (let i = 0; i < 125; i++) {
        results.push(
          await as(u)
            .saveMyDraft({ hackathonId: h.id, data: { firstName: `A${i}` } })
            .then(
              () => "ok",
              (e: Error) => e.message,
            ),
        );
      }
      expect(results.filter((r) => r === "ok")).toHaveLength(120);
      expect(results[120]).toMatch(/too many saves/i);
    }, 60_000);
  });

  describe("the three-day reminder", () => {
    // Fixed, so ages are exact. A fresh edition per case keeps the cases apart.
    const NOW = new Date("2027-01-10T15:00:00Z");
    const run = (now = NOW) =>
      reminders.sendApplicationReminders(S.db as any, now);
    const deadline = new Date("2027-01-20T04:59:00Z");

    it("mails only stale, unsubmitted drafts on an open edition, not banned", async () => {
      const open = await makeHackathon("rem-open", {
        registrationDeadline: deadline,
      });
      const noDeadline = await makeHackathon("rem-nodl");
      const closed = await makeHackathon("rem-closed", { status: "closed" });
      const lapsed = await makeHackathon("rem-lapsed", {
        registrationDeadline: new Date(NOW.getTime() - 1000),
      });

      const want: string[] = [];
      const skip: string[] = [];
      const add = async (
        tag: string,
        h: { id: string },
        ageDays: number,
        expectMail: boolean,
        extra: Record<string, unknown> = {},
        address = email(`rem-${tag}`),
      ) => {
        const id = await makeUser(`rem-${tag}`, address);
        await plantDraft(id, h.id, NOW, ageDays, extra);
        (expectMail ? want : skip).push(address);
        return id;
      };

      await add("stale", open, 4, true);
      await add("exactly3", open, 3, true); // at the cutoff counts
      await add("nodl", noDeadline, 5, true);
      await add("fresh", open, 2.9, false);
      await add("closed", closed, 5, false);
      await add("lapsed", lapsed, 5, false);
      await add("already", open, 5, false, {
        reminderSentAt: new Date(NOW.getTime() - DAY),
      });

      const registered = await add("registered", open, 5, false);
      await S.db!.insert(S.hackathonParticipants).values({
        hackathonId: open.id,
        userId: registered,
        registrationStatus: "pending",
      });

      const judge = await add("judge", open, 5, false);
      await S.db!.insert(S.judges).values({
        hackathonId: open.id,
        userId: judge,
        name: "J",
      });

      const bannedAddress = email("rem-banned").toUpperCase();
      await add("banned", open, 5, false, {}, bannedAddress);
      banEmails.push(bannedAddress.toLowerCase());
      await S.db!.insert(S.hackathonBans).values({
        email: bannedAddress.toLowerCase(),
        reason: "test",
      });

      const result = await run();
      expect(result.failed).toBe(0);
      expect(mailedTo([...want, ...skip]).sort()).toEqual([...want].sort());

      const stale = mailed.calls.find((c) => c.email === email("rem-stale"))!;
      expect(stale.hackathonName).toBe(open.name);
      expect(stale.hackathonUrl).toBe(
        `https://datasciencegt.org/hackathons/${open.id}`,
      );
      expect(stale.deadline).toEqual(deadline);
      expect(
        mailed.calls.find((c) => c.email === email("rem-nodl"))!.deadline,
      ).toBeNull();

      // Stamped, so tomorrow's run mails nobody again.
      const stamped = await draftRow(`ad-${suffix}-rem-stale`, open.id);
      expect(stamped?.reminderSentAt).toEqual(NOW);
      mailed.calls.length = 0;
      await run(new Date(NOW.getTime() + DAY));
      expect(mailedTo(want)).toEqual([]);
      // The one that was a day short has since waited three.
      expect(mailedTo(skip)).toEqual([email("rem-fresh")]);
    });

    it("never mails one draft twice when two runs overlap", async () => {
      const h = await makeHackathon("rem-race");
      const addresses: string[] = [];
      for (let i = 0; i < 40; i++) {
        const id = await makeUser(`race${i}`);
        await plantDraft(id, h.id, NOW, 4);
        addresses.push(email(`race${i}`));
      }

      const [a, b, c] = await Promise.all([
        run(NOW),
        run(new Date(NOW.getTime() + 1)),
        run(new Date(NOW.getTime() + 2)),
      ]);

      // Each of the 40 exactly once, and no address mailed twice anywhere.
      const to = mailedTo(addresses);
      expect(to).toHaveLength(40);
      expect(new Set(to).size).toBe(40);
      const everyone = mailed.calls.map((call) => call.email);
      expect(new Set(everyone).size).toBe(everyone.length);
      // What the three runs report adds up to what left the building.
      expect(a.sent + b.sent + c.sent).toBe(mailed.calls.length);
      expect(a.claimed + b.claimed + c.claimed).toBe(mailed.calls.length);
    }, 60_000);

    it("a Scheduler retry while the first run is still mailing sends nothing twice, because the claim comes first", async () => {
      const h = await makeHackathon("rem-retry");
      const addresses: string[] = [];
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = await makeUser(`retry${i}`);
        await plantDraft(id, h.id, NOW, 4);
        addresses.push(email(`retry${i}`));
        ids.push(id);
      }

      // The mailer is slow, so the first run is mid-send when the retry arrives.
      let release!: () => void;
      mailed.hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = run(NOW);
      await vi.waitFor(() => expect(mailed.inFlight).toBe(5));

      // Nothing has left yet, and every draft is already stamped as taken.
      expect(mailedTo(addresses)).toEqual([]);
      for (const id of ids) {
        expect((await draftRow(id, h.id))?.reminderSentAt).not.toBeNull();
      }

      const retry = await run(new Date(NOW.getTime() + 60_000));
      expect(retry).toEqual({ claimed: 0, sent: 0, failed: 0 });
      expect(mailedTo(addresses)).toEqual([]);

      release();
      expect(await first).toEqual({ claimed: 5, sent: 5, failed: 0 });
      expect([...mailedTo(addresses)].sort()).toEqual([...addresses].sort());
      // And a retry after it finished has nothing left either.
      expect(await run(new Date(NOW.getTime() + 120_000))).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
      });
      expect(mailedTo(addresses)).toHaveLength(5);
    }, 30_000);

    it("re-checks a draft it had to wait for, so one taken or edited meanwhile is not mailed", async () => {
      const h = await makeHackathon("rem-lock");
      const taken = await makeUser("lock-taken");
      const edited = await makeUser("lock-edited");
      await plantDraft(taken, h.id, NOW, 4);
      await plantDraft(edited, h.id, NOW, 4);
      const draftOf = (userId: string) =>
        ops.and(
          ops.eq(S.hackathonApplicationDrafts.userId, userId),
          ops.eq(S.hackathonApplicationDrafts.hackathonId, h.id),
        );

      // Two writers hold their rows while a run is mid-statement: a rival run
      // that has just stamped one, and an applicant who has just saved the
      // other. The run read both as waiting; once the writers commit, the
      // UPDATE must look again rather than trust that read.
      let pending!: Promise<unknown>;
      await S.db!.transaction(async (tx) => {
        await tx
          .update(S.hackathonApplicationDrafts)
          .set({ reminderSentAt: new Date(NOW.getTime() - 1000) })
          .where(draftOf(taken));
        await tx
          .update(S.hackathonApplicationDrafts)
          .set({ updatedAt: NOW })
          .where(draftOf(edited));
        pending = run();
        await new Promise((resolve) => setTimeout(resolve, 600));
      });
      await pending;

      expect(mailedTo([email("lock-taken"), email("lock-edited")])).toEqual([]);
      expect((await draftRow(edited, h.id))?.reminderSentAt).toBeNull();
    });

    it("sends at most one batch a run and picks up the rest next time", async () => {
      const h = await makeHackathon("rem-batch");
      const total = reminders.REMINDER_BATCH + 5;
      const addresses = Array.from({ length: total }, (_, i) =>
        email(`batch${i}`),
      );
      await S.db!.insert(S.users).values(
        addresses.map((address, i) => ({
          id: `ad-${suffix}-batch${i}`,
          email: address,
        })),
      );
      userIds.push(...addresses.map((_, i) => `ad-${suffix}-batch${i}`));
      await S.db!.insert(S.hackathonApplicationDrafts).values(
        addresses.map((_, i) => ({
          userId: `ad-${suffix}-batch${i}`,
          hackathonId: h.id,
          data: { firstName: "Ada" },
          // Oldest first, so the batch is the 200 who have waited longest.
          updatedAt: new Date(NOW.getTime() - 4 * DAY - (total - i) * 1000),
        })),
      );

      // One run never exceeds the cap, whatever else is waiting in the table.
      const first = await run();
      expect(first.claimed).toBeLessThanOrEqual(reminders.REMINDER_BATCH);
      expect(first.sent).toBe(first.claimed);
      expect(mailedTo(addresses).length).toBeLessThanOrEqual(
        reminders.REMINDER_BATCH,
      );

      // The rest follow on later runs, each person once.
      for (let i = 0; i < 3 && new Set(mailedTo(addresses)).size < total; i++)
        await run();
      expect(mailedTo(addresses)).toHaveLength(total);
      expect(new Set(mailedTo(addresses)).size).toBe(total);
    }, 120_000);

    it("gives the claim back when the mailer refuses, so the next run retries only those", async () => {
      const h = await makeHackathon("rem-fail");
      const good = await makeUser("fail-good");
      const bad = await makeUser("fail-bad");
      await plantDraft(good, h.id, NOW, 4);
      await plantDraft(bad, h.id, NOW, 4);
      mailed.refuse.add(email("fail-bad"));

      const first = await run();
      expect(first.failed).toBe(1);
      expect(mailedTo([email("fail-good"), email("fail-bad")])).toEqual([
        email("fail-good"),
      ]);
      expect((await draftRow(good, h.id))?.reminderSentAt).toEqual(NOW);
      expect((await draftRow(bad, h.id))?.reminderSentAt).toBeNull();

      mailed.refuse.clear();
      mailed.calls.length = 0;
      await run(new Date(NOW.getTime() + DAY));
      expect(mailedTo([email("fail-good"), email("fail-bad")])).toEqual([
        email("fail-bad"),
      ]);
    });

    it("does not mail again when the draft is edited after the reminder", async () => {
      const h = await makeHackathon("rem-edit", {
        registrationDeadline: new Date(Date.now() + 30 * DAY),
      });
      const u = await makeUser("edit");
      const stampedAt = new Date(Date.now() - 2 * DAY);
      await plantDraft(u, h.id, new Date(), 5, { reminderSentAt: stampedAt });

      await as(u).saveMyDraft({
        hackathonId: h.id,
        data: { firstName: "Ada", lastName: "L" },
      });

      const row = await draftRow(u, h.id);
      expect(row?.reminderSentAt).toEqual(stampedAt);
      expect(row!.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

      // Stale again by then, but already mailed once, so never mailed twice.
      await run(new Date(Date.now() + 10 * DAY));
      expect(mailedTo([email("edit")])).toEqual([]);
    });
  });
});
