import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db, hackathons, hackathonParticipants } from "@query/db";

// Fully mock the DB at the file level. vi.mock factories are hoisted and
// file-scoped, so this mirrors the shape used by hackathon-flow.test.ts.
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
// Row count returned by `select({ count })...from(<table>)`, keyed by table.
const mockCount = vi.fn();
// Acceptance emails are sent through a dynamic import; intercept it so we can
// see exactly who a mass-approval actually mailed.
const mockSendAcceptanceEmail = vi.fn();

vi.mock("@query/auth/email", () => ({
  sendAcceptanceEmail: (...args: any[]) => mockSendAcceptanceEmail(...args),
}));

vi.mock("@query/db", () => {
  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

  // A promise that also answers the drizzle query-builder chain, so
  // `select().from(t)` and `select().from(t).where(...)` are both awaitable.
  const thenable = (rows: any[]): any => {
    const node: any = Promise.resolve(rows);
    node.where = () => thenable(rows);
    node.orderBy = () => thenable(rows);
    node.groupBy = () => thenable(rows);
    node.limit = () => thenable(rows);
    node.offset = () => thenable(rows);
    node.innerJoin = () => thenable(rows);
    node.leftJoin = () => thenable(rows);
    // `.for("update")` — row locking, used before a recount so a concurrent
    // registration cannot be overwritten.
    node.for = () => thenable(rows);
    return node;
  };

  return {
    db: {
      transaction: vi.fn().mockImplementation((callback) => callback(db)),
      query: {
        admins: table("admins"),
        users: table("users"),
        userProfiles: table("userProfiles"),
        hackathons: table("hackathons"),
        hackathonParticipants: table("hackathonParticipants"),
        hackathonTeams: table("hackathonTeams"),
        hackathonProjects: table("hackathonProjects"),
        hackathonEvents: table("hackathonEvents"),
        hackathonEventAttendees: table("hackathonEventAttendees"),
        members: table("members"),
        events: table("events"),
        eventCheckIns: table("eventCheckIns"),
        judges: table("judges"),
        judgeAssignments: table("judgeAssignments"),
        judgingProjects: table("judgingProjects"),
        judgeVotes: table("judgeVotes"),
        judgeQueue: table("judgeQueue"),
        stripePayments: table("stripePayments"),
        userAccountLinks: table("userAccountLinks"),
        auditLogs: table("auditLogs"),
      },
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
            onConflictDoUpdate: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockResolvedValue(val),
            })),
            onConflictDoNothing: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockResolvedValue(val),
            })),
          });
        },
      }),
      update: (...updateArgs: any[]) => ({
        set: (...setArgs: any[]) => ({
          where: (...wArgs: any[]) => {
            const val = mockUpdate("update", updateArgs, setArgs, wArgs);
            return Object.assign(Promise.resolve(val), {
              returning: vi.fn().mockResolvedValue(val),
            });
          },
        }),
      }),
      delete: (...deleteArgs: any[]) => ({
        where: (...wArgs: any[]) => {
          const val = mockDelete("delete", deleteArgs, wArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
          });
        },
      }),
      select: vi.fn().mockImplementation(() => ({
        from: (tbl: any) => thenable([{ count: mockCount(tbl?._t) ?? 0 }]),
      })),
    },
    admins: {
      _t: "admins",
      id: "id",
      userId: "user_id",
      isActive: "is_active",
      role: "role",
    },
    users: { _t: "users", id: "id", email: "email" },
    userProfiles: { _t: "userProfiles", userId: "user_id" },
    hackathons: {
      _t: "hackathons",
      id: "id",
      name: "name",
      status: "status",
      isPublic: "is_public",
      startDate: "start_date",
      endDate: "end_date",
      judgingActive: "judging_active",
      currentParticipants: "current_participants",
      maxParticipants: "max_participants",
    },
    hackathonParticipants: {
      _t: "hackathonParticipants",
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      registrationStatus: "registration_status",
      checkedInAt: "checked_in_at",
    },
    hackathonTeams: {
      _t: "hackathonTeams",
      id: "id",
      hackathonId: "hackathon_id",
      name: "name",
    },
    hackathonProjects: {
      _t: "hackathonProjects",
      id: "id",
      hackathonId: "hackathon_id",
      status: "status",
      submittedAt: "submitted_at",
    },
    hackathonEvents: {
      _t: "hackathonEvents",
      id: "id",
      hackathonId: "hackathon_id",
      name: "name",
      startTime: "start_time",
      endTime: "end_time",
    },
    hackathonEventAttendees: {
      _t: "hackathonEventAttendees",
      id: "id",
      eventId: "event_id",
      participantId: "participant_id",
      checkedInAt: "checked_in_at",
    },
    members: {
      _t: "members",
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
    },
    membershipHistory: { _t: "membershipHistory", id: "id", memberId: "member_id" },
    events: {
      _t: "events",
      id: "id",
      title: "title",
      qrCode: "qr_code",
      checkInEnabled: "check_in_enabled",
      eventDate: "event_date",
      currentCheckIns: "current_check_ins",
    },
    eventCheckIns: {
      _t: "eventCheckIns",
      id: "id",
      eventId: "event_id",
      userId: "user_id",
      checkedInAt: "checked_in_at",
    },
    judges: {
      _t: "judges",
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
      isActive: "is_active",
    },
    judgeAssignments: {
      _t: "judgeAssignments",
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
    },
    judgingProjects: {
      _t: "judgingProjects",
      id: "id",
      hackathonId: "hackathon_id",
      tableNumber: "table_number",
    },
    judgeVotes: {
      _t: "judgeVotes",
      judgeId: "judge_id",
      projectId: "project_id",
      score: "score",
    },
    judgeQueue: {
      _t: "judgeQueue",
      id: "id",
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
      isCompleted: "is_completed",
    },
    stripePayments: {
      _t: "stripePayments",
      id: "id",
      customerEmail: "customer_email",
      stripePaymentIntentId: "stripe_payment_intent_id",
    },
    userAccountLinks: {
      _t: "userAccountLinks",
      userId: "user_id",
      stripePaymentId: "stripe_payment_id",
    },
    auditLogs: { _t: "auditLogs", id: "id", severity: "severity", userId: "user_id" },
  };
});

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_B = "22222222-2222-4222-8222-222222222222";
const PART_A1 = "33333333-3333-4333-8333-333333333331";
const PART_A2 = "33333333-3333-4333-8333-333333333332";
const PART_B1 = "33333333-3333-4333-8333-333333333333";
const EVENT_A = "44444444-4444-4444-8444-444444444444";
const PROJECT = "66666666-6666-4666-8666-666666666666";
const ADMIN_ROW = "77777777-7777-4777-8777-777777777771";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const ADMIN_USER = "admin_user_id";

