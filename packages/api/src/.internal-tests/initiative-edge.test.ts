import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import {
  initiatives,
  initiativeApplications,
  projectLeaders,
} from "@query/db";

/**
 * Club initiatives: the leader role, the ownership gate, and the join flow.
 *
 * The half of the platform that is deliberately NOT scoped to a hackathon
 * edition, so a good third of what is asserted here is that an edition — or the
 * absence of one — changes nothing.
 */

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

/**
 * Rows a `.select()` chain resolves to, keyed by the table in `.from()`.
 * Every terminal on the chain funnels through it, so a test steers the seat
 * count and the list queries by table rather than by call order.
 */
let onSelect: (table: unknown) => unknown[] = () => [];

vi.mock("@query/db", async () => {
  const { createTransactionMock } = await import("./_db-tx-mock");

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: async () => [],
  });

  // Mirrors drizzle's builder closely enough for the chains this router uses:
  // .from().innerJoin().where().orderBy().limit(), .where().groupBy(), an
  // awaited .where(), and .where().for("update").
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
        hackathons: table("hackathons"),
        members: table("members"),
        projectLeaders: table("projectLeaders"),
        initiatives: table("initiatives"),
        initiativeApplications: table("initiativeApplications"),
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
      delete: (...deleteArgs: any[]) => ({
        where: (...wArgs: any[]) => {
          const val = mockDelete("delete", deleteArgs, wArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
          });
        },
      }),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email", image: "image" },
    hackathons: { id: "id", status: "status", startDate: "start_date", endDate: "end_date" },
    members: { userId: "user_id", hackathonId: "hackathon_id" },
    projectLeaders: {
      id: "id",
      userId: "user_id",
      isActive: "is_active",
      createdAt: "created_at",
    },
    initiatives: {
      id: "id",
      leaderUserId: "leader_user_id",
      title: "title",
      summary: "summary",
      description: "description",
      commitment: "commitment",
      status: "status",
      maxMembers: "max_members",
      archivedAt: "archived_at",
      reviewedAt: "reviewed_at",
      reviewNote: "review_note",
      createdAt: "created_at",
    },
    initiativeApplications: {
      id: "id",
      initiativeId: "initiative_id",
      userId: "user_id",
      status: "status",
      pitch: "pitch",
      appliedAt: "applied_at",
      decidedAt: "decided_at",
    },
  };
});

// The mock factory is hoisted above `let onSelect`, so it may only close over a
// container it can read later — not the binding itself.
const onSelectRef = { get current() { return onSelect; } };

import { db } from "@query/db";

const LEADER = "user_leader";
const OTHER_LEADER = "user_other_leader";
const MEMBER = "user_member";
const ADMIN = "user_admin";
const INITIATIVE = "11111111-1111-4111-8111-111111111111";
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

