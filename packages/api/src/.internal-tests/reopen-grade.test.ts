/**
 * judging.admin.reopenGrade: an organiser deletes one judge's evaluation, and
 * any draft for the same project and challenge, so the project is open for
 * another judge. The edition's draft placings were ranked with that grade, so
 * they go in the same transaction and results have to be computed again
 * before they can be published. Refused once results are published.
 *
 * The schema is the real one; only the database handle is a stand-in, handed
 * to the router through the context the way check-in-flags-organizer.test.ts
 * does. It applies the equality conditions the router asks for, so a missing
 * edition condition lets another edition's evaluation through and fails the
 * test. It keeps every statement in order, which is how the tests see the
 * drafts being locked before the project's grading lock and both before a
 * delete.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  hackathons,
  judgingConfigs,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingEvaluationRevisions,
  judgingEvaluations,
  judgingPlacements,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_B = "22222222-2222-4222-8222-222222222222";
const ENTRY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CHALLENGE = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const JUDGE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const EVAL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const EVAL_OTHER_EDITION = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const DRAFT_1 = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const DRAFT_2 = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const NO_SUCH = "99999999-9999-4999-8999-999999999999";

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);

type Row = Record<string, any>;
type Event = {
  kind: "select" | "execute" | "insert" | "delete" | "update";
  table?: unknown;
  where?: unknown;
  /** A select that takes row locks. */
  locking?: boolean;
};

const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const TERM = /"[a-z_]+"\."([a-z_]+)" = \$(\d+)/g;

/** A row filter from a where of `column = value` terms joined by and. */
function matcher(where: unknown) {
  const { sql: text, params } = render(where);
  const terms = [...text.matchAll(TERM)].map(
    (match) => [camel(match[1]!), params[Number(match[2]) - 1]] as const,
  );
  if (text.replace(TERM, "").replace(/[()\s]|and/g, "")) {
    throw new Error(`The fake database cannot evaluate: ${text}`);
  }
  return (row: Row) => terms.every(([key, value]) => row[key] === value);
}

let adminRow: Row | undefined;
let published = false;
const store = new Map<unknown, Row[]>();
const events: Event[] = [];

const rowsOf = (table: unknown, where: unknown) => {
  const rows = store.get(table) ?? [];
  return where ? rows.filter(matcher(where)) : [...rows];
};

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: () => {
    const event: Event = { kind: "select" };
    events.push(event);
    const chain: any = {
      then: (onOk: any, onErr: any) => {
        // Counts of placements: those that carry a publish time (the published
        // check), or every one of the edition's (what publish finds to publish).
        const placings = () => {
          const { sql: text, params } = render(event.where);
          const count = text.includes('"published_at" is not null')
            ? published
              ? 3
              : 0
            : (store.get(judgingPlacements) ?? []).filter((row) =>
                params.includes(row.hackathonId),
              ).length;
          return [{ value: count, n: count }];
        };
        const rows =
          event.table === judgingPlacements
            ? placings()
            : rowsOf(event.table, event.where);
        return Promise.resolve(rows).then(onOk, onErr);
      },
    };
    chain.from = (table: unknown) => {
      event.table = table;
      return chain;
    };
    chain.where = (where: unknown) => {
      event.where = where;
      return chain;
    };
    chain.for = () => {
      event.locking = true;
      return chain;
    };
    for (const method of ["innerJoin", "leftJoin", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    return chain;
  },
  execute: async () => {
    events.push({ kind: "execute" });
  },
  insert: (table: unknown) => ({
    values: (values: Row) => {
      events.push({ kind: "insert", table, where: values });
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({ returning: async () => [] }),
        returning: async () => [values],
      });
    },
  }),
  update: (table: unknown) => ({
    set: () => ({
      where: (where: unknown) => {
        events.push({ kind: "update", table, where });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [],
        });
      },
    }),
  }),
  delete: (table: unknown) => ({
    where: (where: unknown) => {
      events.push({ kind: "delete", table, where });
      // The placings the delete takes: this edition's that carry no publish
      // time, which the fake reads off the condition's parameters.
      const hit =
        table === judgingPlacements
          ? (store.get(table) ?? []).filter(
              (row) =>
                render(where).params.includes(row.hackathonId) &&
                row.publishedAt === null,
            )
          : [];
      if (table === judgingPlacements) {
        store.set(
          table,
          (store.get(table) ?? []).filter((row) => !hit.includes(row)),
        );
      }
      return Object.assign(Promise.resolve([]), {
        returning: async () => hit.map((row) => ({ id: row.id })),
      });
    },
  }),
  transaction: async (callback: (tx: unknown) => unknown) => callback(fakeDb),
};

