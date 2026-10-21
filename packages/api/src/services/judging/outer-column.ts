import { getTableName, sql } from "drizzle-orm";
import type { Column, Table } from "drizzle-orm";

// A select from one table with no joins drops the table name from every
// column in a sql expression. In a correlated subquery the outer row's column
// then resolves to the subquery's own column of the same name, so the
// subquery compares its rows with themselves. Name the outer column with this
// instead; the query must read the table under its own name.
export const outerColumn = (table: Table, column: Column) =>
  sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`;
