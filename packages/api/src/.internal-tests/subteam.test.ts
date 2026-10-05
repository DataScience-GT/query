import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { subteams, subteamApplications } from "@query/db";

/**
 * Subteam applications: who may apply, what they must answer, and that review
 * belongs to staff alone — bug testers included only as readers.
 */

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSend = vi.fn();

/** Rows a `.select()` chain resolves to, keyed by the table in `.from()`. */
let onSelect: (table: unknown) => unknown[] = () => [];

vi.mock("@query/auth/email", () => ({
  sendSubteamApplicationEmail: (...args: unknown[]) => mockSend(...args),
}));

vi.mock("@query/db", async () => {
  const { createTransactionMock } = await import("./_db-tx-mock");

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: async () => [],
  });

  const selectChain = () => {
    let from: unknown;
    const rows = () => Promise.resolve(onSelectRef.current(from));
    const node: any = {
      from: (t: unknown) => ((from = t), node),
      innerJoin: () => node,
      where: () => node,
      orderBy: () => node,
      groupBy: () => rows(),
      limit: () => rows(),
      for: () => rows(),
      then: (ok: any, err: any) => rows().then(ok, err),
    };
    return node;
  };

  const writeResult = (val: unknown) =>
    Object.assign(Promise.resolve(val), {
      returning: vi.fn().mockResolvedValue(val),
    });

  return {
    db: {
      transaction: createTransactionMock({
        base: () => db,
        insert: (...a: any[]) => mockInsert(...a),
        update: (...a: any[]) => mockUpdate(...a),
        select: (...a: any[]) => onSelectRef.current(a[2]?.[0]),
      }),
      query: {
        admins: table("admins"),
        users: table("users"),
        members: table("members"),
        subteams: table("subteams"),
        subteamApplications: table("subteamApplications"),
      },
      select: selectChain,
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) =>
          writeResult(mockInsert("insert", insertArgs, valArgs)),
      }),
      update: (...updateArgs: any[]) => ({
        set: (...setArgs: any[]) => ({
          where: (...wArgs: any[]) =>
            writeResult(mockUpdate("update", updateArgs, setArgs, wArgs)),
        }),
      }),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email" },
    members: { userId: "user_id" },
    // Read at module scope by other routers that load with the root.
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
    events: { id: "id", eventDate: "event_date", location: "location" },
    subteams: {
      id: "id",
      name: "name",
      summary: "summary",
      description: "description",
      questions: "questions",
      isOpen: "is_open",
      archivedAt: "archived_at",
    },
    subteamApplications: {
      id: "id",
      subteamId: "subteam_id",
      userId: "user_id",
      status: "status",
      answers: "answers",
      note: "note",
      decisionNote: "decision_note",
      appliedAt: "applied_at",
      decidedAt: "decided_at",
    },
  };
});

// The mock factory is hoisted above `let onSelect`, so it may only close over a
// container it can read later — not the binding itself.
const onSelectRef = {
  get current() {
    return onSelect;
  },
};

import { db } from "@query/db";

const MEMBER = "user_member";
const OTHER = "user_other";
const ADMIN = "user_admin";
const SUBTEAM = "22222222-2222-4222-8222-222222222222";
const APPLICATION = "33333333-3333-4333-8333-333333333333";
const DAY = 24 * 60 * 60 * 1000;

const callerFor = (userId: string) =>
  appRouter.createCaller({
    db,
    session: { user: { id: userId } },
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: undefined,
  } as never);

