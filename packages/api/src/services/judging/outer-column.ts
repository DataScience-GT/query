import { getTableName, sql } from "drizzle-orm";
import type { Column, Table } from "drizzle-orm";

// Drizzle 0.x dropped the table name from every column in a sql expression of
// a one-table select with no joins. In a correlated subquery the outer row's
// column then resolved to the subquery's own column of the same name, so the
// subquery compared its rows with themselves. Drizzle 1.0 keeps the table
// name, so a plain column correlates correctly now; this stays as an explicit
// name for the outer column. The query must read the table under its own name.
export const outerColumn = (table: Table, column: Column) =>
  sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`;