describe("Hackathon admin management edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    mockCount.mockReturnValue(0);
    mockFindMany.mockReturnValue([]);
    mockInsert.mockReturnValue([{}]);
    mockUpdate.mockReturnValue([{}]);
    mockDelete.mockReturnValue([{}]);
  });

  const createMockCtx = (userId?: string) =>
    ({
      db,
      session: userId ? { user: { id: userId } } : null,
      userId: userId || undefined,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    }) as any;

  const publicCaller = () => appRouter.createCaller(createMockCtx());

  const adminRow = (role = "admin") => ({
    id: ADMIN_ROW,
    userId: ADMIN_USER,
    isActive: true,
    role,
  });

  /**
   * Table-name-keyed findFirst. `admins` is always answered so the isAdmin
   * middleware lets the caller through; everything else comes from `rows`.
   */
  const adminCaller = (
    rows: Record<string, unknown> = {},
    role = "admin",
  ) => {
    mockFindFirst.mockImplementation((table: string) =>
      table === "admins" ? adminRow(role) : (rows as any)[table],
    );
    return appRouter.createCaller(createMockCtx(ADMIN_USER));
  };

  // =====================================================================
  describe("Volunteer scan tier", () => {
    const volunteerCaller = (rows: Record<string, unknown> = {}) =>
      adminCaller(rows, "volunteer");

    /**
     * The whole point of the tier. A volunteer holds an admins row, so without
     * an explicit role check they would pass every isAdmin gate in the API —
     * including the one that deletes the hackathon and cascades every
     * participant, team and vote with it.
     */
    it("refuses a volunteer every full-staff action", async () => {
      const caller = volunteerCaller({
        hackathons: { id: HACK_A, name: "Hacklytics 2027" },
      });

      await expect(
        caller.hackathon.adminGetAttendees({ hackathonId: HACK_A }),
      ).rejects.toThrow(/Admin access required/);

      await expect(
        caller.hackathon.exportAttendees({ hackathonId: HACK_A }),
      ).rejects.toThrow(/Admin access required/);

      await expect(
        caller.hackathon.delete({
          hackathonId: HACK_A,
          confirmName: "Hacklytics 2027",
        }),
      ).rejects.toThrow(/Admin access required/);

      await expect(
        caller.hackathon.batchUpdateParticipantStatus({
          hackathonId: HACK_A,
          participantIds: [PART_A1],
          status: "approved",
        }),
      ).rejects.toThrow(/Admin access required/);
    });

    it("lets a volunteer work a check-in desk", async () => {
      const caller = volunteerCaller({
        hackathonEvents: { id: EVENT_A, hackathonId: HACK_A },
      });
      mockFindMany.mockReturnValue([]);

      await expect(
        caller.hackathon.getEventAttendees({
          hackathonId: HACK_A,
          eventId: EVENT_A,
        }),
      ).resolves.toMatchObject({ matching: 0 });
    });

    // Full staff must keep the scan access they already had — the tier is
    // additive at the desk, not a replacement for it.
    it("still lets full staff scan", async () => {
      const caller = adminCaller({
        hackathonEvents: { id: EVENT_A, hackathonId: HACK_A },
      });
      mockFindMany.mockReturnValue([]);

      await expect(
        caller.hackathon.getEventAttendees({
          hackathonId: HACK_A,
          eventId: EVENT_A,
        }),
      ).resolves.toBeDefined();
    });
  });

  const liveHackathon = (overrides: Record<string, unknown> = {}) => ({
    id: HACK_A,
    name: "Hacklytics 2027",
    status: "open",
    isPublic: true,
    startDate: new Date(Date.now() + 7 * DAY),
    endDate: new Date(Date.now() + 9 * DAY),
    registrationDeadline: new Date(Date.now() + 5 * DAY),
    hackingStartTime: null,
    maxParticipants: 500,
    currentParticipants: 500,
    ...overrides,
  });

  // =====================================================================
  describe("Publishing: what an unannounced hackathon leaks", () => {
    // BUG: crud.list only filters on isPublic (which defaults to true), never
    // on status, so an admin's unsaved-to-the-world draft is browsable.
    it("does not serve draft hackathons to an anonymous browser", async () => {
      mockFindMany.mockReturnValue([
        liveHackathon({ status: "draft", name: "Secret Hacklytics 2028" }),
      ]);

      const res = await publicCaller().hackathon.list({ status: "draft" });

      expect(res).toHaveLength(0);
    });

    // BUG: crud.getById applies neither an isPublic nor a status predicate.
    it("hides an unpublished hackathon from an anonymous getById", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "hackathons"
          ? liveHackathon({ status: "draft", isPublic: false })
          : undefined,
      );

      await expect(
        publicCaller().hackathon.getById({ id: HACK_A }),
      ).rejects.toThrow(/not found/i);
    });

    // BUG: content.projects is a publicProcedure with no status filter, unlike
    // its sibling getPublicProjects which exists precisely to hide drafts.
    /**
     * getById enforced the draft rule on the hackathon row, but its public
     * children each queried by hackathonId with no such check — so anyone
     * holding the uuid could read an unannounced edition's full schedule,
     * gallery and results. NOT_FOUND rather than FORBIDDEN, because
     * confirming a hidden edition exists is most of the leak.
     */
    it("hides a draft edition's schedule, gallery and results from the public", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "hackathons" ? { id: HACK_A, status: "draft" } : undefined,
      );
      mockFindMany.mockReturnValue([]);

      const anon = publicCaller();

      await expect(
        anon.hackathon.getEvents({ hackathonId: HACK_A }),
      ).rejects.toThrow(/not found/i);
      await expect(
        anon.hackathon.projects({ hackathonId: HACK_A }),
      ).rejects.toThrow(/not found/i);
      await expect(
        anon.hackathon.getPublicProjects({ hackathonId: HACK_A }),
      ).rejects.toThrow(/not found/i);
      await expect(
        anon.hackathon.getResults({ hackathonId: HACK_A }),
      ).rejects.toThrow(/not found/i);
    });

    it("hides in-progress project drafts and their scores from rivals", async () => {
      // The gallery now refuses to serve a hackathon the caller cannot see, so
      // a visible one has to exist before the project filter is reached.
      mockFindFirst.mockImplementation((table: string) =>
        table === "hackathons" ? { id: HACK_A, status: "open" } : undefined,
      );
      mockFindMany.mockReturnValue([
        {
          id: PROJECT,
          hackathonId: HACK_A,
          status: "draft",
          githubUrl: "https://github.com/team/secret",
          score: 87,
          ranking: 1,
          team: { participants: [] },
        },
      ]);

      const res: any[] = await publicCaller().hackathon.projects({
        hackathonId: HACK_A,
      });

      expect(res.map((p) => p.status)).not.toContain("draft");
    });
  });

  // =====================================================================
  describe("Mass acceptance", () => {
    it("refuses to mass-accept into a hackathon that does not exist", async () => {
      const caller = adminCaller({ hackathons: undefined });

      await expect(
        caller.hackathon.sendMassAcceptanceEmails({
          hackathonId: HACK_B,
          participantIds: [PART_A1],
        }),
      ).rejects.toThrow(/Hackathon not found/);
    });

    // BUG: the recipient query is `inArray(id, participantIds)` with no
    // hackathonId predicate, while the status UPDATE is scoped by hackathonId.
    it("never emails an acceptance to someone registered for a different hackathon", async () => {
      const caller = adminCaller({ hackathons: { name: "Hacklytics 2027" } });
      // The real query matches on id alone, so a stale id from hackathon B
      // comes back in the result set.
      mockFindMany.mockReturnValue([
        { id: PART_A1, hackathonId: HACK_A, user: { email: "ada@example.com" } },
        { id: PART_B1, hackathonId: HACK_B, user: { email: "grace@example.com" } },
      ]);

      const res = await caller.hackathon.sendMassAcceptanceEmails({
        hackathonId: HACK_A,
        participantIds: [PART_A1, PART_B1],
      });

      const mailed = mockSendAcceptanceEmail.mock.calls.map((c) => c[0].email);
      expect(mailed).toEqual(["ada@example.com"]);
      // The B participant's row is never updated, so it must not be counted.
      expect(res.approved).toBe(1);
    });

    // BUG: `approved` is `participantIds.length`, not the number of rows the
    // scoped UPDATE actually touched.
    it("reports how many participants were really approved, not how many ids were pasted", async () => {
      const caller = adminCaller({ hackathons: { name: "Hacklytics 2027" } });
      mockFindMany.mockReturnValue([
        { id: PART_A1, hackathonId: HACK_A, user: { email: "ada@example.com" } },
        { id: PART_A2, hackathonId: HACK_A, user: { email: "alan@example.com" } },
      ]);

      const res = await caller.hackathon.sendMassAcceptanceEmails({
        hackathonId: HACK_A,
        // PART_B1 belongs to another hackathon; the UPDATE matches zero rows.
        participantIds: [PART_A1, PART_A2, PART_B1],
      });

      expect(res.approved).toBe(2);
    });

    /**
     * The recovery case. A mass send that died partway leaves everyone before
     * the failure point already emailed; re-running is the obvious next move,
     * and without reading the marker it congratulates them all again. An
     * acceptance email cannot be unsent.
     */
    it("does not email anyone who already received their acceptance", async () => {
      const caller = adminCaller({ hackathons: { name: "Hacklytics 2027" } });
      mockFindMany.mockReturnValue([
        {
          id: PART_A1,
          hackathonId: HACK_A,
          acceptanceEmailSentAt: new Date("2026-08-01"),
          user: { email: "ada@example.com" },
        },
        {
          id: PART_A2,
          hackathonId: HACK_A,
          acceptanceEmailSentAt: null,
          user: { email: "alan@example.com" },
        },
      ]);

      const res = await caller.hackathon.sendMassAcceptanceEmails({
        hackathonId: HACK_A,
        participantIds: [PART_A1, PART_A2],
      });

      const mailed = mockSendAcceptanceEmail.mock.calls.map((c) => c[0].email);
      expect(mailed).toEqual(["alan@example.com"]);
      expect(res).toMatchObject({ emailed: 1, alreadyEmailed: 1 });
      // Both are still approved — only the mail is skipped.
      expect(res.approved).toBe(2);
    });

    // Deliberately resending is still possible; it just is not the default.
    it("re-emails everyone when resend is asked for", async () => {
      const caller = adminCaller({ hackathons: { name: "Hacklytics 2027" } });
      mockFindMany.mockReturnValue([
        {
          id: PART_A1,
          hackathonId: HACK_A,
          acceptanceEmailSentAt: new Date("2026-08-01"),
          user: { email: "ada@example.com" },
        },
      ]);

      const res = await caller.hackathon.sendMassAcceptanceEmails({
        hackathonId: HACK_A,
        participantIds: [PART_A1],
        resend: true,
      });

      expect(res.emailed).toBe(1);
    });

    // A send that the provider rejected must not be reported as delivered:
    // "sent to 500" when 0 arrived gives the organiser no reason to look again.
    it("counts emails that actually left, separately from approvals", async () => {
      const caller = adminCaller({ hackathons: { name: "Hacklytics 2027" } });
      mockFindMany.mockReturnValue([
        { id: PART_A1, hackathonId: HACK_A, user: { email: "ada@example.com" } },
        { id: PART_A2, hackathonId: HACK_A, user: { email: "alan@example.com" } },
      ]);
      mockSendAcceptanceEmail.mockRejectedValueOnce(
        new Error("450 mailbox unavailable"),
      );

      const res = await caller.hackathon.sendMassAcceptanceEmails({
        hackathonId: HACK_A,
        participantIds: [PART_A1, PART_A2],
      });

      expect(res.approved).toBe(2);
      expect(res.emailed).toBe(1);
      expect(res.failedEmails).toEqual(["ada@example.com"]);
    });
  });

  // =====================================================================
  describe("Participant status transitions", () => {
    it("refuses to restatus a participant belonging to another hackathon", async () => {
      const caller = adminCaller({ hackathonParticipants: undefined });

      await expect(
        caller.hackathon.updateParticipantStatus({
          hackathonId: HACK_A,
          participantId: PART_B1,
          status: "approved",
        }),
      ).rejects.toThrow(/Participant not found/);
    });

    // BUG: hackathonParticipants.checkedInAt is never written by any code path,
    // so the admin attendees table renders a permanently blank column.
    it("records when a participant was checked in", async () => {
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "approved",
        },
      });

      await caller.hackathon.updateParticipantStatus({
        hackathonId: HACK_A,
        participantId: PART_A1,
        status: "checked_in",
      });

      const participantWrite = mockUpdate.mock.calls.find(
        (c) => c[1][0] === hackathonParticipants,
      );
      expect(participantWrite?.[2][0].checkedInAt).toBeInstanceOf(Date);
    });

    /**
     * Reported by review on #325.
     *
     * Submitting a project now requires `checked_in`, which makes it an
     * authorisation state rather than a note about who turned up. Setting it on
     * somebody still pending would hand them the whole event with no review
     * having happened — and the attendees screen offers "Select all N
     * matching", so one wrong click could do it to every applicant at once.
     */
    it("refuses to check in an applicant who has not been accepted", async () => {
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "pending",
        },
      });

      await expect(
        caller.hackathon.updateParticipantStatus({
          hackathonId: HACK_A,
          participantId: PART_A1,
          status: "checked_in",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(
        mockUpdate.mock.calls.find((c) => c[1][0] === hackathonParticipants),
      ).toBeUndefined();
    });

    it("names the remedy rather than just refusing", async () => {
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "rejected",
        },
      });

      await expect(
        caller.hackathon.updateParticipantStatus({
          hackathonId: HACK_A,
          participantId: PART_A1,
          status: "checked_in",
        }),
      ).rejects.toThrow(/Accept them first/i);
    });

    // Re-scanning somebody already inside is ordinary, not a transition.
    it("allows checking in somebody already checked in", async () => {
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "checked_in",
          checkedInAt: new Date(),
        },
      });

      await expect(
        caller.hackathon.updateParticipantStatus({
          hackathonId: HACK_A,
          participantId: PART_A1,
          status: "checked_in",
        }),
      ).resolves.toMatchObject({ success: true });
    });

    // BUG: hackathons.currentParticipants is incremented on register and never
    // decremented, so rejected applicants permanently consume capacity.
    it("frees a seat when an admin rejects a registration", async () => {
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "pending",
        },
        hackathons: liveHackathon(),
      });

      await caller.hackathon.updateParticipantStatus({
        hackathonId: HACK_A,
        participantId: PART_A1,
        status: "rejected",
      });

      const capacityWrite = mockUpdate.mock.calls.find(
        (c) => c[1][0] === hackathons,
      );
      expect(capacityWrite).toBeDefined();
    });
  });

  // =====================================================================
  describe("Badge scanning at the door", () => {
    const scanCtx = () =>
      adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "approved",
          user: { name: "Ada Lovelace", email: "ada@example.com" },
        },
        hackathonEvents: {
          id: EVENT_A,
          hackathonId: HACK_A,
          name: "Lunch",
          startTime: new Date(Date.now() - HOUR),
          endTime: new Date(Date.now() + HOUR),
        },
        hackathonEventAttendees: undefined,
      });

    /**
     * The scan IS the check-in.
     *
     * `checked_in` had no writer anywhere: this procedure recorded attendance
     * for one event and left the roster alone, and no screen ever passed the
     * status to updateParticipantStatus. Harmless while the status was only a
     * label — but submitting a project now requires it, so an unreachable
     * status meant NOBODY could submit for the whole event, and the error told
     * them to do the very thing they had just done. Found by an adversarial
     * review pass after #325 merged.
     */
    it("promotes an approved participant to checked_in on their first scan", async () => {
      const caller = scanCtx();

      const res = await caller.hackathon.scanParticipantPass({
        hackathonId: HACK_A,
        eventId: EVENT_A,
        participantId: PART_A1,
      });

      expect(res.checkedIn).toBe(true);
      const rosterWrite = mockUpdate.mock.calls.find(
        (c) => c[1][0] === hackathonParticipants,
      );
      expect(rosterWrite?.[2][0]).toMatchObject({
        registrationStatus: "checked_in",
      });
      expect(rosterWrite?.[2][0].checkedInAt).toBeInstanceOf(Date);
    });

    /**
     * The arrival time must keep pointing at when they arrived rather than at
     * their most recent meal, and re-promoting somebody already inside is a
     * write the door does not need to make.
     */
    it("does not restamp somebody already checked in", async () => {
      const arrived = new Date(Date.now() - 3 * HOUR);
      const caller = adminCaller({
        hackathonParticipants: {
          id: PART_A1,
          hackathonId: HACK_A,
          registrationStatus: "checked_in",
          checkedInAt: arrived,
          user: { name: "Ada Lovelace", email: "ada@example.com" },
        },
        hackathonEvents: {
          id: EVENT_A,
          hackathonId: HACK_A,
          name: "Lunch",
          startTime: new Date(Date.now() - HOUR),
          endTime: new Date(Date.now() + HOUR),
        },
        hackathonEventAttendees: undefined,
      });

      const res = await caller.hackathon.scanParticipantPass({
        hackathonId: HACK_A,
        eventId: EVENT_A,
        participantId: PART_A1,
      });

      expect(res.checkedIn).toBe(false);
      expect(
        mockUpdate.mock.calls.find((c) => c[1][0] === hackathonParticipants),
      ).toBeUndefined();
    });

    // BUG: the duplicate guard is a findFirst followed by an unguarded insert.
    // unique('unique_event_participant') turns the losing racer's scan into a
    // raw 23505 -> INTERNAL_SERVER_ERROR instead of the friendly CONFLICT.
    it("tells the volunteer 'already checked in' when two scanners race", async () => {
      const caller = scanCtx();
      mockInsert.mockImplementation(() => {
        const err: any = new Error(
          'duplicate key value violates unique constraint "unique_event_participant"',
        );
        err.code = "23505";
        throw err;
      });

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: EVENT_A,
          participantId: PART_A1,
        }),
      ).rejects.toThrow(/already checked into/);
    });
  });

  // =====================================================================
  describe("Editing a hackathon after it exists", () => {
    it("rejects a partial update that would end the hackathon before it starts", async () => {
      const caller = adminCaller({ hackathons: liveHackathon() });

      await expect(
        caller.hackathon.update({
          id: HACK_A,
          // endDate stays at +9d, so a start at +10d is impossible.
          startDate: new Date(Date.now() + 10 * DAY),
        }),
      ).rejects.toThrow(/End date must be after start date/);
    });

    // INTENTIONAL, not a bug: create() refines registrationDeadline <= startDate,
    // but update() deliberately does not re-check it. Organisers reopen
    // registration mid-event to admit walk-ins, so an admin must be able to push
    // the deadline past the start date. This test pins that behaviour so nobody
    // "fixes" it back into a validation error.
    it("lets an admin reopen registration after the event has started, for walk-ins", async () => {
      const caller = adminCaller({ hackathons: liveHackathon() });
      mockUpdate.mockReturnValue([{ id: HACK_A }]);

      await expect(
        caller.hackathon.update({
          id: HACK_A,
          registrationDeadline: new Date(Date.now() + 8 * DAY),
        }),
      ).resolves.toBeDefined();
    });

    /**
     * `undefined` means leave alone, `null` means clear. Without the
     * distinction a track list that was once set could never be emptied — the
     * edit form would send `[]`, zod would drop it, and the stale value would
     * keep routing judges at projects nobody entered for it.
     */
    it("clears a field sent as null and leaves omitted ones alone", async () => {
      const caller = adminCaller({ hackathons: liveHackathon() });
      mockUpdate.mockReturnValue([{ id: HACK_A }]);

      await caller.hackathon.update({
        id: HACK_A,
        tracks: null,
        rules: null,
      });

      const written = mockUpdate.mock.calls.at(-1)?.[2]?.[0];
      expect(written).toMatchObject({ tracks: null, rules: null });
      // theme was never sent, so it must not appear in the UPDATE at all.
      expect(written).not.toHaveProperty("theme");
    });

    it("stores the tracks it was given", async () => {
      const caller = adminCaller({ hackathons: liveHackathon() });
      mockUpdate.mockReturnValue([{ id: HACK_A }]);

      await caller.hackathon.update({
        id: HACK_A,
        tracks: ["AI", "Healthcare"],
      });

      expect(mockUpdate.mock.calls.at(-1)?.[2]?.[0]).toMatchObject({
        tracks: ["AI", "Healthcare"],
      });
    });

    // Every child table cascades off this row, so reporting success for an id
    // that matched nothing hides a delete that never happened.
    it("refuses to delete a hackathon id that does not exist", async () => {
      // super_admin: deleting an edition is deliberately the narrowest gate
      // in the product.
      const caller = adminCaller({ hackathons: undefined }, "super_admin");
      // RETURNING names the rows the statement itself removed; against an id
      // that matches nothing that is the empty set.
      mockDelete.mockReturnValue([]);

      await expect(
        caller.hackathon.delete({
          hackathonId: HACK_B,
          confirmName: "Hacklytics 2027",
        }),
      ).rejects.toThrow(/not found/i);
    });

    /**
     * The audit trail must never be the reason an organiser's action fails.
     * A delete that succeeded and went unrecorded is bad; a delete refused
     * because the logging table was busy is worse, and from the outside it is
     * indistinguishable from the guard doing its job.
     */
    it("still deletes when the audit write fails", async () => {
      const caller = adminCaller(
        { hackathons: { id: HACK_A, name: "Hacklytics 2027" } },
        "super_admin",
      );
      mockDelete.mockReturnValue([{ id: HACK_A }]);
      mockInsert.mockImplementation(() => {
        throw new Error("audit_logs unavailable");
      });

      await expect(
        caller.hackathon.delete({
          hackathonId: HACK_A,
          confirmName: "Hacklytics 2027",
        }),
      ).resolves.toMatchObject({ success: true });
    });

    // Eleven tables cascade off this row. A click-through confirm is one stray
    // Enter key; the name has to be typed and has to match.
    it("refuses to delete when the typed name does not match", async () => {
      const caller = adminCaller(
        { hackathons: { id: HACK_A, name: "Hacklytics 2027" } },
        "super_admin",
      );

      await expect(
        caller.hackathon.delete({
          hackathonId: HACK_A,
          confirmName: "hacklytics 2026",
        }),
      ).rejects.toThrow(/exact name/i);

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  describe("Schedule editing", () => {
    it("refuses to create an event that ends before it starts", async () => {
      const caller = adminCaller({ hackathons: liveHackathon() });

      await expect(
        caller.hackathon.createEvent({
          hackathonId: HACK_A,
          name: "Closing Ceremony",
          type: "ceremony",
          location: "Klaus 1443",
          startTime: new Date(Date.now() + 8 * DAY),
          endTime: new Date(Date.now() + 8 * DAY - HOUR),
        }),
      ).rejects.toThrow(/End time must be after start time/);
    });

    it("refuses to edit an event that does not exist", async () => {
      const caller = adminCaller({ hackathonEvents: undefined });

      await expect(
        caller.hackathon.updateEvent({
          eventId: EVENT_A,
          location: "Klaus 2443",
        }),
      ).rejects.toThrow(/Event not found/);
    });

    // BUG: createEvent refines endTime > startTime but updateEvent has no
    // refine and no merged re-check, so a lone startTime can jump past the
    // stored endTime and invert the schedule ordering.
    it("refuses to move an event's start past its stored end time", async () => {
      const caller = adminCaller({
        hackathonEvents: {
          id: EVENT_A,
          hackathonId: HACK_A,
          name: "Closing Ceremony",
          startTime: new Date("2027-02-14T09:00:00Z"),
          endTime: new Date("2027-02-14T18:00:00Z"),
        },
      });
      mockUpdate.mockReturnValue([{ id: EVENT_A }]);

      await expect(
        caller.hackathon.updateEvent({
          eventId: EVENT_A,
          startTime: new Date("2027-02-14T23:00:00Z"),
        }),
      ).rejects.toThrow(/End time must be after start time/);
    });
  });

  // =====================================================================
  describe("Authoring hackathon copy", () => {
    const createInput = (description: string) => ({
      name: "Hacklytics 2027",
      description,
      startDate: new Date(Date.now() + 7 * DAY),
      endDate: new Date(Date.now() + 9 * DAY),
    });

    it("accepts an ordinary description", async () => {
      const caller = adminCaller();
      mockInsert.mockReturnValue([{ id: HACK_A, name: "Hacklytics 2027" }]);

      const res = await caller.hackathon.create(
        createInput("Two days of data science hacking on campus."),
      );
      expect(res).toMatchObject({ id: HACK_A });
    });

    // BUG: sanitizeInput throws a bare BAD_REQUEST "Invalid input" whenever
    // hasInjectionPattern matches, and its SQL-keyword pattern matches ordinary
    // English ("Select ... from ...", "Create ... from ..."). The sanitized
    // string is then discarded, so this is pure false-positive rejection.
    it("accepts prose that happens to contain SQL keywords", async () => {
      const caller = adminCaller();
      mockInsert.mockReturnValue([{ id: HACK_A, name: "Hacklytics 2027" }]);

      const res = await caller.hackathon.create(
        createInput("Select a track from the list below to get started."),
      );
      expect(res).toMatchObject({ id: HACK_A });
    });

    // Stripping markup instead of refusing it silently truncated free text at
    // the first "<": an HTML parser reads "<threshold" as an open tag and drops
    // the rest of the value. Angle brackets in prose have to survive verbatim.
    it.each([
      "Picks the class where loss<threshold, then retrains.",
      "Uses C++ templates like vector<int> and map<string,int>.",
      "Scoring is a<b for the tiebreak.",
    ])("stores %j exactly as written", async (description) => {
      const caller = adminCaller();
      mockInsert.mockReturnValue([{ id: HACK_A, name: "Hacklytics 2027" }]);

      await caller.hackathon.create(createInput(description));

      const values = mockInsert.mock.calls[0]?.[2]?.[0];
      expect(values.description).toBe(description);
    });

    it("refuses a description carrying executable markup", async () => {
      const caller = adminCaller();
      mockInsert.mockReturnValue([{ id: HACK_A }]);

      await expect(
        caller.hackathon.create(
          createInput("<script>alert(1)</script>Nice event"),
        ),
      ).rejects.toThrow(/not allowed/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  describe("Admin roster safety", () => {
    it("refuses to let a plain admin change another admin's role", async () => {
      const caller = adminCaller({}, "admin");

      await expect(
        caller.admin.update({ adminId: ADMIN_ROW, role: "moderator" }),
      ).rejects.toThrow(/Super admin access required/);
    });

    it("refuses to let a super admin deactivate their own account", async () => {
      const caller = adminCaller({}, "super_admin");
      mockUpdate.mockReturnValue([{ id: ADMIN_ROW }]);

      await expect(
        caller.admin.update({ adminId: ADMIN_ROW, isActive: false }),
      ).rejects.toThrow(/Cannot deactivate your own admin account/);
    });

    // BUG: the only self-protection is on isActive===false. Demoting your own
    // row is allowed and there is no "last super admin" invariant, so the org
    // can be locked out of admin management with no in-app recovery.
    it("refuses to let the last super admin demote themselves", async () => {
      const caller = adminCaller({}, "super_admin");
      mockFindMany.mockReturnValue([adminRow("super_admin")]);
      mockUpdate.mockReturnValue([{ id: ADMIN_ROW, role: "moderator" }]);

      await expect(
        caller.admin.update({ adminId: ADMIN_ROW, role: "moderator" }),
      ).rejects.toThrow(/super admin/i);
    });
  });

  // =====================================================================
  describe("Day-of dashboard", () => {
    // BUG: analyticsOverview counts eventCheckIns (the club check-in table),
    // not hackathonEventAttendees, which is what scanParticipantPass writes.
    it("counts today's hackathon badge scans", async () => {
      const caller = adminCaller({}, "admin");
      mockCount.mockImplementation((t: string) =>
        t === "hackathonEventAttendees" ? 7 : 0,
      );

      const res = await caller.admin.analyticsOverview();

      expect(res.checkinsToday).toBe(7);
    });
  });
});
