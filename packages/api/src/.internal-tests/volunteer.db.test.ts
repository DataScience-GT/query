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
  approved: [] as {
    email: string;
    hackathonName: string;
    mode: string;
    volunteerUrl: string;
  }[],
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
  mode: "in_person",
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

// An online mentor: no shirt size, diet or phone.
const onlineAnswers = (over: Record<string, unknown> = {}) => ({
  mode: "online",
  affiliation: "industry",
  topics: ["llm_apps", "python"],
  onlineAvailability: ["o_sat_evening", "o_fri_evening"],
  mentorExperience: "Four years shipping ML services; mentored at two hackathons.",
  acknowledged: true,
  ...over,
});

// Both sets of questions.
const bothAnswers = (over: Record<string, unknown> = {}) =>
  onlineAnswers({
    mode: "both",
    availability: ["sat_morning"],
    roles: ["help_desk"],
    shirtSize: "L",
    dietary: [],
    phone: "(404) 555-0142",
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
  // answers is read loosely: the shape depends on how the person offered to help.
  const rowFor = async (userId: string, hackathonId: string) => {
    const [row] = await S.db!.select()
      .from(S.hackathonVolunteerApplications)
      .where(
        ops.and(
          ops.eq(S.hackathonVolunteerApplications.userId, userId),
          ops.eq(S.hackathonVolunteerApplications.hackathonId, hackathonId),
        ),
      );
    return row && { ...row, answers: row.answers as Record<string, any> };
  };
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

      expect(await as(u).myApplication({ hackathonId: h.id })).toEqual({
        application: null,
        accepting: true,
        canEdit: true,
      });

      const result = await as(u).submit({ hackathonId: h.id, answers: answers() });
      expect(result).toEqual({ status: "pending" });

      const { application } = await as(u).myApplication({
        hackathonId: h.id,
      });
      const mine = application && {
        ...application,
        answers: application.answers as Record<string, any>,
      };
      expect(mine?.status).toBe("pending");
      // Held in the form's own order, whatever order they were picked in.
      expect(mine?.mode).toBe("in_person");
      expect(mine?.answers.availability).toEqual(["fri_setup", "sat_morning"]);
      expect(mine?.answers.phone).toBe("(404) 555-0142");
      // Who decides stays off what the applicant reads.
      expect(mine).not.toHaveProperty("reviewedById");
    });

    it("keeps each person's application to themselves", async () => {
      const h = await makeHackathon("private");
      const a = await makeUser("priv-a");
      const b = await makeUser("priv-b");
      await as(a).submit({ hackathonId: h.id, answers: answers() });

      expect(
        (await as(b).myApplication({ hackathonId: h.id })).application,
      ).toBeNull();
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
          "mode",
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
      expect((rows[0]!.answers as unknown as Record<string, unknown>).roles).toEqual([
        "check_in",
        "meals",
      ]);

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

  describe("how they want to help", () => {
    it("stores the mode as a column, from what the answers say", async () => {
      const h = await makeHackathon("mode-column");
      const inPerson = await makeUser("mode-in");
      const mentor = await makeUser("mode-online");
      const both = await makeUser("mode-both");

      await as(inPerson).submit({ hackathonId: h.id, answers: answers() });
      await as(mentor).submit({ hackathonId: h.id, answers: onlineAnswers() });
      await as(both).submit({ hackathonId: h.id, answers: bothAnswers() });

      expect((await rowFor(inPerson, h.id))?.mode).toBe("in_person");
      expect((await rowFor(mentor, h.id))?.mode).toBe("online");
      expect((await rowFor(both, h.id))?.mode).toBe("both");
      // The same word is inside the answers, which is what picked the questions.
      expect((await rowFor(mentor, h.id))?.answers.mode).toBe("online");
    });

    it("lets an online mentor apply with no shirt size, diet or phone", async () => {
      const h = await makeHackathon("mentor-minimal");
      const u = await makeUser("mentor-minimal");

      await as(u).submit({
        hackathonId: h.id,
        answers: onlineAnswers({
          // Sent by a client that still carries the venue's answers: dropped.
          shirtSize: "M",
          dietary: ["Vegan"],
          availability: ["fri_setup"],
        }),
      });

      const row = await rowFor(u, h.id);
      expect(row?.answers).toEqual({
        mode: "online",
        affiliation: "industry",
        topics: ["python", "llm_apps"],
        onlineAvailability: ["o_fri_evening", "o_sat_evening"],
        mentorExperience:
          "Four years shipping ML services; mentored at two hackathons.",
        acknowledged: true,
      });
    });

    it("holds an in-person application to availability, and refuses it without", async () => {
      const h = await makeHackathon("branch-in");
      const u = await makeUser("branch-in");
      await expect(
        as(u).submit({ hackathonId: h.id, answers: answers({ availability: [] }) }),
      ).rejects.toThrow(/at least one time block/);
      // A mentor's hours do not stand in for the venue's.
      await expect(
        as(u).submit({
          hackathonId: h.id,
          answers: answers({ availability: [], onlineAvailability: ["o_fri_evening"] }),
        }),
      ).rejects.toThrow(/at least one time block/);
      expect(await rowFor(u, h.id)).toBeUndefined();
    });

    it("holds an application for both to both sets", async () => {
      const h = await makeHackathon("branch-both");
      const u = await makeUser("branch-both");
      const submit = (over: Record<string, unknown>) =>
        as(u).submit({ hackathonId: h.id, answers: bothAnswers(over) });

      await expect(submit({ topics: [] })).rejects.toThrow(/at least one topic/);
      await expect(submit({ availability: [] })).rejects.toThrow(/at least one time block/);
      await expect(submit({ phone: "" })).rejects.toThrow(/phone number/);
      expect(await rowFor(u, h.id)).toBeUndefined();

      await submit({});
      const row = await rowFor(u, h.id);
      expect(row?.mode).toBe("both");
      expect(row?.answers).toMatchObject({
        availability: ["sat_morning"],
        topics: ["python", "llm_apps"],
        phone: "(404) 555-0142",
      });
    });

    it("moves the column with the answers when someone changes how they help", async () => {
      const h = await makeHackathon("mode-change");
      const u = await makeUser("mode-change");
      await as(u).submit({ hackathonId: h.id, answers: answers() });

      await as(u).update({ hackathonId: h.id, answers: onlineAnswers() });
      let row = await rowFor(u, h.id);
      expect(row?.mode).toBe("online");
      // The venue's answers are gone with it, not left beside the mentor's.
      expect(row?.answers).not.toHaveProperty("shirtSize");
      expect(row?.answers).not.toHaveProperty("availability");

      await as(u).withdraw({ hackathonId: h.id });
      await as(u).submit({ hackathonId: h.id, answers: bothAnswers() });
      row = await rowFor(u, h.id);
      expect(row?.status).toBe("pending");
      expect(row?.mode).toBe("both");
    });

    it("keeps the text behind 'other' only while it is picked", async () => {
      const h = await makeHackathon("topic-other");
      const u = await makeUser("topic-other");
      await as(u).submit({
        hackathonId: h.id,
        answers: onlineAnswers({ topics: ["python", "other"], topicOther: "Rust" }),
      });
      expect((await rowFor(u, h.id))?.answers.topicOther).toBe("Rust");

      await as(u).update({
        hackathonId: h.id,
        answers: onlineAnswers({ topics: ["python"], topicOther: "Rust" }),
      });
      expect((await rowFor(u, h.id))?.answers).not.toHaveProperty("topicOther");
    });

    it("reads the mode back for the page", async () => {
      const h = await makeHackathon("mode-read");
      const u = await makeUser("mode-read");
      await as(u).submit({ hackathonId: h.id, answers: bothAnswers() });
      const { application } = await as(u).myApplication({ hackathonId: h.id });
      expect(application?.mode).toBe("both");
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
      // The page asks the same question before it shows a form.
      expect(await as(u).myApplication({ hackathonId: h.id })).toMatchObject({
        accepting: false,
        canEdit: true,
      });
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
      expect(await as(u).myApplication({ hackathonId: h.id })).toMatchObject({
        accepting: false,
      });
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
        mode: "in_person",
      });
      expect(mailed.approved[0]!.volunteerUrl).toMatch(
        /\/hackathons\/hacklytics-vol-[a-z0-9-]+\/volunteer$/,
      );
      expect(await volunteer.isApprovedVolunteer(S.db!, u, h.id)).toBe(true);
    });

    it("tells the email how the volunteer offered to help", async () => {
      const h = await makeHackathon("approve-mode");
      const admin = await makeUser("approve-mode-admin", "admin");
      const mentor = await makeUser("approve-mode-online");
      const both = await makeUser("approve-mode-both");
      await as(mentor).submit({ hackathonId: h.id, answers: onlineAnswers() });
      await as(both).submit({ hackathonId: h.id, answers: bothAnswers() });
      for (const u of [mentor, both]) {
        await as(admin).decide({
          applicationId: (await rowFor(u, h.id))!.id,
          decision: "approved",
        });
      }
      expect(mailed.approved.map((m) => [m.email, m.mode])).toEqual([
        [email("approve-mode-online"), "online"],
        [email("approve-mode-both"), "both"],
      ]);
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

    it("filters by type, and counts coverage for the venue and for mentoring apart", async () => {
      const h = await makeHackathon("roster-modes");
      const admin = await makeUser("rm-admin", "admin");
      const venue = await makeUser("rm-venue");
      const mentor = await makeUser("rm-mentor");
      const mentor2 = await makeUser("rm-mentor2");
      const both = await makeUser("rm-both");
      const gone = await makeUser("rm-gone");
      await as(venue).submit({
        hackathonId: h.id,
        answers: answers({ roles: ["check_in"], availability: ["sat_morning"] }),
      });
      await as(mentor).submit({
        hackathonId: h.id,
        answers: onlineAnswers({
          topics: ["python", "other"],
          topicOther: "Rust",
          onlineAvailability: ["o_sat_evening"],
        }),
      });
      await as(mentor2).submit({
        hackathonId: h.id,
        answers: onlineAnswers({
          topics: ["python", "data_viz"],
          onlineAvailability: ["o_fri_evening", "o_sat_evening"],
        }),
      });
      await as(both).submit({
        hackathonId: h.id,
        answers: bothAnswers({
          roles: ["check_in", "help_desk"],
          availability: ["sat_morning"],
          topics: ["python"],
          onlineAvailability: ["o_sat_evening"],
        }),
      });
      await as(gone).submit({ hackathonId: h.id, answers: onlineAnswers() });
      await as(gone).withdraw({ hackathonId: h.id });
      await as(admin).decide({
        applicationId: (await rowFor(mentor, h.id))!.id,
        decision: "approved",
      });
      await as(admin).decide({
        applicationId: (await rowFor(both, h.id))!.id,
        decision: "approved",
      });

      const who = async (filter: Record<string, string>) =>
        (await as(admin).list({ hackathonId: h.id, ...filter }) as any).applications
          .map((a: any) => a.user.email.split("-rm-")[1].split("@")[0])
          .sort();

      // By how they want to help: the column.
      expect(await who({ mode: "in_person" })).toEqual(["venue"]);
      expect(await who({ mode: "online" })).toEqual(["gone", "mentor", "mentor2"]);
      expect(await who({ mode: "both" })).toEqual(["both"]);

      // A role or block is a venue answer: a mentor is never in them, and
      // someone who chose both is.
      expect(await who({ role: "check_in" })).toEqual(["both", "venue"]);
      expect(await who({ block: "sat_morning" })).toEqual(["both", "venue"]);
      // A topic or online hour is a mentoring answer, and the both-person is in it.
      expect(await who({ topic: "python" })).toEqual(["both", "gone", "mentor", "mentor2"]);
      expect(await who({ topic: "data_viz" })).toEqual(["mentor2"]);
      expect(await who({ onlineBlock: "o_sat_evening" })).toEqual([
        "both",
        "gone",
        "mentor",
        "mentor2",
      ]);
      expect(await who({ mode: "online", status: "pending" })).toEqual(["mentor2"]);

      const { coverage } = await as(admin).list({ hackathonId: h.id });
      // Chosen ways of helping, among those who could still come.
      expect(coverage.byMode).toEqual({
        in_person: { approved: 0, pending: 1 },
        online: { approved: 1, pending: 1 },
        both: { approved: 1, pending: 0 },
      });
      // The venue half: venue and both.
      expect(coverage.blocks.sat_morning).toEqual({ approved: 1, pending: 1 });
      expect(coverage.roles.check_in).toEqual({ approved: 1, pending: 1 });
      expect(coverage.roles.help_desk).toEqual({ approved: 1, pending: 0 });
      // The mentoring half: mentors and both, never the venue-only volunteer,
      // and never the one who withdrew.
      expect(coverage.onlineBlocks.o_sat_evening).toEqual({ approved: 2, pending: 1 });
      expect(coverage.onlineBlocks.o_fri_evening).toEqual({ approved: 0, pending: 1 });
      expect(coverage.topics.python).toEqual({ approved: 2, pending: 1 });
      expect(coverage.topics.other).toEqual({ approved: 1, pending: 0 });
      expect(coverage.topics.data_viz).toEqual({ approved: 0, pending: 1 });
      expect(coverage.topics.pitching).toEqual({ approved: 0, pending: 0 });
    });

    it("exports the type with each row", async () => {
      const h = await makeHackathon("export-modes");
      const admin = await makeUser("export-modes-admin", "admin");
      const mentor = await makeUser("export-modes-mentor");
      await as(mentor).submit({ hackathonId: h.id, answers: onlineAnswers() });

      const [row] = await as(admin).exportApplications({
        hackathonId: h.id,
        mode: "online",
      });
      expect(row).toMatchObject({ mode: "online", status: "pending" });
      expect(await as(admin).exportApplications({ hackathonId: h.id, mode: "both" })).toEqual(
        [],
      );
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
      expect(rows[0]?.answers).toMatchObject({ phone: "(404) 555-0142" });

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

// The answers schema on its own, with no database: what each way of helping
// must and need not be asked.
describe("volunteerAnswers", () => {
  const parse = async (input: unknown) => {
    const { volunteerAnswers } = await import("../services/volunteer");
    return volunteerAnswers.safeParse(input);
  };
  const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
    result.error?.issues.map((i) => i.message) ?? [];

  it("drops unknown keys and orders and dedupes the time blocks", async () => {
    const result = await parse(
      answers({
        availability: ["sat_morning", "fri_setup", "sat_morning"],
        isAdmin: true,
      }),
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.availability).toEqual(["fri_setup", "sat_morning"]);
    expect(data).not.toHaveProperty("isAdmin");
  });

  it("needs a way of helping, and says so", async () => {
    for (const mode of [undefined, "", "remote", "hybrid"]) {
      const result = await parse(answers({ mode }));
      expect(result.success, String(mode)).toBe(false);
      expect(messages(result)).toEqual(["Choose how you want to help."]);
    }
  });

  describe("in person", () => {
    it("needs availability, a shirt size and a phone", async () => {
      expect(await parse(answers())).toMatchObject({ success: true });
      expect(messages(await parse(answers({ availability: [] })))).toEqual([
        "Pick at least one time block you can cover.",
      ]);
      expect(messages(await parse(answers({ shirtSize: undefined })))).toEqual([
        "Choose a shirt size.",
      ]);
      expect(messages(await parse(answers({ phone: "" })))).toEqual([
        "Enter a phone number we can reach on event days.",
      ]);
    });

    it("does not ask the mentor questions, and drops them if they come anyway", async () => {
      const result = await parse(
        answers({ topics: ["python"], onlineAvailability: ["o_fri_evening"] }),
      );
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty("topics");
      expect(result.data).not.toHaveProperty("onlineAvailability");
    });
  });

  describe("online mentor", () => {
    it("needs topics, hours online and a line of experience, and nothing for the venue", async () => {
      const result = await parse(onlineAnswers());
      expect(result.success).toBe(true);
      // No shirt size, diet or phone to give.
      expect(result.data).toMatchObject({
        mode: "online",
        topics: ["python", "llm_apps"],
        onlineAvailability: ["o_fri_evening", "o_sat_evening"],
      });
      expect(result.data).not.toHaveProperty("shirtSize");
      expect(result.data).not.toHaveProperty("dietary");
    });

    it("asks for each of the three things it needs", async () => {
      expect(messages(await parse(onlineAnswers({ topics: [] })))).toEqual([
        "Pick at least one topic you can help with.",
      ]);
      expect(
        messages(await parse(onlineAnswers({ onlineAvailability: [] }))),
      ).toEqual(["Pick at least one time you can be online."]);
      expect(
        messages(await parse(onlineAnswers({ mentorExperience: "  " }))),
      ).toEqual(["Add a line about your experience."]);
    });

    it("does not ask for the venue's answers, so an empty availability is fine", async () => {
      expect(
        await parse(onlineAnswers({ availability: [], shirtSize: "", dietary: ["Other"] })),
      ).toMatchObject({ success: true });
    });

    it("takes a phone if one is given, and a blank one as none", async () => {
      const blank = await parse(onlineAnswers({ phone: "" }));
      expect(blank.success).toBe(true);
      expect((blank.data as { phone?: string }).phone).toBeUndefined();
      expect((await parse(onlineAnswers({ phone: "  (678) 555-0100 " }))).data).toMatchObject({
        phone: "(678) 555-0100",
      });
      expect((await parse(onlineAnswers({ phone: "123" }))).success).toBe(false);
      expect((await parse(onlineAnswers({ phone: "call me" }))).success).toBe(false);
    });

    it("asks what the other topic is, and keeps it only while other is picked", async () => {
      expect(
        messages(await parse(onlineAnswers({ topics: ["other"] }))),
      ).toEqual(["Tell us which other topic you can help with."]);

      const { storedAnswers } = await import("../services/volunteer");
      const withOther = await parse(
        onlineAnswers({ topics: ["python", "other"], topicOther: "  Rust  " }),
      );
      expect(withOther.success).toBe(true);
      expect(storedAnswers(withOther.data as never)).toMatchObject({ topicOther: "Rust" });

      // Typed, then the chip was turned off again: nothing stale is stored.
      const switchedOff = await parse(
        onlineAnswers({ topics: ["python"], topicOther: "Rust" }),
      );
      expect(storedAnswers(switchedOff.data as never)).not.toHaveProperty("topicOther");
    });
  });

  describe("both", () => {
    it("needs both sets", async () => {
      expect(await parse(bothAnswers())).toMatchObject({ success: true });

      // Missing the venue half.
      expect(messages(await parse(bothAnswers({ availability: [] })))).toEqual([
        "Pick at least one time block you can cover.",
      ]);
      expect(messages(await parse(bothAnswers({ shirtSize: undefined })))).toEqual([
        "Choose a shirt size.",
      ]);
      expect(messages(await parse(bothAnswers({ phone: undefined })))).toEqual([
        "Enter a phone number we can reach on event days.",
      ]);

      // Missing the mentor half.
      expect(messages(await parse(bothAnswers({ topics: [] })))).toEqual([
        "Pick at least one topic you can help with.",
      ]);
      expect(
        messages(await parse(bothAnswers({ onlineAvailability: [] }))),
      ).toEqual(["Pick at least one time you can be online."]);
      expect(
        messages(await parse(bothAnswers({ mentorExperience: "" }))),
      ).toEqual(["Add a line about your experience."]);
    });

    it("is held to the phone, which an online-only mentor is not", async () => {
      expect((await parse(bothAnswers({ phone: "" }))).success).toBe(false);
    });
  });
});
