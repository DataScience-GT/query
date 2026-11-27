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

import type * as Volunteer from "../services/volunteer";

/**
 * Real-Postgres test for the volunteer application: applying, editing and
 * withdrawing, the edition window, the organisers' decisions with their audit
 * trail and emails, and the roster and its CSV source. The mailer is mocked,
 * so nothing here can reach a real provider.
 * Needs TEST_DATABASE_URL (disposable; never Neon or production).
 */
const URL = process.env.TEST_DATABASE_URL;

const mailed = vi.hoisted(() => ({
  approved: [] as { email: string; hackathonName: string; volunteerUrl: string }[],
  declined: [] as { email: string; hackathonName: string }[],
  refuse: new Set<string>(),
}));
vi.mock("@query/auth/email", () => ({
  sendVolunteerApprovedEmail: vi.fn(
    async (message: (typeof mailed.approved)[number]) => {
      if (mailed.refuse.has(message.email)) throw new Error("550 mailbox full");
      mailed.approved.push(message);
    },
  ),
  sendVolunteerDeclinedEmail: vi.fn(
    async (message: (typeof mailed.declined)[number]) => {
      mailed.declined.push(message);
    },
  ),
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const answers = (over: Record<string, unknown> = {}) => ({
  affiliation: "gt_student",
  availability: ["sat_morning", "fri_setup"],
  roles: ["check_in", "meals"],
  experience: "Ran registration for a 300-person career fair.",
  shirtSize: "M",
  dietary: ["Vegetarian"],
  phone: "(404) 555-0142",
  acknowledged: true,
  ...over,
});

describe.skipIf(!URL)("volunteer application against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const userIds: string[] = [];
  const hackathonIds: string[] = [];
  const banEmails: string[] = [];

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let appRouter: any;
  let ctx: any;
  let volunteer: typeof Volunteer;

  const email = (tag: string) => `vol-${suffix}-${tag}@example.test`;
  const makeUser = async (tag: string, role?: string) => {
    const id = `vol-${suffix}-${tag}`;
    await S.db!.insert(S.users).values({
      id,
      email: email(tag),
      name: `User ${tag}`,
    });
    userIds.push(id);
    if (role) {
      await S.db!.insert(S.admins).values({ userId: id, role: role as any });
    }
    return id;
  };
  // Starts in the future by default, so the edition is inside its window.
  const makeHackathon = async (
    tag: string,
    extra: Record<string, unknown> = {},
  ) => {
    const [row] = await S.db!.insert(S.hackathons)
      .values({
        name: `Hacklytics VOL ${suffix} ${tag}`,
        startDate: new Date(Date.now() + 30 * DAY),
        endDate: new Date(Date.now() + 32 * DAY),
        status: "open",
        ...extra,
      })
      .returning();
    hackathonIds.push(row!.id);
    return row!;
  };
  const as = (userId: string) => appRouter.createCaller(ctx(userId)).volunteer;
  const rowFor = async (userId: string, hackathonId: string) =>
    (
      await S.db!.select()
        .from(S.hackathonVolunteerApplications)
        .where(
          ops.and(
            ops.eq(S.hackathonVolunteerApplications.userId, userId),
            ops.eq(S.hackathonVolunteerApplications.hackathonId, hackathonId),
          ),
        )
    )[0];
  const auditFor = async (action: string, resourceId: string) =>
    S.db!.select()
      .from(S.auditLogs)
      .where(
        ops.and(
          ops.eq(S.auditLogs.action, action),
          ops.eq(S.auditLogs.resourceId, resourceId),
        ),
      );
  const refused = (code: string) =>
    expect.objectContaining({ code });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    volunteer = await import("../services/volunteer");
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
    mailed.approved.length = 0;
    mailed.declined.length = 0;
    mailed.refuse.clear();
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

  describe("applying", () => {
    it("stores a pending application and reads it back", async () => {
      const h = await makeHackathon("submit");
      const u = await makeUser("submit");

      expect(await as(u).myApplication({ hackathonId: h.id })).toBeNull();

      const result = await as(u).submit({ hackathonId: h.id, answers: answers() });
      expect(result).toEqual({ status: "pending" });

      const mine = await as(u).myApplication({ hackathonId: h.id });
      expect(mine?.status).toBe("pending");
      // Held in the form's own order, whatever order they were picked in.
      expect(mine?.answers.availability).toEqual(["fri_setup", "sat_morning"]);
      expect(mine?.answers.phone).toBe("(404) 555-0142");
    });

    it("keeps each person's application to themselves", async () => {
      const h = await makeHackathon("private");
      const a = await makeUser("priv-a");
      const b = await makeUser("priv-b");
      await as(a).submit({ hackathonId: h.id, answers: answers() });

      expect(await as(b).myApplication({ hackathonId: h.id })).toBeNull();
    });

    it("strips keys the form never asked, in the answers and around them", async () => {
      const h = await makeHackathon("strip");
      const u = await makeUser("strip");

      await as(u).submit({
        hackathonId: h.id,
        status: "approved",
        userId: "someone-else",
        answers: answers({ isAdmin: true, status: "approved", ssn: "000" }),
      } as any);

      const row = await rowFor(u, h.id);
      expect(row?.status).toBe("pending");
      expect(row?.userId).toBe(u);
      expect(Object.keys(row!.answers).sort()).toEqual(
        [
          "acknowledged",
          "affiliation",
          "availability",
          "dietary",
          "experience",
          "phone",
          "roles",
          "shirtSize",
        ].sort(),
      );
    });

    it("holds the answers to what the form requires", async () => {
      const h = await makeHackathon("rules");
      const u = await makeUser("rules");
      const submit = (over: Record<string, unknown>) =>
        as(u).submit({ hackathonId: h.id, answers: answers(over) });

      await expect(submit({ availability: [] })).rejects.toThrow(/at least one time block/);
      await expect(submit({ availability: ["sun_brunch"] })).rejects.toThrow();
      await expect(submit({ roles: ["bouncer"] })).rejects.toThrow();
      await expect(submit({ affiliation: "alien" })).rejects.toThrow();
      await expect(submit({ shirtSize: "XXXL" })).rejects.toThrow();
      await expect(submit({ acknowledged: false })).rejects.toThrow(/confirm/i);
      await expect(submit({ phone: "" })).rejects.toThrow(/phone/i);
      await expect(submit({ phone: "call me maybe" })).rejects.toThrow();
      await expect(submit({ dietary: ["Other"] })).rejects.toThrow(/dietary restriction/);
      expect(await rowFor(u, h.id)).toBeUndefined();

      // Roles and the experience note are optional.
      await submit({ roles: [], experience: "   " });
      const row = await rowFor(u, h.id);
      expect(row?.answers.roles).toEqual([]);
      expect(row?.answers.experience).toBeUndefined();
    });

    it("takes one application per person per edition", async () => {
      const h = await makeHackathon("unique");
      const other = await makeHackathon("unique-other");
      const u = await makeUser("unique");

      await as(u).submit({ hackathonId: h.id, answers: answers() });
      await expect(
        as(u).submit({ hackathonId: h.id, answers: answers({ roles: ["photography"] }) }),
      ).rejects.toMatchObject(refused("CONFLICT"));

      const rows = await S.db!.select()
        .from(S.hackathonVolunteerApplications)
        .where(ops.eq(S.hackathonVolunteerApplications.hackathonId, h.id));
      expect(rows).toHaveLength(1);
      // The refused second submit changed nothing.
      expect(rows[0]!.answers.roles).toEqual(["check_in", "meals"]);

      // Another edition is another application.
      await as(u).submit({ hackathonId: other.id, answers: answers() });
      expect(await rowFor(u, other.id)).toBeDefined();
    });

    it("collapses two submits at the same moment into one row", async () => {
      const h = await makeHackathon("race");
      const u = await makeUser("race");
      const results = await Promise.allSettled([
        as(u).submit({ hackathonId: h.id, answers: answers() }),
        as(u).submit({ hackathonId: h.id, answers: answers() }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rows = await S.db!.select()
        .from(S.hackathonVolunteerApplications)
        .where(ops.eq(S.hackathonVolunteerApplications.hackathonId, h.id));
      expect(rows).toHaveLength(1);
    });

    it("refuses someone banned from hackathons, but not the way out", async () => {
      const h = await makeHackathon("banned");
      const u = await makeUser("banned");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      await S.db!.insert(S.hackathonBans).values({
        email: email("banned"),
        reason: "test",
      });
      banEmails.push(email("banned"));
      const { cache } = await import("../middleware/cache");
      cache.delete(`hackathon-ban:${email("banned")}`);

      await expect(
        as(u).update({ hackathonId: h.id, answers: answers() }),
      ).rejects.toMatchObject(refused("FORBIDDEN"));
      await expect(as(u).withdraw({ hackathonId: h.id })).resolves.toEqual({ success: true });
    });
  });

  describe("the edition window", () => {
    it("takes applications while announced or open and before the event starts", async () => {
      for (const status of ["announced", "open"]) {
        const h = await makeHackathon(`window-${status}`, { status });
        const u = await makeUser(`window-${status}`);
        await expect(
          as(u).submit({ hackathonId: h.id, answers: answers() }),
        ).resolves.toEqual({ status: "pending" });
      }
    });

    it("refuses a closed edition", async () => {
      const h = await makeHackathon("closed", { status: "closed" });
      const u = await makeUser("closed");
      await expect(
        as(u).submit({ hackathonId: h.id, answers: answers() }),
      ).rejects.toThrow(/closed/);
      expect(await rowFor(u, h.id)).toBeUndefined();
    });

    it("refuses once the event has started", async () => {
      const h = await makeHackathon("started", {
        status: "open",
        startDate: new Date(Date.now() - HOUR),
        endDate: new Date(Date.now() + DAY),
      });
      const u = await makeUser("started");
      await expect(
        as(u).submit({ hackathonId: h.id, answers: answers() }),
      ).rejects.toThrow(/closed/);
    });

    it("does not know a draft, a private or a missing edition", async () => {
      const draft = await makeHackathon("draft", { status: "draft" });
      const hidden = await makeHackathon("hidden", { isPublic: false });
      const u = await makeUser("unknown");
      for (const id of [
        draft.id,
        hidden.id,
        "00000000-0000-4000-8000-000000000000",
      ]) {
        await expect(
          as(u).submit({ hackathonId: id, answers: answers() }),
        ).rejects.toMatchObject(refused("NOT_FOUND"));
      }
    });

    it("lets a pending application be corrected until the edition ends", async () => {
      const h = await makeHackathon("late-edit");
      const u = await makeUser("late-edit");
      await as(u).submit({ hackathonId: h.id, answers: answers() });

      // Registration closes and the event starts: edits still land.
      await S.db!.update(S.hackathons)
        .set({
          status: "in_progress",
          startDate: new Date(Date.now() - DAY),
          endDate: new Date(Date.now() + DAY),
        })
        .where(ops.eq(S.hackathons.id, h.id));
      await as(u).update({ hackathonId: h.id, answers: answers({ roles: ["photography"] }) });
      expect((await rowFor(u, h.id))?.answers.roles).toEqual(["photography"]);

      await S.db!.update(S.hackathons)
        .set({ status: "completed", endDate: new Date(Date.now() - HOUR) })
        .where(ops.eq(S.hackathons.id, h.id));
      await expect(
        as(u).update({ hackathonId: h.id, answers: answers() }),
      ).rejects.toThrow(/over/);
    });
  });

  describe("editing and withdrawing", () => {
    it("edits a pending application and leaves its status alone", async () => {
      const h = await makeHackathon("edit");
      const u = await makeUser("edit");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const before = await rowFor(u, h.id);

      await new Promise((r) => setTimeout(r, 15));
      await as(u).update({
        hackathonId: h.id,
        answers: answers({ roles: ["photography"], availability: ["sun_closing"] }),
      });

      const after = await rowFor(u, h.id);
      expect(after?.status).toBe("pending");
      expect(after?.answers.roles).toEqual(["photography"]);
      expect(after?.answers.availability).toEqual(["sun_closing"]);
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
      expect(after!.createdAt.getTime()).toBe(before!.createdAt.getTime());
    });

    it("refuses to edit what an organizer has decided, or what was never applied for", async () => {
      const h = await makeHackathon("edit-decided");
      const admin = await makeUser("edit-decided-admin", "admin");
      const u = await makeUser("edit-decided");
      await expect(
        as(u).update({ hackathonId: h.id, answers: answers() }),
      ).rejects.toMatchObject(refused("NOT_FOUND"));

      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = await rowFor(u, h.id);
      await as(admin).decide({ applicationId: app!.id, decision: "approved" });

      await expect(
        as(u).update({ hackathonId: h.id, answers: answers({ roles: ["photography"] }) }),
      ).rejects.toMatchObject(refused("BAD_REQUEST"));
      expect((await rowFor(u, h.id))?.answers.roles).toEqual(["check_in", "meals"]);
    });

    it("withdraws, and can apply again while the edition is open", async () => {
      const h = await makeHackathon("withdraw");
      const u = await makeUser("withdraw");
      await as(u).submit({ hackathonId: h.id, answers: answers() });

      await expect(as(u).withdraw({ hackathonId: h.id })).resolves.toEqual({ success: true });
      expect((await rowFor(u, h.id))?.status).toBe("withdrawn");
      await expect(as(u).withdraw({ hackathonId: h.id })).rejects.toThrow(/already withdrawn/);

      await as(u).submit({
        hackathonId: h.id,
        answers: answers({ roles: ["help_desk"] }),
      });
      const again = await rowFor(u, h.id);
      expect(again?.status).toBe("pending");
      expect(again?.answers.roles).toEqual(["help_desk"]);
      expect(again?.reviewedAt).toBeNull();
    });

    it("withdraws an approved application, but a declined one stays declined", async () => {
      const h = await makeHackathon("withdraw-decided");
      const admin = await makeUser("withdraw-decided-admin", "admin");
      const yes = await makeUser("withdraw-yes");
      const no = await makeUser("withdraw-no");
      await as(yes).submit({ hackathonId: h.id, answers: answers() });
      await as(no).submit({ hackathonId: h.id, answers: answers() });
      await as(admin).decide({
        applicationId: (await rowFor(yes, h.id))!.id,
        decision: "approved",
      });
      await as(admin).decide({
        applicationId: (await rowFor(no, h.id))!.id,
        decision: "declined",
      });

      await as(yes).withdraw({ hackathonId: h.id });
      expect((await rowFor(yes, h.id))?.status).toBe("withdrawn");
      expect(await volunteer.isApprovedVolunteer(S.db!, yes, h.id)).toBe(false);

      await expect(as(no).withdraw({ hackathonId: h.id })).rejects.toThrow(/already declined/);
      // A declined application is not reopened by applying again.
      await expect(
        as(no).submit({ hackathonId: h.id, answers: answers() }),
      ).rejects.toMatchObject(refused("CONFLICT"));
      expect((await rowFor(no, h.id))?.status).toBe("declined");
    });

    it("does not let a withdrawal be overwritten by a late decision", async () => {
      const h = await makeHackathon("withdraw-first");
      const admin = await makeUser("withdraw-first-admin", "admin");
      const u = await makeUser("withdraw-first");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = await rowFor(u, h.id);
      await as(u).withdraw({ hackathonId: h.id });

      await expect(
        as(admin).decide({ applicationId: app!.id, decision: "approved" }),
      ).rejects.toThrow(/withdrew/);
      expect((await rowFor(u, h.id))?.status).toBe("withdrawn");
      expect(mailed.approved).toHaveLength(0);
    });
  });

  describe("organizer decisions", () => {
    it("approves with an audit record and one email, however often it is clicked", async () => {
      const h = await makeHackathon("approve");
      const admin = await makeUser("approve-admin", "admin");
      const u = await makeUser("approve");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = (await rowFor(u, h.id))!;

      const first = await as(admin).decide({ applicationId: app.id, decision: "approved" });
      const second = await as(admin).decide({ applicationId: app.id, decision: "approved" });
      expect(first).toMatchObject({ status: "approved", changed: true });
      expect(second).toMatchObject({ status: "approved", changed: false });

      const row = await rowFor(u, h.id);
      expect(row?.status).toBe("approved");
      expect(row?.reviewedById).toBe(admin);
      expect(row?.reviewedAt).toBeInstanceOf(Date);

      const audit = await auditFor("volunteer.approve", app.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: admin, severity: "info" });
      expect(audit[0]!.metadata).toMatchObject({
        hackathonId: h.id,
        applicantId: u,
        from: "pending",
      });

      expect(mailed.approved).toHaveLength(1);
      expect(mailed.approved[0]).toMatchObject({
        email: email("approve"),
        hackathonName: h.name,
      });
      expect(mailed.approved[0]!.volunteerUrl).toMatch(
        /\/hackathons\/hacklytics-vol-[a-z0-9-]+\/volunteer$/,
      );
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(true);
    });

    it("does not give approved volunteers the scanner staff tier", async () => {
      const h = await makeHackathon("no-tier");
      const admin = await makeUser("no-tier-admin", "admin");
      const u = await makeUser("no-tier");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      await as(admin).decide({
        applicationId: (await rowFor(u, h.id))!.id,
        decision: "approved",
      });

      const staff = await S.db!.select()
        .from(S.admins)
        .where(ops.eq(S.admins.userId, u));
      expect(staff).toHaveLength(0);
    });

    it("declines with an audit record and one polite email", async () => {
      const h = await makeHackathon("decline");
      const admin = await makeUser("decline-admin", "super_admin");
      const u = await makeUser("decline");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = (await rowFor(u, h.id))!;

      await as(admin).decide({ applicationId: app.id, decision: "declined" });
      await as(admin).decide({ applicationId: app.id, decision: "declined" });

      expect((await rowFor(u, h.id))?.status).toBe("declined");
      expect(await auditFor("volunteer.decline", app.id)).toHaveLength(1);
      expect(mailed.declined).toEqual([
        { email: email("decline"), hackathonName: h.name },
      ]);
      expect(mailed.approved).toHaveLength(0);
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(false);
    });

    it("lets a decision be reversed, and mails each real change", async () => {
      const h = await makeHackathon("reverse");
      const admin = await makeUser("reverse-admin", "admin");
      const u = await makeUser("reverse");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = (await rowFor(u, h.id))!;

      await as(admin).decide({ applicationId: app.id, decision: "declined" });
      await as(admin).decide({ applicationId: app.id, decision: "approved" });

      expect((await rowFor(u, h.id))?.status).toBe("approved");
      expect(mailed.declined).toHaveLength(1);
      expect(mailed.approved).toHaveLength(1);
      expect(await auditFor("volunteer.approve", app.id)).toHaveLength(1);
      expect(await auditFor("volunteer.decline", app.id)).toHaveLength(1);
    });

    it("keeps the decision when the email fails", async () => {
      const h = await makeHackathon("mail-fails");
      const admin = await makeUser("mail-fails-admin", "admin");
      const u = await makeUser("mail-fails");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      mailed.refuse.add(email("mail-fails"));
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        as(admin).decide({
          applicationId: (await rowFor(u, h.id))!.id,
          decision: "approved",
        }),
      ).resolves.toMatchObject({ status: "approved" });
      quiet.mockRestore();
      expect((await rowFor(u, h.id))?.status).toBe("approved");
    });

    it("refuses everyone who is not full staff", async () => {
      const h = await makeHackathon("refuse");
      const u = await makeUser("refuse");
      const bug = await makeUser("refuse-bug", "bug_tester");
      const scanner = await makeUser("refuse-scanner", "volunteer");
      const stranger = await makeUser("refuse-stranger");
      await as(u).submit({ hackathonId: h.id, answers: answers() });
      const app = (await rowFor(u, h.id))!;

      for (const who of [bug, scanner, stranger]) {
        await expect(
          as(who).decide({ applicationId: app.id, decision: "approved" }),
        ).rejects.toMatchObject(refused("FORBIDDEN"));
        await expect(as(who).list({ hackathonId: h.id })).rejects.toMatchObject(
          refused("FORBIDDEN"),
        );
        await expect(
          as(who).exportApplications({ hackathonId: h.id }),
        ).rejects.toMatchObject(refused("FORBIDDEN"));
      }
      expect((await rowFor(u, h.id))?.status).toBe("pending");
      expect(mailed.approved).toHaveLength(0);
      expect(await auditFor("volunteer.approve", app.id)).toHaveLength(0);
    });

    it("says so when the application is not there", async () => {
      const admin = await makeUser("missing-admin", "admin");
      await expect(
        as(admin).decide({
          applicationId: "00000000-0000-4000-8000-000000000000",
          decision: "approved",
        }),
      ).rejects.toMatchObject(refused("NOT_FOUND"));
    });
  });

  describe("the roster", () => {
    it("filters by status, role and block, and counts coverage over everyone", async () => {
      const h = await makeHackathon("roster");
      const admin = await makeUser("roster-admin", "admin");
      const ada = await makeUser("roster-ada");
      const bo = await makeUser("roster-bo");
      const cy = await makeUser("roster-cy");
      const di = await makeUser("roster-di");
      await as(ada).submit({
        hackathonId: h.id,
        answers: answers({ roles: ["check_in"], availability: ["fri_setup", "sat_morning"] }),
      });
      await as(bo).submit({
        hackathonId: h.id,
        answers: answers({ roles: ["check_in", "photography"], availability: ["sat_morning"] }),
      });
      await as(cy).submit({
        hackathonId: h.id,
        answers: answers({ roles: ["meals"], availability: ["sun_closing"] }),
      });
      await as(di).submit({
        hackathonId: h.id,
        answers: answers({ roles: [], availability: ["sat_morning"] }),
      });
      await as(admin).decide({ applicationId: (await rowFor(ada, h.id))!.id, decision: "approved" });
      await as(admin).decide({ applicationId: (await rowFor(cy, h.id))!.id, decision: "declined" });
      await as(di).withdraw({ hackathonId: h.id });

      const all = await as(admin).list({ hackathonId: h.id });
      expect(all.applications).toHaveLength(4);
      // The person comes with it, so the table can name them.
      expect(all.applications.find((a: any) => a.userId === ada)?.user).toMatchObject({
        email: email("roster-ada"),
      });

      const names = (r: any) =>
        r.applications.map((a: any) => a.user.email.split("-").at(-1)!.split("@")[0]).sort();
      expect(names(await as(admin).list({ hackathonId: h.id, status: "approved" }))).toEqual(["ada"]);
      expect(names(await as(admin).list({ hackathonId: h.id, role: "check_in" }))).toEqual(["ada", "bo"]);
      expect(names(await as(admin).list({ hackathonId: h.id, block: "sat_morning" }))).toEqual([
        "ada",
        "bo",
        "di",
      ]);
      expect(
        names(await as(admin).list({ hackathonId: h.id, block: "sat_morning", role: "check_in", status: "pending" })),
      ).toEqual(["bo"]);

      // Coverage ignores the filters, and counts only people who could still
      // come: Cy was declined and Di withdrew.
      const { coverage } = await as(admin).list({ hackathonId: h.id, status: "declined" });
      expect(coverage.byStatus).toEqual({ pending: 1, approved: 1, declined: 1, withdrawn: 1 });
      expect(coverage.blocks.sat_morning).toEqual({ approved: 1, pending: 1 });
      expect(coverage.blocks.fri_setup).toEqual({ approved: 1, pending: 0 });
      expect(coverage.blocks.sun_closing).toEqual({ approved: 0, pending: 0 });
      expect(coverage.roles.check_in).toEqual({ approved: 1, pending: 1 });
      expect(coverage.roles.photography).toEqual({ approved: 0, pending: 1 });
      expect(coverage.roles.meals).toEqual({ approved: 0, pending: 0 });
    });

    it("keeps one edition's volunteers out of another's roster", async () => {
      const a = await makeHackathon("scope-a");
      const b = await makeHackathon("scope-b");
      const admin = await makeUser("scope-admin", "admin");
      const u = await makeUser("scope");
      await as(u).submit({ hackathonId: a.id, answers: answers() });

      expect((await as(admin).list({ hackathonId: a.id })).applications).toHaveLength(1);
      expect((await as(admin).list({ hackathonId: b.id })).applications).toHaveLength(0);
    });

    it("exports the filtered rows and records who took them", async () => {
      const h = await makeHackathon("export");
      const admin = await makeUser("export-admin", "admin");
      const ada = await makeUser("export-ada");
      const bo = await makeUser("export-bo");
      await as(ada).submit({ hackathonId: h.id, answers: answers({ roles: ["meals"] }) });
      await as(bo).submit({ hackathonId: h.id, answers: answers({ roles: ["photography"] }) });

      const rows = await as(admin).exportApplications({
        hackathonId: h.id,
        role: "photography",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].answers.phone).toBe("(404) 555-0142");

      const audit = await auditFor("volunteer.export", h.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: admin, severity: "warn" });
      expect(audit[0]!.metadata).toMatchObject({ rowCount: 1, role: "photography" });

      // An export of nothing is still a read of the roster, and is recorded.
      await as(admin).exportApplications({ hackathonId: h.id, role: "judging" });
      expect(await auditFor("volunteer.export", h.id)).toHaveLength(2);
    });
  });

  describe("isApprovedVolunteer", () => {
    it("is true only for an approved application at that edition", async () => {
      const h = await makeHackathon("helper");
      const other = await makeHackathon("helper-other");
      const admin = await makeUser("helper-admin", "admin");
      const u = await makeUser("helper");
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(false);

      await as(u).submit({ hackathonId: h.id, answers: answers() });
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(false);

      await as(admin).decide({
        applicationId: (await rowFor(u, h.id))!.id,
        decision: "approved",
      });
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(true);
      expect(await volunteer.isApprovedVolunteer(S.db!, u, other.id)).toBe(false);
    });
  });
});

// The answers schema on its own, with no database.
describe("volunteerAnswers", () => {
  it("drops unknown keys and orders and dedupes the time blocks", async () => {
    const { volunteerAnswers } = await import("../services/volunteer");
    const parsed = volunteerAnswers.parse(
      answers({
        availability: ["sat_morning", "fri_setup", "sat_morning"],
        isAdmin: true,
      }),
    );
    expect(parsed.availability).toEqual(["fri_setup", "sat_morning"]);
    expect(parsed).not.toHaveProperty("isAdmin");
  });
});
