import type { SQL } from "drizzle-orm";
import { getTableName } from "drizzle-orm";

/**
 * Fixtures and the stand-in database the judge-desk suites share: a router that
 * runs for real against a database that answers each select by the tables it
 * reads and keeps every statement in order.
 */

export const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
export const GENERAL = "0c4a8e10-2b3d-4c5e-9f60-7a8b9c0d1e2f";
export const SPONSOR = "0c4a8e11-2b3d-4c5e-9f60-7a8b9c0d1e2f";
export const ME = "1d5b9f21-3c4e-4d6f-8a70-8b9c0d1e2f3a";
export const OTHER = "1d5b9f22-3c4e-4d6f-8a70-8b9c0d1e2f3a";
export const ROOM = "2e6ca032-4d5f-4e70-9b81-9c0d1e2f3a4b";
export const RATING = "3f7db143-5e60-4f81-8c92-0d1e2f3a4b5c";

export const challenge = (
  id: string,
  label: string,
  mode: "scheduled" | "unscheduled" | "remote",
) => ({
  id,
  parentId: null,
  mode,
  label,
  isGeneral: id === GENERAL,
  isGroup: false,
});
export const general = challenge(GENERAL, "General", "unscheduled");
export const sponsor = challenge(SPONSOR, "Best Use of AI", "scheduled");

export const entry = (id: string, title: string) => ({
  id,
  title,
  description: "",
  submissionUrl: null,
  demoLinks: [],
  videoUrl: null,
  technologies: [],
  participantCount: 2,
});

export const rating = {
  id: RATING,
  kind: "rating",
  label: "Impact",
  description: "",
  required: true,
  guestVisibility: null,
};

export const name = (table: unknown) => getTableName(table as never);
export const via = (...tables: unknown[]) => tables.map(name).join(">");

type Rows =
  unknown[] | ((call: number, fields?: Record<string, unknown>) => unknown[]);
export type Answers = Record<string, Rows>;
export type Event = {
  kind: "select" | "execute" | "insert" | "update" | "delete";
  table?: string;
  where?: SQL;
  values?: Record<string, unknown>;
  /** What a select asked for. */
  fields?: Record<string, unknown>;
  /** A select that takes row locks. */
  locking?: boolean;
};

/** The nth read of a table gets the nth list. */
export const byCall =
  (...lists: unknown[][]) =>
  (call: number) =>
    lists[call] ?? [];

export function fakeDb(answers: Answers) {
  const events: Event[] = [];
  const reads = new Map<string, number>();
  const rowsFor = (key: string, fields?: Record<string, unknown>) => {
    const call = reads.get(key) ?? 0;
    reads.set(key, call + 1);
    const answer = answers[key] ?? [];
    return typeof answer === "function" ? answer(call, fields) : answer;
  };

  const select = (fields?: Record<string, unknown>) => {
    const joined: unknown[] = [];
    let from: unknown;
    let where: SQL | undefined;
    let locking: boolean | undefined;
    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        from = table;
        return chain;
      },
      where: (clause: SQL) => {
        where = clause;
        return chain;
      },
      for: () => {
        locking = true;
        return chain;
      },
      then: (
        ok: (rows: unknown[]) => unknown,
        fail: (error: unknown) => unknown,
      ) => {
        const key = via(from, ...joined);
        events.push({ kind: "select", table: key, where, fields, locking });
        return Promise.resolve(rowsFor(key, fields)).then(ok, fail);
      },
    };
    for (const join of ["innerJoin", "leftJoin"]) {
      chain[join] = (table: unknown) => {
        joined.push(table);
        return chain;
      };
    }
    for (const method of ["orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    return chain;
  };

  const db: Record<string, unknown> = {
    select,
    execute: () => {
      events.push({ kind: "execute" });
      return Promise.resolve();
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        events.push({ kind: "insert", table: via(table), values });
        const done = Promise.resolve([{ id: "new" }]);
        return Object.assign(done, { returning: () => done });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          events.push({ kind: "update", table: via(table), where, values });
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        events.push({ kind: "delete", table: via(table), where });
        return Promise.resolve();
      },
    }),
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db, events };
}

// A new user for each context: the desk's flood guard counts calls per user.
let callers = 0;
export const memberCtx = (db: unknown) => {
  const userId = `judge-user-${(callers += 1)}`;
  return {
    db,
    session: { user: { id: userId, name: "Grace Hopper" } },
    userId,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never;
};

export const guestCtx = (db: unknown) =>
  ({
    db,
    session: null,
    userId: undefined,
    clientIp: "127.0.0.2",
    req: {
      headers: {
        get: (header: string) =>
          header.toLowerCase() === "cookie"
            ? "query_judging_guest=guest-token"
            : null,
      },
    },
  }) as never;

export const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000);
export const minutesAhead = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);

export const wrote = (events: Event[], table: unknown) =>
  events.some((e) => e.kind === "insert" && e.table === name(table));

export const beingGraded =
  "Another judge is grading this project right now. Pick another one.";
