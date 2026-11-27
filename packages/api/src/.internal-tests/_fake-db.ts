import { PgDialect } from "drizzle-orm/pg-core";
import { vi } from "vitest";

const dialect = new PgDialect();

/** A drizzle condition as `{ sql, params }`. */
export const render = (condition: unknown) =>
  dialect.sqlToQuery(condition as never);

/** A distinct, valid uuid for each `n`. */
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const TERM = /"[a-z_]+"\."([a-z_]+)" = \$(\d+)/g;

/**
 * A row filter from a where made only of `column = value` terms joined by
 * `and`, or null for anything else.
 */
export function tryMatcher(where: unknown) {
  const { sql: text, params } = render(where);
  if (text.replace(TERM, "").replace(/[()\s]|and/g, "")) return null;
  const terms = [...text.matchAll(TERM)].map(
    (match) => [camel(match[1]!), params[Number(match[2]) - 1]] as const,
  );
  return (row: Record<string, any>) =>
    terms.every(([key, value]) => row[key] === value);
}

/**
 * Like `tryMatcher`, but throws on a where it cannot evaluate, so the fake
 * never quietly ignores a condition it does not understand.
 */
export function matcher(where: unknown) {
  const keep = tryMatcher(where);
  if (!keep) {
    throw new Error(`The fake database cannot evaluate: ${render(where).sql}`);
  }
  return keep;
}

/**
 * A `db.select` stand-in that mirrors drizzle's builder closely enough for the
 * chains the routers use: .from().innerJoin().where().orderBy().limit(),
 * .where().groupBy(), an awaited .where(), and .where().for("update"). Every
 * terminal resolves to `rowsOf(table in .from())`.
 */
export const tableSelectChain =
  (rowsOf: (table: unknown) => unknown[]) => () => {
    let from: unknown;
    const rows = () => Promise.resolve(rowsOf(from));
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

type Mock = (...args: any[]) => any;

// A write is awaitable and chains `.returning()`. `record` is told what ran,
// and what it returns is what the write resolves to.
const written = (val: unknown) =>
  Object.assign(Promise.resolve(val), {
    returning: vi.fn().mockResolvedValue(val),
  });

/** `db.insert(t).values(v)`; `upsert` adds `.onConflictDoUpdate(...)`. */
export const insertStub =
  (record: Mock, { upsert = false } = {}) =>
  (...insertArgs: any[]) => ({
    values: (...valArgs: any[]) => {
      const val = record("insert", insertArgs, valArgs);
      return Object.assign(
        written(val),
        upsert && {
          onConflictDoUpdate: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockResolvedValue(val),
          })),
        },
      );
    },
  });

/** `db.update(t).set(v).where(w)`. */
export const updateStub =
  (record: Mock) =>
  (...updateArgs: any[]) => ({
    set: (...setArgs: any[]) => ({
      where: (...wArgs: any[]) =>
        written(record("update", updateArgs, setArgs, wArgs)),
    }),
  });

/** `db.delete(t).where(w)`. */
export const deleteStub =
  (record: Mock) =>
  (...deleteArgs: any[]) => ({
    where: (...wArgs: any[]) => written(record("delete", deleteArgs, wArgs)),
  });

// Column maps of tables the routers read at module scope, so a mocked
// `@query/db` that stops short of them would break loading the root.
export const bootcampWorkshopColumns = {
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
};

export const eventColumns = {
  id: "id",
  title: "title",
  qrCode: "qr_code",
  checkInEnabled: "check_in_enabled",
  eventDate: "event_date",
  currentCheckIns: "current_check_ins",
};
