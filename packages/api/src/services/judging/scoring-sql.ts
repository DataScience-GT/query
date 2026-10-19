import { getTableName, sql } from "drizzle-orm";
import {
  judgingEvaluationRatings,
  judgingEvaluations,
  judgingRubricItems,
} from "@query/db";

// scoring.hasEveryRating for the queries that count evaluations in the
// database instead of loading them. The same rule, so a count an organiser or
// a hacker reads is the number placings rank on: an evaluation counts once it
// holds a rating for every rating item of the rubric, whether or not a written
// response was left empty.
//
// Names are spelled out rather than passed as columns. A select from one table
// with no joins drops the table name from any column in a sql expression, and
// the subquery would then compare its own columns with each other.

/**
 * True for a judging_evaluation row of the edition that holds every rating.
 * The query must read judging_evaluation under its own name, as every query
 * that uses this does.
 */
export const holdsEveryRating = (hackathonId: string) => {
  const evaluation = sql.identifier(getTableName(judgingEvaluations));
  return sql<boolean>`(
  select count(*) from ${judgingEvaluationRatings} as r
  where r.${sql.identifier(judgingEvaluationRatings.evaluationId.name)} = ${evaluation}.${sql.identifier(judgingEvaluations.id.name)}
) >= (
  select count(*) from ${judgingRubricItems} as i
  where i.${sql.identifier(judgingRubricItems.hackathonId.name)} = ${hackathonId}
  and i.${sql.identifier(judgingRubricItems.kind.name)} = 'rating'
)`;
};
