import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db, events, eventCheckIns, hackathonEventAttendees } from "@query/db";
import { __onRollback } from "./_db-tx-mock";

/**
 * QR / scanner check-in paths: club-event door QRs (events.checkIn) and
 * hackathon participant passes (hackathon.scanParticipantPass).
 *
 * Tests marked `it.skip` are regression tests for defects that exist in the
 * product today. Each one carries a BUG note naming the file and line, and each
 * asserts the correct behaviour — un-skipping is how a fix gets verified.
 */

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();

vi.mock("@query/db", async () => {
  const { createTransactionMock } = await import("./_db-tx-mock");

  /**
   * Applies a relational query's `columns` allow-list, recursing through
   * `with`. Drizzle enforces this in SQL and a mock would otherwise ignore it
   * entirely, leaving every "this field must not be public" rule untestable —
   * including the ones that restrict a nested relation rather than the top-level
   * row, which is where most rosters leak.
   */
  const needsProjection = (config: any): boolean =>
    !!config &&
    typeof config === "object" &&
    (!!config.columns ||
      Object.values(config.with ?? {}).some(needsProjection));

  const project = (row: any, config: any): any => {
    if (!needsProjection(config) || !row || typeof row !== "object") return row;

    const columns = config.columns as Record<string, boolean> | undefined;
    const relations = (config.with ?? {}) as Record<string, unknown>;
    const only = columns ? Object.keys(columns).filter((k) => columns[k]) : [];
    const omit = columns
      ? Object.keys(columns).filter((k) => columns[k] === false)
      : [];

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key in relations) {
        const child = relations[key];
        out[key] = Array.isArray(value)
          ? value.map((v) => project(v, child))
          : project(value, child);
        continue;
      }
      if (!columns) {
        out[key] = value;
        continue;
      }
      if (only.length ? only.includes(key) : !omit.includes(key))
        out[key] = value;
    }
    return out;
  };

  // Fixtures come back both directly and as promises (tests use a delayed
  // resolve to force interleaving); the allow-list applies either way.
  const settle = (value: any, map: (v: any) => any) =>
    value && typeof value.then === "function" ? value.then(map) : map(value);

  const table = (name: string) => ({
    findFirst: (...args: any[]) =>
      settle(mockFindFirst(name, ...args), (v) => project(v, args[0])),
    findMany: (...args: any[]) =>
      settle(mockFindMany(name, ...args), (v) =>
        Array.isArray(v) ? v.map((row) => project(row, args[0])) : v,
      ),
  });

  return {
    db: {
      // Every hook is wrapped rather than passed by reference: the factory is
      // hoisted above the `const mock*` declarations, so it may only close over
      // them, never read them.
      transaction: createTransactionMock({
        base: () => db,
        update: (...a: any[]) => mockUpdate(...a),
        insert: (...a: any[]) => mockInsert(...a),
        select: (...a: any[]) => mockSelect(...a),
      }),
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
      },
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
            onConflictDoUpdate: vi.fn().mockImplementation(() => ({
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
        from: vi.fn().mockImplementation(() => ({
          // `.for("update")` row-locks before a recount, so the where node has
          // to stay chainable as well as awaitable.
          where: vi.fn().mockImplementation(() =>
            Object.assign(Promise.resolve([{ count: 0 }]), {
              for: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          ),
        })),
      })),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", email: "email" },
    userProfiles: { userId: "user_id" },
    hackathons: { id: "id", name: "name", status: "status" },
    hackathonParticipants: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      registrationStatus: "registration_status",
    },
    hackathonTeams: { id: "id", hackathonId: "hackathon_id" },
    hackathonProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      teamId: "team_id",
      submittedById: "submitted_by_id",
      status: "status",
      submittedAt: "submitted_at",
    },
    hackathonEvents: {
      id: "id",
      hackathonId: "hackathon_id",
      name: "name",
      startTime: "start_time",
      endTime: "end_time",
    },
    hackathonEventAttendees: {
      eventId: "event_id",
      participantId: "participant_id",
    },
    members: { id: "id", userId: "user_id", hackathonId: "hackathon_id" },
    events: {
      id: "id",
      title: "title",
      qrCode: "qr_code",
      checkInEnabled: "check_in_enabled",
      eventDate: "event_date",
      currentCheckIns: "current_check_ins",
    },
    eventCheckIns: { id: "id", eventId: "event_id", userId: "user_id" },
  };
});

