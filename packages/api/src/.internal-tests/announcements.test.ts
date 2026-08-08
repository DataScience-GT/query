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

vi.mock("@query/auth/email", () => ({
  sendAnnouncementEmail: (...args: unknown[]) => mockSendAnnouncement(...args),
}));

vi.mock("@query/db", () => {
  const selectChain = () => {
    const node: any = {
      from: () => node,
      innerJoin: () => node,
      leftJoin: () => node,
      where: () => node,
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

const HACK = "33333333-3333-4333-8333-333333333333";
const ANNOUNCEMENT = "44444444-4444-4444-8444-444444444444";
const ADMIN = "user_admin";
const VISITOR = "user_visitor";

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

    it("marks every recipient as it sends, one write each", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonAnnouncementRecipients"
          ? [
              { id: "r1", email: "ada@example.com" },
              { id: "r2", email: "grace@example.com" },
            ]
          : [],
      );
      mockSelectRows.mockReturnValue([{ count: 0 }]);

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res).toMatchObject({ sent: 2, remaining: 0, done: true });
      expect(mockSendAnnouncement).toHaveBeenCalledTimes(2);
      // Stamped per recipient rather than once at the end — that is the whole
      // resume marker.
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate.mock.calls[0]![2][0]).toHaveProperty("sentAt");
    });

    it("reports itself unfinished while recipients remain", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonAnnouncementRecipients"
          ? [{ id: "r1", email: "ada@example.com" }]
          : [],
      );
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
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonAnnouncementRecipients"
          ? [
              { id: "r1", email: "bounces@example.com" },
              { id: "r2", email: "grace@example.com" },
            ]
          : [],
      );
      mockSelectRows.mockReturnValue([{ count: 0 }]);
      mockSendAnnouncement.mockRejectedValueOnce(new Error("550 rejected"));

      const res = await callerFor(ADMIN).hackathon.sendBatch({
        announcementId: ANNOUNCEMENT,
      });

      expect(res.sent).toBe(1);
      expect(res.failed).toEqual(["bounces@example.com"]);
      const stamped = mockUpdate.mock.calls.map((c) => c[2][0]);
      expect(stamped.some((row) => "failedAt" in row)).toBe(true);
      expect(stamped.some((row) => "sentAt" in row)).toBe(true);
    });

    // Reopening a finished send must not re-mail its audience.
    it("sends nothing when no recipient is pending", async () => {
      asAdmin((table) =>
        table === "hackathonAnnouncements" ? announcement : undefined,
      );
      mockFindMany.mockReturnValue([]);
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
});
