import { PgDialect } from "drizzle-orm/pg-core";

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
 * `and`. Anything else throws, so the fake never quietly ignores a condition
 * it does not understand.
 */
export function matcher(where: unknown) {
  const { sql: text, params } = render(where);
  const terms = [...text.matchAll(TERM)].map(
    (match) => [camel(match[1]!), params[Number(match[2]) - 1]] as const,
  );
  if (text.replace(TERM, "").replace(/[()\s]|and/g, "")) {
    throw new Error(`The fake database cannot evaluate: ${text}`);
  }
  return (row: Record<string, any>) =>
    terms.every(([key, value]) => row[key] === value);
}

/**
 * A `db.select` stand-in that mirrors drizzle's builder closely enough for the
 * chains the routers use: .from().innerJoin().where().orderBy().limit(),
 * .where().groupBy(), an awaited .where(), and .where().for("update"). Every
 * terminal resolves to `rowsOf(table in .from())`.
 */
export const tableSelectChain = (rowsOf: (table: unknown) => unknown[]) => () => {
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