const callerAs = (userId: string | undefined) =>
  appRouter.createCaller({
    db: fakeDb,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);

const admin = () => callerAs("admin_user");
const reopen = (
  over: Partial<{ hackathonId: string; evaluationId: string }> = {},
) =>
  admin().judging.admin.reopenGrade({
    hackathonId: HACK_A,
    evaluationId: EVAL,
    ...over,
  });

// Without the audit log's own housekeeping, which prunes old rows.
const deletes = () =>
  events.filter(
    (event) => event.kind === "delete" && event.table !== auditLogs,
  );
const audits = () =>
  events
    .filter((event) => event.kind === "insert" && event.table === auditLogs)
    .map((event) => event.where as Row);

const configRow = (hackathonId: string, state = "open") => ({
  hackathonId,
  state,
  openedAt: null,
  closedAt: null,
  showAllScores: false,
  inventoryLockedAt: null,
  groupsInitializedAt: null,
  itineraryPublished: false,
  emergencyMode: false,
  claimsStartedAt: null,
});

beforeEach(() => {
  cache.clear();
  events.length = 0;
  published = false;
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };
  store.clear();
  store.set(hackathons, [
    { id: HACK_A, name: "Hacklytics 2027", startDate: null, endDate: null },
    { id: HACK_B, name: "Hacklytics 2026", startDate: null, endDate: null },
  ]);
  store.set(judgingConfigs, [configRow(HACK_A), configRow(HACK_B)]);
  store.set(judgingEvaluations, [
    {
      id: EVAL,
      hackathonId: HACK_A,
      entryId: ENTRY,
      challengeId: CHALLENGE,
      judgeId: JUDGE,
      revision: 2,
      isComplete: false,
    },
    {
      id: EVAL_OTHER_EDITION,
      hackathonId: HACK_B,
      entryId: ENTRY,
      challengeId: CHALLENGE,
      judgeId: JUDGE,
      revision: 1,
      isComplete: true,
    },
  ]);
  store.set(judgingPlacements, [
    { id: "p1", hackathonId: HACK_A, scope: "overall", publishedAt: null },
    { id: "p2", hackathonId: HACK_A, scope: CHALLENGE, publishedAt: null },
    { id: "p3", hackathonId: HACK_B, scope: "overall", publishedAt: null },
  ]);
  store.set(judgingEvaluationDrafts, [
    { id: DRAFT_1, entryId: ENTRY, challengeId: CHALLENGE },
    { id: DRAFT_2, entryId: ENTRY, challengeId: CHALLENGE },
    { id: "elsewhere", entryId: NO_SUCH, challengeId: CHALLENGE },
  ]);
});

