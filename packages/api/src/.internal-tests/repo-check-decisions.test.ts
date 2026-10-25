/**
 * judging.admin.decideRepoCheck, reinstateRepoCheck and setRepoCheck: what an
 * organiser's decision on a late-push flag does to the project. The schema and
 * the router are the real ones; the database handle keeps the rows of the
 * tables they touch. A disqualified project is removed the way removeEntry
 * removes one (`deletedAt`), which is the column placements, results, the
 * queue, the judge itinerary and the judge assigner already leave out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  hackathonProjects,
  hackathons,
  judgingConfigs,
  judgingEntries,
  judgingRepoChecks,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import type * as Challenges from "../services/judging/challenges";
import { repoCheckThrottle } from "../services/judging/repo-check";

vi.mock("../services/judging/challenges", async (importActual) => ({
  ...(await importActual<typeof Challenges>()),
  lockEdition: async () => undefined,
}));

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HACK = id(1);
const OTHER = id(2);
const [LATE, DEVPOST, FORGOTTEN, ELSEWHERE, WITHDRAWN] = [10, 11, 12, 13, 14].map(id);

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);

type Row = Record<string, any>;

let adminRow: Row | undefined;
let entries: Row[] = [];
let checks: Row[] = [];
let projects: Row[] = [];
let config: Row = {};
let audits: Row[] = [];

const find = (rows: Row[], key: string, params: unknown[]) =>
  rows.filter((r) => r[key] === params[0]);

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: () => {
    let table: unknown = null;
    let where: unknown = null;
    const chain: any = {
      then: (ok: any, err: any) => {
        const { params } = render(where);
        const rows =
          table === judgingEntries
            ? find(entries, "id", params)
            : table === judgingRepoChecks
              ? find(checks, "entryId", params)
              : table === hackathonProjects
                ? find(projects, "id", params)
                : table === hackathons
                  ? [{ id: HACK, name: "Hack" }]
                  : [];
        return Promise.resolve(rows.map((row) => ({ ...row }))).then(ok, err);
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
    chain.limit = () => chain;
    return chain;
  },
  insert: (table: unknown) => ({
    values: (values: Row) => {
      if (table === auditLogs) audits.push(values);
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({ returning: async () => [{ ...values }] }),
      });
    },
  }),
  delete: (table: unknown) => ({
    where: () => {
      // A new grace drops the flags nobody has decided, unless the project is out.
      if (table === judgingRepoChecks) {
        checks = checks.filter((c) => c.decision !== "pending" || c.removedEntry);
      }
      return Promise.resolve(undefined);
    },
  }),
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: (where: unknown) => {
        const { params } = render(where);
        if (table === judgingEntries) {
          for (const row of find(entries, "id", params)) Object.assign(row, values);
        } else if (table === judgingRepoChecks) {
          for (const row of find(checks, "entryId", params)) {
            Object.assign(row, values);
          }
        } else if (table === judgingConfigs) {
          Object.assign(config, values);
        }
        return Promise.resolve(undefined);
      },
    }),
  }),
  transaction: async (callback: (tx: unknown) => unknown) => {
    const savedEntries = entries.map((r) => ({ ...r }));
    const savedChecks = checks.map((r) => ({ ...r }));
    try {
      return await callback(fakeDb);
    } catch (error) {
      entries = savedEntries;
      checks = savedChecks;
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

const entry = (entryId: string, over: Row = {}): Row => ({
  id: entryId,
  hackathonId: HACK,
  title: `Project ${entryId.slice(-2)}`,
  source: "devpost",
  sourceProjectId: null,
  deletedAt: null,
  deletedById: null,
  ...over,
});

const check = (entryId: string, over: Row = {}): Row => ({
  entryId,
  hackathonId: HACK,
  outcome: "late",
  decision: "pending",
  decidedById: null,
  decidedAt: null,
  note: null,
  removedEntry: false,
  removedDeletedAt: null,
  ...over,
});

const byId = (entryId: string) => entries.find((e) => e.id === entryId)!;
const checkOf = (entryId: string) => checks.find((c) => c.entryId === entryId)!;

beforeEach(() => {
  cache.clear();
  repoCheckThrottle.clear();
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };
  entries = [
    entry(LATE),
    entry(DEVPOST),
    entry(FORGOTTEN, { deletedAt: new Date("2026-02-08T10:00:00Z") }),
    entry(ELSEWHERE, { hackathonId: OTHER }),
    entry(WITHDRAWN, {
      source: "portal",
      sourceProjectId: id(50),
      deletedAt: new Date("2026-02-08T10:00:00Z"),
    }),
  ];
  checks = [
    check(LATE),
    check(DEVPOST),
    check(FORGOTTEN),
    check(ELSEWHERE, { hackathonId: OTHER }),
    check(WITHDRAWN, {
      decision: "disqualified",
      removedEntry: true,
      removedDeletedAt: new Date("2026-02-08T10:00:00Z"),
    }),
  ];
  projects = [{ id: id(50), status: "draft", withdrawnByAdminAt: null }];
  config = {};
  audits = [];
});

describe("judging.admin.decideRepoCheck", () => {
  it("disqualifying removes the project from judging and records who and why", async () => {
    await admin().judging.admin.decideRepoCheck({
      hackathonId: HACK,
      entryId: LATE,
      decision: "disqualified",
      note: "  pushed 40 minutes after the deadline  ",
    });

    expect(byId(LATE).deletedAt).toBeInstanceOf(Date);
    expect(byId(LATE).deletedById).toBe("admin_user");
    expect(checkOf(LATE)).toMatchObject({
      decision: "disqualified",
      decidedById: "admin_user",
      note: "pushed 40 minutes after the deadline",
      removedEntry: true,
      removedDeletedAt: byId(LATE).deletedAt,
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "judging.repoCheck.disqualify",
      resourceId: LATE,
      severity: "warn",
    });
  });

  it("clearing only closes the flag", async () => {
    await admin().judging.admin.decideRepoCheck({
      hackathonId: HACK,
      entryId: DEVPOST,
      decision: "cleared",
    });
    expect(byId(DEVPOST).deletedAt).toBeNull();
    expect(checkOf(DEVPOST)).toMatchObject({
      decision: "cleared",
      removedEntry: false,
      note: null,
    });
    expect(audits[0]).toMatchObject({ action: "judging.repoCheck.clear" });
  });

  it("does not claim a project an organiser had already removed", async () => {
    await admin().judging.admin.decideRepoCheck({
      hackathonId: HACK,
      entryId: FORGOTTEN,
      decision: "disqualified",
    });
    expect(byId(FORGOTTEN).deletedById).toBeNull();
    expect(checkOf(FORGOTTEN)).toMatchObject({
      decision: "disqualified",
      removedEntry: false,
    });
  });

  it("refuses a project of another edition and one with no check", async () => {
    await expect(
      admin().judging.admin.decideRepoCheck({
        hackathonId: HACK,
        entryId: ELSEWHERE,
        decision: "disqualified",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    checks = [];
    await expect(
      admin().judging.admin.decideRepoCheck({
        hackathonId: HACK,
        entryId: LATE,
        decision: "disqualified",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(byId(LATE).deletedAt).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it("refuses to decide twice on a disqualified project, or to clear one that was removed", async () => {
    await expect(
      admin().judging.admin.decideRepoCheck({
        hackathonId: HACK,
        entryId: WITHDRAWN,
        decision: "cleared",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    checkOf(DEVPOST).removedEntry = true;
    await expect(
      admin().judging.admin.decideRepoCheck({
        hackathonId: HACK,
        entryId: DEVPOST,
        decision: "cleared",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Reinstate"),
    });
    expect(audits).toHaveLength(0);
  });

  it("is for admins only", async () => {
    adminRow = undefined;
    await expect(
      admin().judging.admin.decideRepoCheck({
        hackathonId: HACK,
        entryId: LATE,
        decision: "disqualified",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(byId(LATE).deletedAt).toBeNull();
  });
});

describe("judging.admin.reinstateRepoCheck", () => {
  it("brings back a project the disqualification removed", async () => {
    await admin().judging.admin.decideRepoCheck({
      hackathonId: HACK,
      entryId: LATE,
      decision: "disqualified",
    });
    audits = [];
    await admin().judging.admin.reinstateRepoCheck({
      hackathonId: HACK,
      entryId: LATE,
      note: "team showed the push was a README fix",
    });

    expect(byId(LATE).deletedAt).toBeNull();
    expect(checkOf(LATE)).toMatchObject({
      decision: "cleared",
      removedEntry: false,
      note: "team showed the push was a README fix",
    });
    expect(audits[0]).toMatchObject({ action: "judging.repoCheck.reinstate" });
  });

  it("does not undo a removal made after the disqualification", async () => {
    await admin().judging.admin.decideRepoCheck({
      hackathonId: HACK,
      entryId: LATE,
      decision: "disqualified",
    });
    // Restored by hand and removed again for another reason.
    const removedAgain = new Date(byId(LATE).deletedAt.getTime() + 60_000);
    byId(LATE).deletedAt = removedAgain;

    await admin().judging.admin.reinstateRepoCheck({
      hackathonId: HACK,
      entryId: LATE,
    });
    expect(byId(LATE).deletedAt).toEqual(removedAgain);
    expect(checkOf(LATE)).toMatchObject({
      decision: "cleared",
      removedEntry: false,
      removedDeletedAt: null,
    });
  });

  it("keeps the restore refusal for a withdrawn portal submission", async () => {
    await expect(
      admin().judging.admin.reinstateRepoCheck({
        hackathonId: HACK,
        entryId: WITHDRAWN,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(byId(WITHDRAWN).deletedAt).toBeInstanceOf(Date);
    expect(checkOf(WITHDRAWN).decision).toBe("disqualified");
  });

  it("refuses a project that is not disqualified", async () => {
    await expect(
      admin().judging.admin.reinstateRepoCheck({
        hackathonId: HACK,
        entryId: DEVPOST,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("judging.admin.setRepoCheck", () => {
  it("switches the check on and makes the next poll run it", async () => {
    repoCheckThrottle.set(HACK, Date.now());
    await admin().judging.admin.setRepoCheck({
      hackathonId: HACK,
      enabled: true,
      graceMinutes: 15,
    });
    expect(config).toMatchObject({
      repoCheckEnabled: true,
      repoCheckGraceMinutes: 15,
      repoCheckLastRunAt: null,
    });
    expect(repoCheckThrottle.has(HACK)).toBe(false);
    // The pending flags are worked out again with the new grace.
    expect(checks.map((c) => c.entryId)).not.toContain(LATE);
    expect(checkOf(WITHDRAWN)).toBeDefined();
    expect(audits[0]).toMatchObject({ action: "judging.repoCheck.configure" });
  });

  it("refuses an empty change and a grace past a day", async () => {
    await expect(
      admin().judging.admin.setRepoCheck({ hackathonId: HACK }),
    ).rejects.toThrow();
    await expect(
      admin().judging.admin.setRepoCheck({ hackathonId: HACK, graceMinutes: 1441 }),
    ).rejects.toThrow();
  });
});
