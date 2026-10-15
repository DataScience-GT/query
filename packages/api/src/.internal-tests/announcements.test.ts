import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

/**
 * Mass announcements, and the thing that makes them survivable: a per-recipient
 * marker.
 *
 * The send loop runs in an organiser's browser and walks thousands of
 * recipients across separate requests. Before this, the server re-resolved the
 * audience on every batch and the client sliced it by offset — so a closed tab
 * could not be resumed without mailing everybody again, and any row that moved
 * between requests shifted the window silently.
 */

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelectRows = vi.fn(() => [] as unknown[]);
const mockSendAnnouncement = vi.fn();
// Every condition handed to a select (join and where), so a test can see which
// user and hackathon a query was scoped to even though the rows are canned.
const mockSelectConditions = vi.fn();

vi.mock("@query/auth/email", () => ({
  sendAnnouncementEmail: (...args: unknown[]) => mockSendAnnouncement(...args),
}));

vi.mock("@query/db", () => {
  const selectChain = () => {
    const node: any = {
      from: () => node,
      innerJoin: (...args: unknown[]) => {
        mockSelectConditions(...args);
        return node;
      },
      leftJoin: () => node,
      where: (...args: unknown[]) => {
        mockSelectConditions(...args);
        return node;
      },
      groupBy: () => node,
      orderBy: () => node,
      limit: () => Promise.resolve(mockSelectRows()),
      then: (ok: any, err: any) =>
        Promise.resolve(mockSelectRows()).then(ok, err),
    };
    return node;
  };

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

  return {
    db: {
      query: {
        admins: table("admins"),
        users: table("users"),
        hackathons: table("hackathons"),
        hackathonAnnouncements: table("hackathonAnnouncements"),
        hackathonAnnouncementRecipients: table(
          "hackathonAnnouncementRecipients",
        ),
        hackathonInterest: table("hackathonInterest"),
        members: table("members"),
        projectLeaders: table("projectLeaders"),
        judges: table("judges"),
      },
      select: selectChain,
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
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
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email" },
    hackathons: { id: "id", status: "status", isPublic: "is_public" },
    bootcampWorkshops: {
      id: "id",
      term: "term",
      week: "week",
      title: "title",
      materialsKey: "materials_key",
      materialsFileName: "materials_file_name",
      materialsSizeBytes: "materials_size_bytes",
      solutionKey: "solution_key",
      solutionFileName: "solution_file_name",
      solutionSizeBytes: "solution_size_bytes",
      recordingUrl: "recording_url",
      isPublished: "is_published",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    events: {
      id: "id",
      title: "title",
      qrCode: "qr_code",
      checkInEnabled: "check_in_enabled",
      eventDate: "event_date",
      currentCheckIns: "current_check_ins",
    },
    members: { userId: "user_id" },
    projectLeaders: { userId: "user_id", isActive: "is_active" },
    judges: { userId: "user_id", isActive: "is_active" },
    hackathonInterest: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
    },
    hackathonParticipants: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      registrationStatus: "registration_status",
    },
    hackathonAnnouncements: {
      id: "id",
      hackathonId: "hackathon_id",
      subject: "subject",
      heading: "heading",
      body: "body",
      ctaLabel: "cta_label",
      ctaUrl: "cta_url",
      audience: "audience",
      createdAt: "created_at",
    },
    hackathonAnnouncementRecipients: {
      id: "id",
      announcementId: "announcement_id",
      userId: "user_id",
      email: "email",
      sentAt: "sent_at",
      failedAt: "failed_at",
    },
  };
});

import { db } from "@query/db";
import { PgDialect } from "drizzle-orm/pg-core";

const HACK = "33333333-3333-4333-8333-333333333333";
const OTHER_HACK = "55555555-5555-4555-8555-555555555555";
const ANNOUNCEMENT = "44444444-4444-4444-8444-444444444444";
const ADMIN = "user_admin";
const VISITOR = "user_visitor";

// The bound values of every SQL condition a query was built with, for asserting
// what it was scoped to.
const boundValues = (calls: unknown[][]) =>
  calls
    .flat()
    .filter(
      (arg): arg is object =>
        !!arg && typeof arg === "object" && "queryChunks" in arg,
    )
    .flatMap((condition) => new PgDialect().sqlToQuery(condition as never).params);

