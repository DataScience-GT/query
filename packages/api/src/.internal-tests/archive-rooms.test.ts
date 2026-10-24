/**
 * judging.admin.archiveRooms: many rooms archived in one transaction, each the
 * way setRoomArchived does it. The schema and the router are the real ones;
 * only the database handle is a stand-in that keeps the rows of the tables the
 * archive reads and records what it writes. Its transaction puts the rows back
 * when the callback throws, which is what a database does, so a refused call
 * can be seen to leave every room as it was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  judgingAnnouncements,
  judgingAppointments,
  judgingGuestSessions,
  judgingRoomLinks,
  judgingRooms,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import type * as Challenges from "../services/judging/challenges";

// The edition lock is a row lock; there is nothing to hold in a fake.
vi.mock("../services/judging/challenges", async (importActual) => ({
  ...(await importActual<typeof Challenges>()),
  lockEdition: async () => undefined,
}));

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HACK = id(1);
const OTHER = id(2);
const [T1, T2, T3, BUSY, FOREIGN, DONE] = [10, 11, 12, 13, 14, 15].map(id);

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);

type Row = Record<string, any>;

let adminRow: Row | undefined;
let rooms: Row[] = [];
let appointments: Row[] = [];
let updates: { table: unknown; values: Row; params: unknown[] }[] = [];
let audits: Row[] = [];

/** The room ids a where of `id in (...)` or `id = x` names, from its params. */
const idsIn = (where: unknown) =>
  render(where).params.filter((p) => typeof p === "string");

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: () => {
    let table: unknown = null;
    let where: unknown = null;
    const chain: any = {
      then: (ok: any, err: any) => {
        if (table === judgingAppointments) {
          const { params } = render(where);
          const hit = appointments.filter((a) => a.roomId === params[0]);
          return Promise.resolve([{ value: hit.length }]).then(ok, err);
        }
        const wanted = idsIn(where);
        const hit = rooms
          .filter((r) => wanted.includes(r.id) && wanted.includes(r.hackathonId))
          .map((r) => ({ ...r }));
        return Promise.resolve(hit).then(ok, err);
      },
    };
    chain.from = (from: unknown) => {
      table = from;
      return chain;
    };
    chain.where = (condition: unknown) => {
      where = condition;
      return chain;
    };
    chain.orderBy = () => chain;
    return chain;
  },
  insert: (table: unknown) => ({
    values: (values: Row) => {
      if (table === auditLogs) audits.push(values);
      return Object.assign(Promise.resolve(undefined), {
        returning: async () => [values],
      });
    },
  }),
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: (where: unknown) => {
        const params = render(where).params;
        updates.push({ table, values, params });
        const hit =
          table === judgingRooms
            ? rooms.filter((r) => r.id === params[0])
            : [];
        for (const row of hit) Object.assign(row, values);
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => hit.map((row) => ({ ...row })),
        });
      },
    }),
  }),
  transaction: async (callback: (tx: unknown) => unknown) => {
    const saved = rooms.map((r) => ({ ...r }));
    const written = updates.length;
    try {
      return await callback(fakeDb);
    } catch (error) {
      rooms = saved;
      updates.length = written;
      throw error;
    }
  },
};

const admin = () =>
  appRouter.createCaller({
    db: fakeDb,
    session: { user: { id: "admin_user" } },
    userId: "admin_user",
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);

const room = (roomId: string, name: string, over: Row = {}): Row => ({
  id: roomId,
  hackathonId: HACK,
  name,
  kind: "table",
  archivedAt: null,
  ...over,
});

const archivedIds = () => rooms.filter((r) => r.archivedAt).map((r) => r.id);

beforeEach(() => {
  cache.clear();
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };
  rooms = [
    room(T1, "Table 1"),
    room(T2, "Table 2"),
    room(T3, "Table 3"),
    room(BUSY, "Table 4"),
    room(FOREIGN, "Table 9", { hackathonId: OTHER }),
    room(DONE, "Table 5", { archivedAt: new Date("2027-01-01T00:00:00Z") }),
  ];
  appointments = [{ id: id(90), roomId: BUSY }];
  updates = [];
  audits = [];
});

describe("judging.admin.archiveRooms", () => {
  it("archives every room, retires its access and writes an audit row for each", async () => {
    const result = await admin().judging.admin.archiveRooms({
      hackathonId: HACK,
      roomIds: [T1, T2, T3],
    });

    expect(result).toEqual({ archived: 3 });
    expect(archivedIds().sort()).toEqual([T1, T2, T3, DONE].sort());
    for (const table of [
      judgingRoomLinks,
      judgingGuestSessions,
      judgingAnnouncements,
    ]) {
      expect(updates.filter((u) => u.table === table)).toHaveLength(3);
    }
    expect(audits.map((a) => [a.action, a.resourceId, a.severity])).toEqual(
      [T1, T2, T3]
        .sort()
        .map((roomId) => ["judging.archiveRoom", roomId, "warn"]),
    );
  });

  it("leaves an archived room and repeated ids alone", async () => {
    const result = await admin().judging.admin.archiveRooms({
      hackathonId: HACK,
      roomIds: [T1, T1, DONE],
    });
    expect(result).toEqual({ archived: 1 });
    expect(audits).toHaveLength(1);
  });

  it("refuses the whole call when one room has presentations, and changes nothing", async () => {
    await expect(
      admin().judging.admin.archiveRooms({
        hackathonId: HACK,
        roomIds: [T1, BUSY, T2],
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Table 4 has 1 scheduled presentation"),
    });
    expect(archivedIds()).toEqual([DONE]);
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("refuses a room from another edition", async () => {
    await expect(
      admin().judging.admin.archiveRooms({
        hackathonId: HACK,
        roomIds: [T1, FOREIGN],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(archivedIds()).toEqual([DONE]);
    expect(updates).toHaveLength(0);
  });

  it("needs at least one room", async () => {
    await expect(
      admin().judging.admin.archiveRooms({ hackathonId: HACK, roomIds: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
