import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";
import { judgingEvaluations } from "@query/db";
import { holdsEveryRating } from "./scoring-sql";

const HACK = "11111111-1111-4111-8111-111111111111";

// Built with a handle that has no connection: only the SQL text is looked at.
const db = drizzle.mock();

/** The SQL with its spacing and parameter numbers evened out. */
const flat = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .replace(/\$\d+/g, "$?");

// An evaluation holds every rating when its ratings are at least as many as
// the rubric's rating items: scoring.hasEveryRating, in SQL.
const RULE =
  'select count(*) from "judging_evaluation_rating" as r where r."evaluation_id" = "judging_evaluation"."id"';
const ITEMS =
  'select count(*) from "judging_rubric_item" as i where i."hackathon_id" = $? and i."kind" = \'rating\'';
const HOLDS = `(${RULE}) >= (${ITEMS})`;

describe("holdsEveryRating", () => {
  it("counts the evaluation's ratings against the rubric's rating items", () => {
    const query = db
      .select({ id: judgingEvaluations.id })
      .from(judgingEvaluations)
      .where(
        and(eq(judgingEvaluations.hackathonId, HACK), holdsEveryRating(HACK)),
      )
      .toSQL();

    const text = flat(query.sql);
    expect(text).toContain(HOLDS);
    expect(query.params).toEqual([HACK, HACK]);
    // Whether a written response was left empty is not looked at.
    expect(text).not.toContain("judging_evaluation_response");
    expect(text).not.toContain("is_complete");
  });

  it("keeps its table names in a select from the one table, which strips them from columns", () => {
    // A sql field over a single table loses the table name from any column in
    // it. The names here are not columns, so the subquery still correlates on
    // the evaluation's id and not on its own.
    const counted = db
      .select({
        total: sql<number>`count(*)::int`,
        complete: sql<number>`count(*) filter (where ${holdsEveryRating(HACK)})::int`,
        holds: holdsEveryRating(HACK),
      })
      .from(judgingEvaluations)
      .where(eq(judgingEvaluations.hackathonId, HACK))
      .toSQL();

    const text = flat(counted.sql);
    expect(text.split(HOLDS)).toHaveLength(3);
    expect(counted.params).toEqual([HACK, HACK, HACK]);
  });

  it("stands beside other conditions on the same evaluations", () => {
    const query = db
      .select({ id: judgingEvaluations.id })
      .from(judgingEvaluations)
      .where(
        and(
          inArray(judgingEvaluations.entryId, ["a", "b"]),
          holdsEveryRating(HACK),
        ),
      )
      .toSQL();
    expect(query.sql).toContain('"judging_evaluation"."entry_id" in ($1, $2)');
    expect(query.params).toEqual(["a", "b", HACK]);
  });
});