const openSubteam = (overrides: Record<string, any> = {}) => ({
  id: SUBTEAM,
  name: "Events",
  summary: null,
  description: null,
  questions: [
    { id: "q_why", prompt: "Why events?", required: true },
    { id: "q_extra", prompt: "Anything else?", required: false },
  ],
  isOpen: true,
  archivedAt: null,
  createdById: ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const activeMember = {
  isActive: true,
  membershipEndDate: new Date(Date.now() + 30 * DAY),
};

/** Table-keyed lookups, so each test states only what differs. */
const lookups = (opts: {
  role?: string | null;
  subteam?: Record<string, any> | undefined;
  application?: Record<string, any> | undefined;
  member?: Record<string, any> | undefined;
}) => {
  const { role = null, subteam, application, member } = opts;
  mockFindFirst.mockImplementation((tableName: string) => {
    switch (tableName) {
      case "admins":
        return role
          ? { id: "ad_1", userId: ADMIN, role, isActive: true, expiresAt: null }
          : undefined;
      case "subteams":
        return subteam;
      case "subteamApplications":
        return application;
      case "members":
        return member;
      case "users":
        return { email: "someone@gatech.edu" };
      default:
        return undefined;
    }
  });
};

const insertedInto = (t: unknown) =>
  mockInsert.mock.calls.filter((c) => c[1]?.[0] === t);

/** Every literal a drizzle condition carries, found by walking the object. */
function mentions(node: unknown, wanted: string, seen = new Set<unknown>()) {
  if (node === wanted) return true;
  if (!node || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  return Object.values(node).some((child) => mentions(child, wanted, seen));
}

const answer = (text = "I ran three socials last year.") => [
  { questionId: "q_why", answer: text },
];

describe("Subteam applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockReset();
    mockInsert.mockReset().mockReturnValue([{ id: SUBTEAM }]);
    mockUpdate.mockReset().mockReturnValue([{ id: APPLICATION }]);
    mockSend.mockReset();
    onSelect = () => [];
    cache.clear();
  });

  // ===================================================================
  describe("1. Applying", () => {
    it("refuses somebody without a membership", async () => {
      lookups({ subteam: openSubteam(), member: undefined });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(insertedInto(subteamApplications)).toHaveLength(0);
    });

    it("refuses a membership that has lapsed", async () => {
      lookups({
        subteam: openSubteam(),
        member: {
          isActive: true,
          membershipEndDate: new Date(Date.now() - DAY),
        },
      });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets an active member apply, storing each answer with its prompt", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: [
            ...answer(),
            // A question that is not on the form is dropped, not stored loose.
            { questionId: "q_gone", answer: "stale" },
          ],
          note: "Free on Fridays.",
        }),
      ).resolves.toEqual({ status: "pending" });

      const [call] = insertedInto(subteamApplications);
      expect(call![2][0]).toMatchObject({
        subteamId: SUBTEAM,
        userId: MEMBER,
        status: "pending",
        note: "Free on Fridays.",
        answers: [
          {
            questionId: "q_why",
            prompt: "Why events?",
            answer: "I ran three socials last year.",
          },
        ],
      });
      // The receipt goes out after the write.
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ subteamName: "Events", outcome: "received" }),
      );
    });

    it("refuses a second application while the first is pending", async () => {
      lookups({
        subteam: openSubteam(),
        member: activeMember,
        application: { id: APPLICATION, status: "pending" },
      });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(insertedInto(subteamApplications)).toHaveLength(0);
    });

    it("turns a lost race on the unique index into CONFLICT, not a 500", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });
      mockInsert.mockImplementation(() => {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe("2. Required answers", () => {
    it("refuses an application missing a required answer", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: [{ questionId: "q_extra", answer: "Only the optional one" }],
        }),
      ).rejects.toThrow(/"Why events\?" needs an answer/);
      expect(insertedInto(subteamApplications)).toHaveLength(0);
    });

    it("treats a whitespace-only answer as missing", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer("   "),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses an answer over the length limit", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer("x".repeat(2001)),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("lets an optional question go unanswered", async () => {
      lookups({ subteam: openSubteam(), member: activeMember });

      await callerFor(MEMBER).subteam.requestToJoin({
        subteamId: SUBTEAM,
        answers: answer(),
      });

      const [call] = insertedInto(subteamApplications);
      expect(call![2][0].answers).toHaveLength(1);
    });
  });

  // ===================================================================
  describe("3. Closed and archived subteams", () => {
    it("refuses an application to a closed subteam", async () => {
      lookups({
        subteam: openSubteam({ isOpen: false }),
        member: activeMember,
      });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toThrow(/not taking applications/);
      expect(insertedInto(subteamApplications)).toHaveLength(0);
    });

    it("answers an archived subteam like a made-up id", async () => {
      lookups({
        subteam: openSubteam({ archivedAt: new Date() }),
        member: activeMember,
      });

      await expect(
        callerFor(MEMBER).subteam.requestToJoin({
          subteamId: SUBTEAM,
          answers: answer(),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(insertedInto(subteamApplications)).toHaveLength(0);
    });
  });

  // ===================================================================
  describe("4. Withdrawing", () => {
    it("scopes the withdrawal to the caller's own pending application", async () => {
      lookups({});

      await expect(
        callerFor(MEMBER).subteam.withdraw({ applicationId: APPLICATION }),
      ).resolves.toEqual({ withdrawn: true });

      const [call] = mockUpdate.mock.calls;
      expect(call![2][0]).toMatchObject({ status: "withdrawn" });
      const where = call![3][0];
      expect(mentions(where, MEMBER)).toBe(true);
      expect(mentions(where, "pending")).toBe(true);
    });

    it("refuses when nothing of theirs is pending — someone else's, or decided", async () => {
      lookups({});
      // The WHERE matched no row: the id belongs to another member, or an admin
      // already decided on it.
      mockUpdate.mockReturnValue([]);

      await expect(
        callerFor(OTHER).subteam.withdraw({ applicationId: APPLICATION }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===================================================================
  describe("5. Review is staff-only", () => {
    it("refuses a member every admin procedure", async () => {
      lookups({ role: null, subteam: openSubteam() });
      const caller = callerFor(MEMBER);

      await expect(caller.subteam.adminList()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.subteam.create({ name: "Marketing" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.subteam.decide({
          applicationId: APPLICATION,
          decision: "accepted",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("refuses a volunteer, who holds an admins row but is not staff", async () => {
      lookups({ role: "volunteer" });

      await expect(
        callerFor(ADMIN).subteam.create({ name: "Marketing" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets an admin create a subteam and names its new questions", async () => {
      lookups({ role: "admin" });

      await callerFor(ADMIN).subteam.create({
        name: "Marketing",
        questions: [
          { prompt: "Show us something you made", required: true },
          { id: "keep_me", prompt: "Portfolio link", required: false },
        ],
      });

      const [call] = insertedInto(subteams);
      const values = call![2][0];
      // Closed until somebody opens it.
      expect(values).toMatchObject({ name: "Marketing", isOpen: false });
      expect(values.questions[0].id).toEqual(expect.any(String));
      expect(values.questions[1].id).toBe("keep_me");
    });

    it("accepts a pending application and tells the applicant", async () => {
      lookups({
        role: "admin",
        subteam: openSubteam(),
        application: {
          id: APPLICATION,
          subteamId: SUBTEAM,
          userId: MEMBER,
          status: "pending",
        },
      });

      await expect(
        callerFor(ADMIN).subteam.decide({
          applicationId: APPLICATION,
          decision: "accepted",
          note: "Welcome aboard.",
        }),
      ).resolves.toEqual({ status: "accepted" });

      expect(mockUpdate.mock.calls[0]![2][0]).toMatchObject({
        status: "accepted",
        decidedById: ADMIN,
        decisionNote: "Welcome aboard.",
      });
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "accepted",
          note: "Welcome aboard.",
        }),
      );
    });

    it("refuses to decide twice", async () => {
      lookups({
        role: "admin",
        subteam: openSubteam(),
        application: {
          id: APPLICATION,
          subteamId: SUBTEAM,
          userId: MEMBER,
          status: "rejected",
        },
      });

      await expect(
        callerFor(ADMIN).subteam.decide({
          applicationId: APPLICATION,
          decision: "accepted",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("removes a roster member as a status, keeping the row", async () => {
      lookups({ role: "admin" });

      await callerFor(ADMIN).subteam.removeMember({
        applicationId: APPLICATION,
      });

      const [call] = mockUpdate.mock.calls;
      expect(call![2][0]).toMatchObject({ status: "removed" });
      expect(mentions(call![3][0], "accepted")).toBe(true);
    });
  });

  // ===================================================================
  describe("6. Bug testers read, never write", () => {
    it("lets a bug tester list subteams and applicants", async () => {
      lookups({ role: "bug_tester" });
      onSelect = (t) => (t === subteams ? [openSubteam()] : []);
      const caller = callerFor(ADMIN);

      await expect(caller.subteam.adminList()).resolves.toHaveLength(1);
      await expect(
        caller.subteam.applicants({ subteamId: SUBTEAM, status: "pending" }),
      ).resolves.toMatchObject({ applicants: [] });
      await expect(
        caller.subteam.roster({ subteamId: SUBTEAM }),
      ).resolves.toEqual([]);
    });

    it("refuses a bug tester every mutation, writing nothing", async () => {
      lookups({
        role: "bug_tester",
        subteam: openSubteam(),
        application: { id: APPLICATION, subteamId: SUBTEAM, status: "pending" },
      });
      const caller = callerFor(ADMIN);

      await expect(
        caller.subteam.create({ name: "Marketing" }),
      ).rejects.toThrow(/read-only/);
      await expect(
        caller.subteam.update({ id: SUBTEAM, name: "Events" }),
      ).rejects.toThrow(/read-only/);
      await expect(
        caller.subteam.setArchived({ id: SUBTEAM, archived: true }),
      ).rejects.toThrow(/read-only/);
      await expect(
        caller.subteam.decide({
          applicationId: APPLICATION,
          decision: "rejected",
        }),
      ).rejects.toThrow(/read-only/);
      await expect(
        caller.subteam.removeMember({ applicationId: APPLICATION }),
      ).rejects.toThrow(/read-only/);

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