const HACK_A = "aaaaaaaa-1111-4111-8111-111111111111";
const HACK_B = "bbbbbbbb-2222-4222-8222-222222222222";
const PARTICIPANT = "cccccccc-3333-4333-8333-333333333333";
const PARTICIPANT_B = "cccccccc-4444-4444-8444-444444444444";
const PARTICIPANT_C = "cccccccc-5555-4555-8555-555555555555";
const HACK_EVENT = "dddddddd-6666-4666-8666-666666666666";
const CLUB_EVENT = "eeeeeeee-7777-4777-8777-777777777777";
const QR_OLD = "ffffffff-8888-4888-8888-888888888888";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Pulls every raw string out of a drizzle where-clause so a mock can behave
 *  like a real row filter instead of answering every query identically. */
const whereStrings = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) whereStrings(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) whereStrings(obj.queryChunks, out);
    else if (obj.value !== undefined) whereStrings(obj.value, out);
  }
  return out;
};
const sqlHas = (node: unknown, value: string) =>
  whereStrings(node).includes(value);
const whereHas = (args: any, value: string) => sqlHas(args?.where, value);

/** Forces real interleaving between two in-flight callers. */
const io = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 5));

describe("QR check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    // Aggregate reads default to "nothing there"; the concurrency tests below
    // override this to hand back the live row a FOR UPDATE would have locked.
    mockSelect.mockReturnValue([{ count: 0 }]);
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

  const ADMIN_ROW = {
    userId: "admin_user_id",
    isActive: true,
    role: "admin",
  };

  const clubEvent = (overrides: Record<string, unknown> = {}) => ({
    id: CLUB_EVENT,
    title: "General Meeting",
    qrCode: QR_OLD,
    checkInEnabled: true,
    eventDate: new Date(),
    currentCheckIns: 0,
    maxCheckIns: null as number | null,
    pointsValue: 10,
    ...overrides,
  });

  // A membership belongs to a hackathon edition and carries an end date; the
  // door checks both, exactly as member.checkStatus does.
  const activeMember = {
    id: "member_1",
    userId: "member_user",
    hackathonId: HACK_A,
    isActive: true,
    membershipEndDate: new Date(Date.now() + 90 * DAY),
  };

  // -------------------------------------------------------------------
  describe("Club event door QR", () => {
    it("turns a lapsed member away and records nothing", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "events") return clubEvent();
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return { ...activeMember, isActive: false };
        return undefined;
      });
      const caller = appRouter.createCaller(createMockCtx("lapsed_user"));

      const err: any = await caller.events
        .checkIn({ qrCode: QR_OLD })
        .catch((e: unknown) => e);

      expect(err.code).toBe("FORBIDDEN");
      expect(err.message).toMatch(/membership is not active/);
      // No attendance row, no capacity counter movement.
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("kills the old poster the moment an admin rotates the QR", async () => {
      const row = clubEvent();
      mockFindFirst.mockImplementation((table: string, args: any) => {
        if (table === "admins") return ADMIN_ROW;
        // Only the code currently stored on the row resolves to the event.
        if (table === "events")
          return whereHas(args, row.qrCode) ? { ...row } : undefined;
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return activeMember;
        return undefined;
      });
      mockUpdate.mockImplementation((_op, updateArgs, setArgs) => {
        if (updateArgs[0] === events && typeof setArgs[0].qrCode === "string") {
          row.qrCode = setArgs[0].qrCode;
        }
        return [{ ...row }];
      });
      mockInsert.mockReturnValue([{ id: "checkin_1" }]);

      const admin = appRouter.createCaller(createMockCtx("admin_user_id"));
      const rotated = await admin.events.regenerateQR({ eventId: CLUB_EVENT });

      expect(rotated.qrCode).not.toBe(QR_OLD);

      const member = appRouter.createCaller(createMockCtx("member_user"));
      const leaked: any = await member.events
        .checkIn({ qrCode: QR_OLD })
        .catch((e: unknown) => e);

      expect(leaked.code).toBe("NOT_FOUND");
      expect(leaked.message).toMatch(/Invalid QR code/);

      const fresh = await member.events.checkIn({ qrCode: rotated.qrCode });
      expect(fresh).toMatchObject({ success: true });
    });

    it("closes the door for scanners and for the public list in one toggle", async () => {
      const row = clubEvent();
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "events") return { ...row };
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return activeMember;
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "events" ? [{ ...row }] : [],
      );
      mockUpdate.mockImplementation((_op, updateArgs, setArgs) => {
        if (
          updateArgs[0] === events &&
          typeof setArgs[0].checkInEnabled === "boolean"
        ) {
          row.checkInEnabled = setArgs[0].checkInEnabled;
        }
        return [{ ...row }];
      });

      const anon = appRouter.createCaller(createMockCtx());
      expect((await anon.events.list())[0]).toMatchObject({ status: "open" });

      const admin = appRouter.createCaller(createMockCtx("admin_user_id"));
      await admin.events.toggleCheckIn({ eventId: CLUB_EVENT, enabled: false });

      // The cached public listing must not survive the toggle.
      expect((await anon.events.list())[0]).toMatchObject({ status: "closed" });

      const member = appRouter.createCaller(createMockCtx("member_user"));
      await expect(member.events.checkIn({ qrCode: QR_OLD })).rejects.toThrow(
        /Check-in not enabled/,
      );
    });

    it("refuses a hackathon pass presented at a club door before any DB read", async () => {
      const caller = appRouter.createCaller(createMockCtx("member_user"));
      const hackathonPass = JSON.stringify({
        type: "CHECK_IN",
        hackathonId: HACK_A,
        participantId: PARTICIPANT,
      });

      await expect(
        caller.events.checkIn({ qrCode: hackathonPass }),
      ).rejects.toThrow();
      expect(mockFindFirst).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // The door reads the badge, then writes it. What keeps two in-flight scans
    // of the same badge from both passing the guard is the FOR UPDATE on the
    // event row: the second scan blocks there and only re-reads the check-ins
    // once the first has committed. unique(event_id, user_id) backs that up for
    // any path that does not take the lock.
    it("counts a double-tapped badge once", async () => {
      const row = clubEvent();
      const checkIns: any[] = [];
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "events") return io({ ...row });
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return io(activeMember);
        if (table === "eventCheckIns")
          return io(checkIns.find((c) => c.userId === "member_user"));
        return io(undefined);
      });
      // Stands in for `select ... for update`: the locked read sees the row as
      // it stands now, not the snapshot the caller opened with.
      mockSelect.mockImplementation((_op, _sel, fromArgs) =>
        fromArgs[0] === events
          ? [{ currentCheckIns: row.currentCheckIns }]
          : [{ count: 0 }],
      );
      mockInsert.mockImplementation((_op, insertArgs, valArgs) => {
        if (insertArgs[0] === eventCheckIns) {
          const added = valArgs[0];
          checkIns.push(added);
          __onRollback(() => {
            checkIns.splice(checkIns.indexOf(added), 1);
          });
        }
        return [{ id: `checkin_${checkIns.length}` }];
      });
      mockUpdate.mockImplementation((_op, updateArgs, setArgs) => {
        if (updateArgs[0] === events && setArgs[0].currentCheckIns) {
          row.currentCheckIns += 1;
          __onRollback(() => {
            row.currentCheckIns -= 1;
          });
          return [{ id: CLUB_EVENT }];
        }
        return [];
      });

      const caller = appRouter.createCaller(createMockCtx("member_user"));
      const outcomes = await Promise.allSettled([
        caller.events.checkIn({ qrCode: QR_OLD }),
        caller.events.checkIn({ qrCode: QR_OLD }),
      ]);

      expect(checkIns).toHaveLength(1);
      expect(row.currentCheckIns).toBe(1);
      const rejected = outcomes.filter((o) => o.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(
        "CONFLICT",
      );
    });

    // The count the caller opened with is a snapshot; capacity holds because
    // the locked re-read and the `currentCheckIns < maxCheckIns` on the
    // increment both re-test it, so the second scanner is turned away rather
    // than pushing the event one over.
    it("never admits more people than maxCheckIns", async () => {
      const row = clubEvent({ maxCheckIns: 1 });
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "events") return io({ ...row });
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return io(activeMember);
        return io(undefined);
      });
      mockSelect.mockImplementation((_op, _sel, fromArgs) =>
        fromArgs[0] === events
          ? [{ currentCheckIns: row.currentCheckIns }]
          : [{ count: 0 }],
      );
      mockInsert.mockReturnValue([{ id: "checkin" }]);
      mockUpdate.mockImplementation((_op, updateArgs, setArgs) => {
        if (updateArgs[0] === events && setArgs[0].currentCheckIns) {
          // `where currentCheckIns < maxCheckIns` — the statement matches no
          // row once the event is full, and RETURNING says so.
          if (row.maxCheckIns && row.currentCheckIns >= row.maxCheckIns)
            return [];
          row.currentCheckIns += 1;
          __onRollback(() => {
            row.currentCheckIns -= 1;
          });
          return [{ id: CLUB_EVENT }];
        }
        return [];
      });

      const first = appRouter.createCaller(createMockCtx("member_one"));
      const second = appRouter.createCaller(createMockCtx("member_two"));
      const outcomes = await Promise.allSettled([
        first.events.checkIn({ qrCode: QR_OLD }),
        second.events.checkIn({ qrCode: QR_OLD }),
      ]);

      expect(row.currentCheckIns).toBe(1);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((o) => o.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason.message).toMatch(
        /Event is full/,
      );
    });

    // BUG: checkIn's only temporal gate is checkInEnabled (events.ts:220); it
    // never reads eventDate, while events.ts:111-113 already advertises any
    // event older than 24h as "closed".
    it("rejects a photographed QR from an event that closed months ago", async () => {
      const stale = clubEvent({ eventDate: new Date(Date.now() - 60 * DAY) });
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "events") return stale;
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return activeMember;
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "events" ? [stale] : [],
      );

      const anon = appRouter.createCaller(createMockCtx());
      expect((await anon.events.list())[0]).toMatchObject({ status: "closed" });

      const member = appRouter.createCaller(createMockCtx("member_user"));
      const err: any = await member.events
        .checkIn({ qrCode: QR_OLD })
        .catch((e: unknown) => e);

      // The server must agree with the "closed" status the list advertises.
      expect(err.code).toBe("BAD_REQUEST");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // BUG: the capacity gate (events.ts:227) runs before the existing-check-in
    // lookup (events.ts:262), so someone already inside is told the event is
    // full and door staff start manual overrides.
    it("tells an already-admitted member they are in, not that the event is full", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "events")
          return clubEvent({ maxCheckIns: 1, currentCheckIns: 1 });
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return activeMember;
        if (table === "eventCheckIns") return { id: "checkin_1" };
        return undefined;
      });
      const caller = appRouter.createCaller(createMockCtx("member_user"));

      const err: any = await caller.events
        .checkIn({ qrCode: QR_OLD })
        .catch((e: unknown) => e);

      expect(err.code).toBe("CONFLICT");
      expect(err.message).toMatch(/Already checked in/);
    });

    // BUG: toggleCheckIn (events.ts:161-183) destructures an empty .returning()
    // and reports success for an event that no longer exists — unlike
    // regenerateQR (events.ts:52-57), which guards it.
    it("refuses to report success when toggling a deleted event", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockUpdate.mockReturnValue([]); // no rows matched
      const admin = appRouter.createCaller(createMockCtx("admin_user_id"));

      const err: any = await admin.events
        .toggleCheckIn({ eventId: CLUB_EVENT, enabled: false })
        .catch((e: unknown) => e);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------
  describe("Hackathon participant pass", () => {
    const approvedParticipant = {
      id: PARTICIPANT,
      hackathonId: HACK_A,
      registrationStatus: "approved",
      user: { name: "Ada Lovelace", email: "ada@example.com" },
    };

    const hackEvent = (overrides: Record<string, unknown> = {}) => ({
      id: HACK_EVENT,
      hackathonId: HACK_A,
      name: "Midnight Snack",
      startTime: new Date(Date.now() - 3 * HOUR),
      endTime: new Date(Date.now() - HOUR),
      ...overrides,
    });

    const scannerCtx = (opts: {
      event?: Record<string, unknown>;
      alreadyScanned?: boolean;
    }) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathonParticipants") return approvedParticipant;
        if (table === "hackathonEvents")
          return (
            opts.event ?? hackEvent({ endTime: new Date(Date.now() + HOUR) })
          );
        if (table === "hackathonEventAttendees")
          return opts.alreadyScanned ? { eventId: HACK_EVENT } : undefined;
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("admin_user_id"));
    };

    /**
     * This used to assert the opposite — that a scan records attendance and
     * leaves the roster alone — and that was right while `checked_in` was only
     * a label. It stopped being right when submitting a project came to depend
     * on the status: nothing else in the product ever wrote it, so the door
     * scan leaving it alone meant nobody could submit at all.
     */
    it("records attendance and checks the participant in", async () => {
      const caller = scannerCtx({});
      mockInsert.mockReturnValue([{ id: "attendee_1" }]);

      const res = await caller.hackathon.scanParticipantPass({
        hackathonId: HACK_A,
        eventId: HACK_EVENT,
        participantId: PARTICIPANT,
      });

      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      const [, insertArgs, valArgs] = mockInsert.mock.calls[0] as any[];
      expect(insertArgs[0]).toBe(hackathonEventAttendees);
      expect(valArgs[0]).toEqual({
        eventId: HACK_EVENT,
        participantId: PARTICIPANT,
      });
      // The roster write is what makes the analytics tile count real arrivals
      // rather than manual admin decisions — and what lets the team submit.
      const rosterWrite = mockUpdate.mock.calls[0];
      expect(rosterWrite?.[2][0]).toMatchObject({
        registrationStatus: "checked_in",
      });
    });

    it("never records attendance for a pass minted by another hackathon", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathonParticipants") return approvedParticipant;
        if (table === "hackathonEvents") return undefined; // scoped by (id, hackathonId)
        return undefined;
      });
      const caller = appRouter.createCaller(createMockCtx("admin_user_id"));

      // The data stays correct; the wording the volunteer sees ("Event not
      // found.") blames the schedule rather than the wrong-hackathon pass.
      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_B,
          eventId: HACK_EVENT,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // BUG: admin.ts:318-321 inserts with no try/catch, so when the
    // unique('unique_event_participant') index (schemas/hackathons.ts:310)
    // rejects the loser of a double-tap, errorFormatter (trpc.ts:24-28) masks
    // it as "An unexpected error occurred" on the volunteer's screen.
    it("shows a duplicate scan as a readable conflict, not a system failure", async () => {
      const caller = scannerCtx({}); // the guard read still says "not scanned"
      mockInsert.mockImplementation(() => {
        throw Object.assign(
          new Error(
            'duplicate key value violates unique constraint "unique_event_participant"',
          ),
          { code: "23505" },
        );
      });

      const err: any = await caller.hackathon
        .scanParticipantPass({
          hackathonId: HACK_A,
          eventId: HACK_EVENT,
          participantId: PARTICIPANT,
        })
        .catch((e: unknown) => e);

      expect(err.code).toBe("CONFLICT");
      expect(err.message).toMatch(/is already checked into/);
    });

    // BUG: scanParticipantPass matches on (id, hackathonId) only
    // (admin.ts:287-298) and never compares startTime/endTime to now, so one
    // pass of the scanner can check a participant into the whole weekend.
    it("refuses to check a participant into an event that already ended", async () => {
      const caller = scannerCtx({
        event: hackEvent({
          startTime: new Date(Date.now() - 3 * HOUR),
          endTime: new Date(Date.now() - HOUR),
        }),
      });

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: HACK_EVENT,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // BUG: hackathon/registration.ts:222-239 is a publicProcedure that returns
    // participants.id — the only secret in the unsigned pass QR built at
    // ScheduleTab.tsx:37-41 — for every participant in the hackathon.
    it("does not hand every participant's pass id to an anonymous caller", async () => {
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonParticipants"
          ? [
              {
                id: PARTICIPANT,
                hackathonId: HACK_A,
                userId: "victim_user",
                teamId: null,
                registrationStatus: "approved",
                user: { id: "victim_user", name: "Ada", image: null },
                team: null,
              },
            ]
          : [],
      );
      const anon = appRouter.createCaller(createMockCtx());

      const rows: any[] = await anon.hackathon.participants({
        hackathonId: HACK_A,
      });

      for (const row of rows) {
        expect(row.id).toBeUndefined();
        expect(row.userId).toBeUndefined();
      }
    });

    // Same pass id, reached a different way: submittedById on a solo project
    // names the participant who filed it, and the projects list is anonymous.
    it("does not hand a solo submitter's pass id to an anonymous caller", async () => {
      const project = {
        id: "project_1",
        hackathonId: HACK_A,
        teamId: null,
        submittedById: PARTICIPANT,
        name: "Solo Entry",
        status: "submitted",
        team: null,
      };
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonProjects" ? [{ ...project }] : [],
      );
      // The gallery refuses to serve a hackathon the caller cannot see, so a
      // visible one has to exist before the column scrubbing is reached.
      mockFindFirst.mockImplementation((table: string) =>
        table === "hackathons" ? { id: HACK_A, status: "open" } : undefined,
      );
      const anon = appRouter.createCaller(createMockCtx());

      const listed: any[] = await anon.hackathon.projects({
        hackathonId: HACK_A,
      });
      const published: any[] = await anon.hackathon.getPublicProjects({
        hackathonId: HACK_A,
      });

      expect(listed).toHaveLength(1);
      expect(published).toHaveLength(1);
      for (const row of [...listed, ...published]) {
        expect(row.submittedById).toBeUndefined();
        // The submission itself still has to arrive intact.
        expect(row.name).toBe("Solo Entry");
      }
    });

    // team.list is protected, but "protected" here means any signed-in user,
    // including someone who never registered for this hackathon.
    it("keeps pass ids and application decisions out of the team roster", async () => {
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonTeams"
          ? [
              {
                id: "team_1",
                name: "Squad",
                hackathonId: HACK_A,
                captainId: "victim_user",
                participants: [
                  {
                    id: PARTICIPANT,
                    userId: "victim_user",
                    registrationStatus: "waitlisted",
                    user: { id: "victim_user", name: "Ada", image: null },
                  },
                ],
              },
            ]
          : [],
      );

      const rows: any[] = await appRouter
        .createCaller(createMockCtx("stranger_user"))
        .team.list({ hackathonId: HACK_A });

      for (const participant of rows[0].participants) {
        expect(participant.id).toBeUndefined();
        expect(participant.registrationStatus).toBeUndefined();
        // userId stays: it is what marks the captain and keys the list.
        expect(participant.userId).toBe("victim_user");
      }
    });

    // A solo hacker's submission is reachable only through submittedById, so
    // without this the form they revisit is blank over a live entry and saving
    // a typo fix wipes the links they already filed.
    it("hands a solo hacker back the submission a resubmit would overwrite", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "hackathonParticipants")
          return { id: PARTICIPANT, teamId: null };
        if (table === "hackathonProjects")
          return {
            id: "project_1",
            teamId: null,
            submittedById: PARTICIPANT,
            name: "Solo Entry",
            githubUrl: "https://github.com/ada/solo",
          };
        return undefined;
      });

      const res: any = await appRouter
        .createCaller(createMockCtx("solo_user"))
        .team.mySubmission({ hackathonId: HACK_A });

      expect(res).toMatchObject({
        name: "Solo Entry",
        githubUrl: "https://github.com/ada/solo",
      });
      // Their own pass id is still not something the form needs.
      expect(res.submittedById).toBeUndefined();
    });

    // BUG: admin.ts:190 returns `updated: participantIds.length` — the count
    // submitted, not the count changed — while each UPDATE is scoped by
    // (id, hackathonId) so foreign ids are silent no-ops.
    it("reports how many participants a batch update actually changed", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      // Only PARTICIPANT belongs to HACK_A; the other two were mis-pasted.
      mockUpdate.mockImplementation((_op, _updateArgs, _setArgs, wArgs) =>
        sqlHas(wArgs[0], PARTICIPANT) ? [{ id: PARTICIPANT }] : [],
      );
      const admin = appRouter.createCaller(createMockCtx("admin_user_id"));

      const res = await admin.hackathon.batchUpdateParticipantStatus({
        hackathonId: HACK_A,
        participantIds: [PARTICIPANT, PARTICIPANT_B, PARTICIPANT_C],
        status: "approved",
      });

      expect(res.updated).toBe(1);
    });

    // BUG: createEvent refines endTime > startTime (hackathon/events.ts:32-34)
    // but updateEvent (lines 68-82) takes both as independent optionals and
    // never cross-checks them against the stored row.
    it("refuses an edit that ends a hackathon event before it starts", async () => {
      const start = new Date(Date.now() + 2 * HOUR);
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathonEvents")
          return {
            id: HACK_EVENT,
            hackathonId: HACK_A,
            startTime: start,
            endTime: new Date(start.getTime() + 2 * HOUR),
          };
        return undefined;
      });
      mockUpdate.mockReturnValue([{ id: HACK_EVENT }]);
      const admin = appRouter.createCaller(createMockCtx("admin_user_id"));

      // Only endTime supplied: it must still be checked against the stored start.
      await expect(
        admin.hackathon.updateEvent({
          eventId: HACK_EVENT,
          endTime: new Date(start.getTime() - HOUR),
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------
  describe("Check-in cache invalidation", () => {
    it("evicts the real event list keys only with a trailing wildcard", async () => {
      const row = clubEvent();
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "events" ? [{ ...row }] : [],
      );

      // Populate the keys the router really writes.
      await appRouter
        .createCaller(createMockCtx("admin_user_id"))
        .events.listAll();
      await appRouter.createCaller(createMockCtx()).events.list();
      expect(cache.has("events:list:all")).toBe(true);
      expect(cache.has("events:list:public")).toBe(true);

      // CACHE_INVALIDATION_MAP (trpc.ts:174-179) declares "events:list" for
      // every events.* mutation; deletePattern anchors it (cache.ts:80-81), so
      // it matches neither real key. Only the wildcard form works.
      expect(cache.deletePattern("events:list")).toBe(0);
      expect(cache.has("events:list:all")).toBe(true);
      expect(cache.deletePattern("events:list*")).toBe(2);
      expect(cache.has("events:list:public")).toBe(false);
    });

  });

  // -------------------------------------------------------------------
  describe("Editing a club event", () => {
    const asAdmin = (event: Record<string, unknown>) =>
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "events") return event;
        return undefined;
      });

    it("corrects a title without touching the QR or the check-ins", async () => {
      asAdmin(clubEvent({ currentCheckIns: 12 }));
      mockUpdate.mockReturnValue([
        { ...clubEvent(), title: "General Meeting #2" },
      ]);

      const res = await appRouter
        .createCaller(createMockCtx("admin_user_id"))
        .events.update({ eventId: CLUB_EVENT, title: "General Meeting #2" });

      expect(res?.title).toBe("General Meeting #2");
      const written = mockUpdate.mock.calls[0]![2][0];
      expect(written).toMatchObject({ title: "General Meeting #2" });
      // Nothing else may ride along: a new qrCode would invalidate every
      // printed sign, and the counters are the door's own state.
      expect(written).not.toHaveProperty("qrCode");
      expect(written).not.toHaveProperty("currentCheckIns");
    });

    /**
     * A cap below the number already scanned makes the door refuse everyone
     * forever, and the counter read as over-full with nothing explaining it.
     */
    it("refuses a capacity below the people already checked in", async () => {
      asAdmin(clubEvent({ currentCheckIns: 40 }));

      await expect(
        appRouter
          .createCaller(createMockCtx("admin_user_id"))
          .events.update({ eventId: CLUB_EVENT, maxCheckIns: 20 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("allows removing the cap entirely", async () => {
      asAdmin(clubEvent({ currentCheckIns: 40, maxCheckIns: 50 }));
      mockUpdate.mockReturnValue([{ ...clubEvent(), maxCheckIns: null }]);

      await appRouter
        .createCaller(createMockCtx("admin_user_id"))
        .events.update({ eventId: CLUB_EVENT, maxCheckIns: null });

      expect(mockUpdate.mock.calls[0]![2][0]).toMatchObject({
        maxCheckIns: null,
      });
    });

    it("is refused to a caller who is not staff", async () => {
      mockFindFirst.mockImplementation(() => undefined);

      await expect(
        appRouter
          .createCaller(createMockCtx("member_user"))
          .events.update({ eventId: CLUB_EVENT, title: "Nope" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