const callerFor = (userId?: string) =>
  appRouter.createCaller({
    db,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never);

const asAdmin = (extra: (table: string) => unknown = () => undefined) =>
  mockFindFirst.mockImplementation((table: string) => {
    if (table === "admins") return { id: "ad_1", role: "admin", isActive: true };
    return extra(table);
  });

const compose = {
  hackathonId: HACK,
  audience: "interested" as const,
  subject: "Registration is open",
  heading: "Registration is open",
  body: "Applications close soon.",
};

describe("Announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockReset();
    mockFindMany.mockReset().mockReturnValue([]);
    mockInsert.mockReset().mockReturnValue([{ id: ANNOUNCEMENT }]);
    mockUpdate.mockReset().mockReturnValue([]);
    mockSelectRows.mockReset().mockReturnValue([]);
    mockSelectConditions.mockReset();
    mockSendAnnouncement.mockReset().mockResolvedValue(undefined);
    cache.clear();
  });

  describe("Composing", () => {
    it("freezes the audience into recipient rows and sends nothing", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([
        { userId: "u1", email: "ada@example.com" },
        { userId: "u2", email: "grace@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.createAnnouncement(compose);

      expect(res.totalRecipients).toBe(2);
      // Composing must not mail anyone: the batches are a separate call, which
      // is what makes the send resumable at all.
      expect(mockSendAnnouncement).not.toHaveBeenCalled();

      const recipientRows = mockInsert.mock.calls
        .map((c) => c[2]?.[0])
        .find((rows) => Array.isArray(rows)) as Record<string, unknown>[];
      expect(recipientRows).toHaveLength(2);
      expect(recipientRows[0]).toMatchObject({
        announcementId: ANNOUNCEMENT,
        email: "ada@example.com",
      });
    });

    it("deduplicates one person appearing twice in an audience", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([
        { userId: "u1", email: "ada@example.com" },
        { userId: "u1_other_row", email: "ada@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.createAnnouncement(compose);
      expect(res.totalRecipients).toBe(1);
    });

    // A button with a label and no link renders dead; a link with no label
    // renders nothing. Both are only visible once they are in an inbox.
    it("refuses half a call-to-action", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));

      await expect(
        callerFor(ADMIN).hackathon.createAnnouncement({
          ...compose,
          ctaLabel: "Apply now",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // The button is also a link on hackers' event pages, which only link a web
    // address; `.url()` alone passes these.
    it.each(["mailto:team@example.com", "data:text/html,hello"])(
      "refuses a button link that is not a web address (%s)",
      async (ctaUrl) => {
        asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));

        await expect(
          callerFor(ADMIN).hackathon.createAnnouncement({
            ...compose,
            ctaLabel: "Open",
            ctaUrl,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(mockInsert).not.toHaveBeenCalled();
      },
    );

    it("refuses an audience with nobody in it", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([]);

      await expect(
        callerFor(ADMIN).hackathon.createAnnouncement(compose),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("is refused to a caller who is not an admin", async () => {
      mockFindFirst.mockImplementation(() => undefined);

      await expect(
        callerFor(VISITOR).hackathon.createAnnouncement(compose),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    /**
     * Rejected and waitlisted applicants are excluded from every other
     * audience, which left nothing in the product able to reach them at all.
     * This audience exists to be chosen deliberately, for a message written
     * for it — so it must be selectable, and must not leak into the others.
     */
    it("accepts the not_accepted audience", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([
        { userId: "u1", email: "turned.down@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.createAnnouncement({
        ...compose,
        audience: "not_accepted",
        subject: "An update on your application",
      });

      expect(res.totalRecipients).toBe(1);
      const announcementRow = mockInsert.mock.calls
        .map((c) => c[2]?.[0])
        .find((row) => row && !Array.isArray(row) && "audience" in row);
      expect(announcementRow.audience).toBe("not_accepted");
    });

    /**
     * Waitlisted and rejected people need different messages — "no place for
     * you" is wrong for someone still in line — so each is selectable on its
     * own, not only through the combined not_accepted audience.
     */
    it.each(["waitlisted", "rejected"] as const)(
      "accepts the %s audience on its own",
      async (audience) => {
        asAdmin((table) =>
          table === "hackathons" ? { id: HACK } : undefined,
        );
        mockSelectRows.mockReturnValue([
          { userId: "u1", email: "applicant@example.com" },
        ]);

        const res = await callerFor(ADMIN).hackathon.createAnnouncement({
          ...compose,
          audience,
        });

        expect(res.totalRecipients).toBe(1);
        const announcementRow = mockInsert.mock.calls
          .map((c) => c[2]?.[0])
          .find((row) => row && !Array.isArray(row) && "audience" in row);
        expect(announcementRow.audience).toBe(audience);
      },
    );

    it("refuses an audience name that does not exist", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));

      await expect(
        callerFor(ADMIN).hackathon.createAnnouncement({
          ...compose,
          // @ts-expect-error deliberately not one of the seven audiences
          audience: "everyone",
        }),
      ).rejects.toBeDefined();
    });

  });

  describe("Sending in batches", () => {
    const announcement = {
      id: ANNOUNCEMENT,
      hackathonId: HACK,
      subject: "Registration is open",
      heading: "Registration is open",
      body: "Applications close soon.",
      ctaLabel: null,
      ctaUrl: null,
    };

    /**
     * The batch is CLAIMED with one atomic update before anything is sent —
     * two overlapping requests would otherwise both select the same
     * `sent_at IS NULL` rows and both mail them.
     */
    it("claims the batch, then marks every recipient as it sends", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockUpdate.mockReturnValueOnce([
        { id: "r1", email: "ada@example.com" },
        { id: "r2", email: "grace@example.com" },
      ]);
      mockSelectRows.mockReturnValue([{ count: 0 }]);

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res).toMatchObject({ sent: 2, remaining: 0, done: true });
      expect(mockSendAnnouncement).toHaveBeenCalledTimes(2);
      // One claim, then one stamp per recipient — stamping once at the end
      // would lose the resume marker for everyone already mailed.
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockUpdate.mock.calls[0]![2][0].claimedAt).toBeInstanceOf(Date);
      expect(mockUpdate.mock.calls[1]![2][0].sentAt).toBeInstanceOf(Date);
    });

    it("reports itself unfinished while recipients remain", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockUpdate.mockReturnValueOnce([{ id: "r1", email: "ada@example.com" }]);
      mockSelectRows.mockReturnValue([{ count: 499 }]);

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res.done).toBe(false);
      expect(res.remaining).toBe(499);
    });

    /**
     * A rejected address is marked failed, not sent: retried on every batch it
     * would stall the loop forever, and marked sent it would be indistinguishable
     * from a delivery.
     */
    it("records a rejected address separately from a delivered one", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockUpdate.mockReturnValueOnce([
        { id: "r1", email: "bounces@example.com" },
        { id: "r2", email: "grace@example.com" },
      ]);
      mockSelectRows.mockReturnValue([{ count: 0 }]);
      mockSendAnnouncement.mockRejectedValueOnce(new Error("550 rejected"));

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res.sent).toBe(1);
      expect(res.failed).toEqual(["bounces@example.com"]);
      const stamped = mockUpdate.mock.calls.slice(1).map((c) => c[2][0]);
      expect(stamped.some((row) => "failedAt" in row)).toBe(true);
      expect(stamped.some((row) => "sentAt" in row)).toBe(true);
    });

    // Reopening a finished send must not re-mail its audience.
    it("sends nothing when no recipient is pending", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockUpdate.mockReturnValue([]);
      mockSelectRows.mockReturnValue([{ count: 0 }]);

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res).toMatchObject({ sent: 0, done: true });
      expect(mockSendAnnouncement).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an announcement that does not exist", async () => {
      asAdmin();

      await expect(
        callerFor(ADMIN).hackathon.sendBatch({
          announcementId: ANNOUNCEMENT,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("In app only", () => {
    const recipientRowsOf = () =>
      mockInsert.mock.calls
        .map((c) => c[2]?.[0])
        .find((rows) => Array.isArray(rows)) as Record<string, unknown>[];

    /**
     * Recipient rows without `sentAt` are an unfinished send: the tab offers
     * "Resume sending" and sendBatch would email them. An in-app announcement
     * must be born delivered, or one click mails the whole audience.
     */
    it("writes recipients already delivered and sends nothing", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([
        { userId: "u1", email: "ada@example.com" },
        { userId: "u2", email: "grace@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.createAnnouncement({
        ...compose,
        inAppOnly: true,
      });

      expect(res).toMatchObject({ totalRecipients: 2, inAppOnly: true });
      expect(mockSendAnnouncement).not.toHaveBeenCalled();
      expect(recipientRowsOf()).toHaveLength(2);
      for (const row of recipientRowsOf()) {
        expect(row.sentAt).toBeInstanceOf(Date);
        // Every emailed row was claimed first, so an unclaimed delivered row
        // is how an in-app one is told apart.
        expect(row).not.toHaveProperty("claimedAt");
      }
    });

    it("leaves recipients pending for a normal announcement", async () => {
      asAdmin((table) => (table === "hackathons" ? { id: HACK } : undefined));
      mockSelectRows.mockReturnValue([
        { userId: "u1", email: "ada@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.createAnnouncement(compose);

      expect(res.inAppOnly).toBe(false);
      expect(recipientRowsOf()[0]).not.toHaveProperty("sentAt");
    });
  });

  /**
   * The hacker's own view of what organisers sent them. The audience was frozen
   * into recipient rows at compose time; this reads those rows and never
   * recomputes who should have received what. The rows themselves are canned
   * here, so what is asserted is what the query was scoped to.
   */
  describe("Announcements shown to a hacker", () => {
    const row = {
      subject: "Registration is open",
      heading: "Registration is open",
      body: "Applications close soon.",
      ctaLabel: "Apply now",
      ctaUrl: "https://datasciencegt.org/hacklytics",
      createdAt: new Date("2026-02-01T12:00:00Z"),
      deliveredAt: new Date("2026-02-01T12:05:00Z"),
    };

    it("is scoped to the caller and the requested hackathon", async () => {
      mockSelectRows.mockReturnValue([row]);

      await callerFor(VISITOR).hackathon.listForMe({ hackathonId: HACK });

      const bound = boundValues(mockSelectConditions.mock.calls);
      expect(bound).toContain(VISITOR);
      expect(bound).toContain(HACK);
      expect(bound).not.toContain(ADMIN);
    });

    // Another edition's announcements must not surface on this event's page.
    it("asks only for the hackathon it was given", async () => {
      await callerFor(VISITOR).hackathon.listForMe({ hackathonId: OTHER_HACK });

      const bound = boundValues(mockSelectConditions.mock.calls);
      expect(bound).toContain(OTHER_HACK);
      expect(bound).not.toContain(HACK);
    });

    it("returns the message and nothing about the send", async () => {
      mockSelectRows.mockReturnValue([row]);

      const res = await callerFor(VISITOR).hackathon.listForMe({
        hackathonId: HACK,
      });

      expect(res).toEqual([
        {
          subject: "Registration is open",
          heading: "Registration is open",
          body: "Applications close soon.",
          cta: {
            label: "Apply now",
            url: "https://datasciencegt.org/hacklytics",
          },
          sentAt: row.deliveredAt,
        },
      ]);
    });

    it("has no button when the announcement had none, and dates from composing when not yet emailed", async () => {
      mockSelectRows.mockReturnValue([
        { ...row, ctaLabel: null, ctaUrl: null, deliveredAt: null },
      ]);

      const [first] = await callerFor(VISITOR).hackathon.listForMe({
        hackathonId: HACK,
      });

      expect(first?.cta).toBeNull();
      expect(first?.sentAt).toEqual(row.createdAt);
    });

    it("is empty when nothing was addressed to the caller", async () => {
      const res = await callerFor(VISITOR).hackathon.listForMe({
        hackathonId: HACK,
      });

      expect(res).toEqual([]);
    });

    it("is refused to a signed-out caller", async () => {
      await expect(
        callerFor().hackathon.listForMe({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  /**
   * "Send test to me" puts the composed message in the organiser's own inbox.
   * It must reach nobody else and leave no trace: a recipient row would be a
   * pending send that "Resume sending" then mails to someone.
   */
  describe("Test send", () => {
    const message = {
      subject: "Registration is open",
      heading: "Registration is open",
      body: "Applications close soon.",
    };

    // The limiter is per user and lives for the process, so each test signs in
    // as somebody new.
    let organiser = 0;
    const nextOrganiser = () => `user_organiser_${++organiser}`;

    const asOrganiser = (email: string | null = "organiser@example.com") =>
      asAdmin((table) => (table === "users" ? { email } : undefined));

    it("sends to the caller's own address only, through the real send function", async () => {
      asOrganiser();
      const caller = nextOrganiser();

      const res = await callerFor(caller).hackathon.sendTestToMe({
        ...message,
        ctaLabel: "Apply now",
        ctaUrl: "https://datasciencegt.org/hacklytics",
      });

      expect(res).toEqual({ sentTo: "organiser@example.com" });
      expect(mockSendAnnouncement).toHaveBeenCalledTimes(1);
      expect(mockSendAnnouncement).toHaveBeenCalledWith({
        email: "organiser@example.com",
        subject: "[Test] Registration is open",
        heading: "Registration is open",
        body: "Applications close soon.",
        ctaLabel: "Apply now",
        ctaUrl: "https://datasciencegt.org/hacklytics",
      });

      // The address is looked up for the caller, not taken from the request.
      const lookup = mockFindFirst.mock.calls.find(([t]) => t === "users");
      expect(boundValues([[lookup?.[1]?.where]])).toContain(caller);
    });

    it("writes no announcement and no recipient rows", async () => {
      asOrganiser();

      await callerFor(nextOrganiser()).hackathon.sendTestToMe(message);

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSelectConditions).not.toHaveBeenCalled();
    });

    // The input has no place for an address; an extra key must not become one.
    it("ignores an address supplied in the request", async () => {
      asOrganiser();

      await callerFor(nextOrganiser()).hackathon.sendTestToMe({
        ...message,
        email: "victim@example.com",
      } as never);

      expect(mockSendAnnouncement).toHaveBeenCalledTimes(1);
      expect(mockSendAnnouncement.mock.calls[0]![0].email).toBe(
        "organiser@example.com",
      );
    });

    it("refuses half a call-to-action, as the real send does", async () => {
      asOrganiser();

      await expect(
        callerFor(nextOrganiser()).hackathon.sendTestToMe({
          ...message,
          ctaLabel: "Apply now",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockSendAnnouncement).not.toHaveBeenCalled();
    });

    it("is refused to a caller who is not an admin", async () => {
      mockFindFirst.mockImplementation(() => undefined);

      await expect(
        callerFor(VISITOR).hackathon.sendTestToMe(message),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockSendAnnouncement).not.toHaveBeenCalled();
    });

    it("refuses when the account has no email address", async () => {
      asOrganiser(null);

      await expect(
        callerFor(nextOrganiser()).hackathon.sendTestToMe(message),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockSendAnnouncement).not.toHaveBeenCalled();
    });

    it("reports a failed send without writing anything", async () => {
      asOrganiser();
      mockSendAnnouncement.mockRejectedValueOnce(new Error("550 rejected"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        callerFor(nextOrganiser()).hackathon.sendTestToMe(message),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

      logged.mockRestore();
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    // Three in a burst, then one every ten seconds: each is a real SMTP message.
    it("rate limits one organiser who keeps sending", async () => {
      asOrganiser();
      const caller = nextOrganiser();

      for (let i = 0; i < 3; i++) {
        await callerFor(caller).hackathon.sendTestToMe(message);
      }

      await expect(
        callerFor(caller).hackathon.sendTestToMe(message),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      expect(mockSendAnnouncement).toHaveBeenCalledTimes(3);

      // Somebody else is not held up by it.
      await callerFor(nextOrganiser()).hackathon.sendTestToMe(message);
      expect(mockSendAnnouncement).toHaveBeenCalledTimes(4);
    });
  });
});