/** An initiative open to applications, led by LEADER. */
const openInitiative = (overrides: Record<string, any> = {}) => ({
  id: INITIATIVE,
  leaderUserId: LEADER,
  title: "Sensor Net",
  summary: null,
  description: null,
  commitment: null,
  status: "open",
  maxMembers: 3,
  archivedAt: null,
  reviewedAt: null,
  reviewedById: null,
  reviewNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Table-keyed lookups. `who` decides the leader/admin/member answers, so each
 * test states who is calling rather than restating the whole fixture.
 */
const lookups = (opts: {
  isLeader?: string | null;
  isAdmin?: string | null;
  initiative?: Record<string, any> | undefined;
  application?: Record<string, any> | undefined;
  member?: Record<string, any> | undefined;
  hackathon?: Record<string, any> | undefined;
}) => {
  const {
    isLeader = null,
    isAdmin = null,
    initiative,
    application,
    member,
    hackathon = { id: "hack_1" },
  } = opts;

  mockFindFirst.mockImplementation((tableName: string, args?: any) => {
    switch (tableName) {
      case "projectLeaders":
        return isLeader ? { id: "pl_1", userId: isLeader, isActive: true } : undefined;
      case "admins":
        return isAdmin ? { id: "ad_1", userId: isAdmin, role: "admin", isActive: true } : undefined;
      case "hackathons":
        return hackathon;
      case "initiatives":
        return initiative;
      case "initiativeApplications":
        return application;
      case "members":
        return member;
      case "users":
        return { id: (args?.where && "id") || "id" };
      default:
        return undefined;
    }
  });
};

/** A membership that has not run out — what applying requires. */
const activeMember = { isActive: true, membershipEndDate: new Date(Date.now() + 30 * DAY) };

const insertedInto = (t: unknown) =>
  mockInsert.mock.calls.filter((c) => c[1]?.[0] === t);

describe("Club initiatives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockReset();
    mockInsert.mockReset().mockReturnValue([{ id: INITIATIVE }]);
    mockUpdate.mockReset().mockReturnValue([{ id: INITIATIVE, status: "open" }]);
    mockDelete.mockReset().mockReturnValue([]);
    onSelect = () => [];
    cache.clear();
  });

  // ===================================================================
  describe("1. The leader role is not an edition", () => {
    it("lets a leader in when no hackathon exists at all", async () => {
      // The gate used to resolve the current edition first and throw NOT_FOUND
      // when there was none, so a club with no event on the calendar had no
      // project leaders — every leader screen 404'd out of season.
      lookups({ isLeader: LEADER, hackathon: undefined });

      await expect(callerFor(LEADER).initiative.listMine()).resolves.toEqual([]);
    });

    it("refuses somebody who holds no leader row", async () => {
      lookups({ isLeader: null });

      await expect(callerFor(MEMBER).initiative.listMine()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("lets an admin cover for a leader without a leader row", async () => {
      lookups({ isLeader: null, isAdmin: ADMIN });

      await expect(callerFor(ADMIN).initiative.listMine()).resolves.toEqual([]);
    });
  });

  // ===================================================================
  describe("2. Ownership", () => {
    it("hides another leader's initiative behind NOT_FOUND, not FORBIDDEN", async () => {
      // FORBIDDEN would confirm the id exists, which is the one thing guessing
      // ids is good for.
      lookups({
        isLeader: OTHER_LEADER,
        initiative: openInitiative({ leaderUserId: LEADER }),
      });

      await expect(
        callerFor(OTHER_LEADER).initiative.getById({ id: INITIATIVE }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lets the leader who owns it through", async () => {
      lookups({ isLeader: LEADER, initiative: openInitiative() });
      onSelect = () => [];

      const res = await callerFor(LEADER).initiative.getById({ id: INITIATIVE });
      expect(res.initiative.id).toBe(INITIATIVE);
    });

    it("lets an admin through to somebody else's initiative", async () => {
      lookups({ isAdmin: ADMIN, initiative: openInitiative() });

      const res = await callerFor(ADMIN).initiative.getById({ id: INITIATIVE });
      expect(res.initiative.id).toBe(INITIATIVE);
    });

    it("refuses to edit another leader's initiative", async () => {
      lookups({
        isLeader: OTHER_LEADER,
        initiative: openInitiative({ leaderUserId: LEADER }),
      });

      await expect(
        callerFor(OTHER_LEADER).initiative.update({
          id: INITIATIVE,
          title: "Hijacked",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe("3. Creating on somebody's behalf", () => {
    it("refuses an admin who names nobody", async () => {
      // Defaulting the leader to the caller stored the ADMIN as leader and put
      // their name in front of members.
      lookups({ isLeader: null, isAdmin: ADMIN });

      await expect(
        callerFor(ADMIN).initiative.create({ title: "Sensor Net" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses naming somebody who is not a leader", async () => {
      mockFindFirst.mockImplementation((tableName: string) => {
        if (tableName === "admins") return { id: "ad_1", role: "admin", isActive: true };
        if (tableName === "hackathons") return { id: "hack_1" };
        // No projectLeaders row for the named user.
        return undefined;
      });

      await expect(
        callerFor(ADMIN).initiative.create({
          title: "Sensor Net",
          leaderUserId: MEMBER,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses a non-admin leader creating for someone else", async () => {
      lookups({ isLeader: LEADER });

      await expect(
        callerFor(LEADER).initiative.create({
          title: "Sensor Net",
          leaderUserId: OTHER_LEADER,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("creates as a draft so nothing reaches members unopened", async () => {
      lookups({ isLeader: LEADER });

      await callerFor(LEADER).initiative.create({ title: "Sensor Net" });

      const [call] = insertedInto(initiatives);
      expect(call).toBeDefined();
      expect(call![2][0]).toMatchObject({
        leaderUserId: LEADER,
        status: "draft",
        // Leader plus three accepted members is a team of four.
        maxMembers: 3,
      });
      // The column is gone; writing one would be a schema error in production.
      expect(call![2][0]).not.toHaveProperty("hackathonId");
    });

    it("leaves an initiative uncapped when the leader clears the cap", async () => {
      lookups({ isLeader: LEADER });

      await callerFor(LEADER).initiative.create({
        title: "Reading group",
        maxMembers: null,
      });

      const [call] = insertedInto(initiatives);
      expect(call![2][0].maxMembers).toBeNull();
    });
  });

  // ===================================================================
  describe("4. Applying", () => {
    it("needs a membership that has not lapsed", async () => {
      lookups({
        initiative: openInitiative(),
        member: { isActive: true, membershipEndDate: new Date(Date.now() - DAY) },
      });

      await expect(
        callerFor(MEMBER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it.each(["draft", "proposed", "declined"])(
      "answers a %s initiative exactly like a made-up id",
      async (status) => {
        // BAD_REQUEST here would tell a stranger that somebody pitched this.
        lookups({
          initiative: openInitiative({ status }),
          member: activeMember,
        });

        await expect(
          callerFor(MEMBER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      },
    );

    it("answers an archived initiative the same way", async () => {
      lookups({
        initiative: openInitiative({ archivedAt: new Date() }),
        member: activeMember,
      });

      await expect(
        callerFor(MEMBER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses the leader applying to their own initiative", async () => {
      lookups({ initiative: openInitiative(), member: activeMember });

      await expect(
        callerFor(LEADER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses when every seat is taken", async () => {
      lookups({
        initiative: openInitiative({ maxMembers: 3 }),
        member: activeMember,
      });
      onSelect = (t) => (t === initiativeApplications ? [{ taken: 3 }] : []);

      await expect(
        callerFor(MEMBER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("tells a repeat applicant where they stand instead of counting them twice", async () => {
      lookups({
        initiative: openInitiative(),
        application: { id: "app_1", status: "pending" },
        member: activeMember,
      });

      await expect(
        callerFor(MEMBER).initiative.requestToJoin({ initiativeId: INITIATIVE }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("reuses the row when somebody who withdrew applies again", async () => {
      // The unique index still holds that row, so a second insert would collide.
      lookups({
        initiative: openInitiative(),
        application: { id: "app_1", status: "withdrawn" },
        member: activeMember,
      });
      onSelect = (t) => (t === initiativeApplications ? [{ taken: 0 }] : []);

      const res = await callerFor(MEMBER).initiative.requestToJoin({
        initiativeId: INITIATIVE,
      });

      expect(res.status).toBe("pending");
      expect(insertedInto(initiativeApplications)).toHaveLength(0);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe("5. Deciding", () => {
    it("refuses to decide on somebody who withdrew", async () => {
      lookups({
        isLeader: LEADER,
        initiative: openInitiative(),
        application: { id: "app_1", status: "withdrawn" },
      });

      await expect(
        callerFor(LEADER).initiative.decide({
          initiativeId: INITIATIVE,
          userId: MEMBER,
          decision: "accepted",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("makes a repeat of the same decision a no-op", async () => {
      // Two officers on the same queue must not restamp decidedAt.
      lookups({
        isLeader: LEADER,
        initiative: openInitiative(),
        application: { id: "app_1", status: "accepted" },
      });

      const res = await callerFor(LEADER).initiative.decide({
        initiativeId: INITIATIVE,
        userId: MEMBER,
        decision: "accepted",
      });

      expect(res.status).toBe("accepted");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("refuses an acceptance that would exceed the cap", async () => {
      lookups({
        isLeader: LEADER,
        initiative: openInitiative({ maxMembers: 3 }),
        application: { id: "app_1", status: "pending" },
      });
      onSelect = (t) => (t === initiativeApplications ? [{ taken: 3 }] : []);

      await expect(
        callerFor(LEADER).initiative.decide({
          initiativeId: INITIATIVE,
          userId: MEMBER,
          decision: "accepted",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("lets a rejection through when the initiative is full", async () => {
      // A full initiative can still say no — the cap only bounds acceptances.
      lookups({
        isLeader: LEADER,
        initiative: openInitiative({ maxMembers: 3 }),
        application: { id: "app_1", status: "pending" },
      });
      onSelect = (t) => (t === initiativeApplications ? [{ taken: 3 }] : []);

      const res = await callerFor(LEADER).initiative.decide({
        initiativeId: INITIATIVE,
        userId: MEMBER,
        decision: "rejected",
      });
      expect(res.status).toBe("rejected");
    });

    it("refuses a leader deciding on another leader's applicant", async () => {
      lookups({
        isLeader: OTHER_LEADER,
        initiative: openInitiative({ leaderUserId: LEADER }),
        application: { id: "app_1", status: "pending" },
      });

      await expect(
        callerFor(OTHER_LEADER).initiative.decide({
          initiativeId: INITIATIVE,
          userId: MEMBER,
          decision: "accepted",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===================================================================
  describe("6. Proposals", () => {
    it("caps a member at three waiting proposals", async () => {
      lookups({ member: activeMember });
      onSelect = (t) => (t === initiatives ? [{ total: 3 }] : []);

      await expect(
        callerFor(MEMBER).initiative.propose({ title: "Sensor Net" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("files the proposal as the row itself, proposer as leader", async () => {
      lookups({ member: activeMember });
      onSelect = (t) => (t === initiatives ? [{ total: 0 }] : []);

      await callerFor(MEMBER).initiative.propose({ title: "Sensor Net" });

      const [call] = insertedInto(initiatives);
      expect(call![2][0]).toMatchObject({
        leaderUserId: MEMBER,
        status: "proposed",
      });
    });

    it("needs an active membership to propose", async () => {
      lookups({ member: undefined });

      await expect(
        callerFor(MEMBER).initiative.propose({ title: "Sensor Net" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses to withdraw a proposal that was already reviewed", async () => {
      // The delete is scoped to status = proposed, so an approved one matches
      // no row and the caller is told why rather than told it worked.
      lookups({});
      mockDelete.mockReturnValue([]);

      await expect(
        callerFor(MEMBER).initiative.withdrawProposal({ id: INITIATIVE }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===================================================================
  describe("7. Approving a proposal", () => {
    it("grants the leader role without an edition on it", async () => {
      mockFindFirst.mockImplementation((tableName: string) => {
        if (tableName === "admins") return { id: "ad_1", role: "admin", isActive: true };
        if (tableName === "hackathons") return { id: "hack_1" };
        if (tableName === "initiatives")
          return openInitiative({ status: "proposed", leaderUserId: MEMBER });
        if (tableName === "projectLeaders") return undefined;
        return undefined;
      });

      await callerFor(ADMIN).initiative.reviewProposal({
        id: INITIATIVE,
        decision: "approve",
      });

      const [call] = insertedInto(projectLeaders);
      expect(call).toBeDefined();
      expect(call![2][0]).toMatchObject({ userId: MEMBER, isActive: true });
      expect(call![2][0]).not.toHaveProperty("hackathonId");
    });

    it("restores a revoked role rather than colliding with the unique index", async () => {
      mockFindFirst.mockImplementation((tableName: string) => {
        if (tableName === "admins") return { id: "ad_1", role: "admin", isActive: true };
        if (tableName === "hackathons") return { id: "hack_1" };
        if (tableName === "initiatives")
          return openInitiative({ status: "proposed", leaderUserId: MEMBER });
        if (tableName === "projectLeaders")
          return { id: "pl_1", userId: MEMBER, isActive: false };
        return undefined;
      });

      await callerFor(ADMIN).initiative.reviewProposal({
        id: INITIATIVE,
        decision: "approve",
      });

      expect(insertedInto(projectLeaders)).toHaveLength(0);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("refuses to review the same proposal twice", async () => {
      mockFindFirst.mockImplementation((tableName: string) => {
        if (tableName === "admins") return { id: "ad_1", role: "admin", isActive: true };
        if (tableName === "hackathons") return { id: "hack_1" };
        if (tableName === "initiatives") return openInitiative({ status: "draft" });
        return undefined;
      });

      await expect(
        callerFor(ADMIN).initiative.reviewProposal({
          id: INITIATIVE,
          decision: "approve",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ===================================================================
  describe("8. Status and archiving", () => {
    it("refuses a status change while archived", async () => {
      lookups({
        isLeader: LEADER,
        initiative: openInitiative({ archivedAt: new Date() }),
      });

      await expect(
        callerFor(LEADER).initiative.setStatus({ id: INITIATIVE, status: "open" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("shuts the door when archiving", async () => {
      lookups({ isLeader: LEADER, initiative: openInitiative() });

      await callerFor(LEADER).initiative.setArchived({
        id: INITIATIVE,
        archived: true,
      });

      const [, , setArgs] = mockUpdate.mock.calls[0]!;
      expect(setArgs[0]).toMatchObject({ status: "closed" });
      expect(setArgs[0].archivedAt).toBeInstanceOf(Date);
    });
  });
});