describe("judging.admin.reopenGrade", () => {
  it("deletes the evaluation and every draft for the project and challenge", async () => {
    await expect(reopen()).resolves.toEqual({
      reopened: true,
      drafts: 2,
      placings: 2,
    });

    const [draftDelete, evaluationDelete] = deletes();
    expect(deletes()).toHaveLength(3);
    expect(draftDelete!.table).toBe(judgingEvaluationDrafts);
    expect(render(draftDelete!.where).params).toEqual([DRAFT_1, DRAFT_2]);
    expect(evaluationDelete!.table).toBe(judgingEvaluations);
    expect(render(evaluationDelete!.where).params).toEqual([EVAL]);
  });

  it("deletes an evaluation with no draft beside it", async () => {
    store.set(judgingEvaluationDrafts, []);

    await expect(reopen()).resolves.toMatchObject({
      reopened: true,
      drafts: 0,
    });

    expect(deletes().map((event) => event.table)).toEqual([
      judgingEvaluations,
      judgingPlacements,
    ]);
  });

  it("locks the drafts, then the project's grading lock, before it deletes", async () => {
    await reopen();

    const draftLock = events.findIndex(
      (event) =>
        event.kind === "select" &&
        event.table === judgingEvaluationDrafts &&
        event.locking,
    );
    const gradingLock = events.findIndex((event) => event.kind === "execute");
    const firstDelete = events.findIndex((event) => event.kind === "delete");
    const configLock = events.findIndex(
      (event) =>
        event.kind === "select" &&
        event.table === judgingConfigs &&
        event.locking,
    );
    expect(configLock).toBeGreaterThan(-1);
    expect(draftLock).toBeGreaterThan(configLock);
    expect(gradingLock).toBeGreaterThan(draftLock);
    expect(firstDelete).toBeGreaterThan(gradingLock);
  });

  it("deletes the edition's draft placings once the grade is gone, and no other edition's", async () => {
    await expect(reopen()).resolves.toMatchObject({ placings: 2 });

    const [, evaluationDelete, placingDelete] = deletes();
    expect(evaluationDelete!.table).toBe(judgingEvaluations);
    expect(placingDelete!.table).toBe(judgingPlacements);
    const query = render(placingDelete!.where);
    expect(query.params).toEqual([HACK_A]);
    expect(query.sql).toContain('"judging_placement"."hackathon_id" = $1');
    expect(query.sql).toContain('"published_at" is null');
    expect(store.get(judgingPlacements)!.map((row) => row.id)).toEqual(["p3"]);
  });

  it("leaves nothing to publish until results are computed again", async () => {
    const publish = () =>
      admin().judging.results.publish({ hackathonId: HACK_A });

    // The draft placings as computed, with the grade in them.
    await expect(publish()).resolves.toMatchObject({ publishedAt: expect.any(Date) });

    await reopen();

    await expect(publish()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining(
        "Reopening a grade clears the draft placings, so compute again after one.",
      ),
    });
  });

  it("reports none cleared when results were never computed", async () => {
    store.set(judgingPlacements, []);

    await expect(reopen()).resolves.toMatchObject({
      reopened: true,
      placings: 0,
    });
  });

  it("refuses once results are published, and deletes nothing", async () => {
    published = true;

    await expect(reopen()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Results are published. Unpublish them first, then reopen the grade and compute results again.",
    });

    expect(deletes()).toEqual([]);
    expect(audits()).toEqual([]);
  });

  it("reads published from the placings of this edition", async () => {
    await reopen();

    const placings = events.find(
      (event) => event.kind === "select" && event.table === judgingPlacements,
    )!;
    const query = render(placings.where);
    expect(query.params).toContain(HACK_A);
    expect(query.sql).toContain('"published_at" is not null');
  });

  it("is allowed while judging is closed", async () => {
    store.set(judgingConfigs, [configRow(HACK_A, "closed")]);

    await expect(reopen()).resolves.toMatchObject({ reopened: true });

    expect(deletes()).toHaveLength(3);
  });

  it("does not reach an evaluation of another edition", async () => {
    await expect(
      reopen({ evaluationId: EVAL_OTHER_EDITION }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(deletes()).toEqual([]);
  });

  it("says so when the evaluation is already gone", async () => {
    await expect(reopen({ evaluationId: NO_SUCH })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "That evaluation is gone. Refresh the list.",
    });
  });

  it("is audited as a critical action, with what was deleted", async () => {
    await reopen();

    expect(audits()).toEqual([
      expect.objectContaining({
        userId: "admin_user",
        action: "judging.reopenGrade",
        resourceId: EVAL,
        severity: "critical",
        metadata: {
          hackathonId: HACK_A,
          entryId: ENTRY,
          challengeId: CHALLENGE,
          judgeId: JUDGE,
          revision: 2,
          wasComplete: false,
          draftsDeleted: 2,
          placingsDeleted: 2,
        },
      }),
    ]);
  });

  it("is for admins only", async () => {
    adminRow = undefined;
    await expect(reopen()).rejects.toMatchObject({ code: "FORBIDDEN" });

    adminRow = { userId: "admin_user", isActive: true, role: "bug_tester" };
    cache.clear();
    await expect(reopen()).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(deletes()).toEqual([]);
  });

  it("rejects ids that are not uuids", async () => {
    await expect(reopen({ evaluationId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("what goes with an evaluation", () => {
  const foreignKeys = (table: Parameters<typeof getTableConfig>[0]) =>
    getTableConfig(table).foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        to: reference.foreignTable,
        columns: reference.columns.map((column) => column.name),
        onDelete: key.onDelete,
      };
    });

  it.each([
    ["ratings", judgingEvaluationRatings],
    ["responses", judgingEvaluationResponses],
    ["revisions", judgingEvaluationRevisions],
  ])("deletes its %s by cascade", (_, table) => {
    expect(foreignKeys(table)).toContainEqual({
      to: judgingEvaluations,
      columns: ["evaluation_id"],
      onDelete: "cascade",
    });
  });
});
