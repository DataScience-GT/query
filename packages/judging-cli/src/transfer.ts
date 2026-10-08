import { readFile, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createDb, project, requireDatabaseUrl, result, resultRun, track } from "@query/judging-db";
import { formatResultsCsv, formatResultsJson, parseColumnMap, parseProjectCsv } from "./csv";

export async function importProjects(file: string, eventId: string, mapFile?: string) {
  const columnMap = mapFile ? parseColumnMap(await readFile(mapFile, "utf8")) : {};
  const rows = parseProjectCsv(await readFile(file, "utf8"), columnMap);
  const { db, pool } = createDb(requireDatabaseUrl());
  try {
    for (const row of rows) {
      const [found] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.eventId, eventId), eq(project.externalId, row.externalId)));
      if (found) {
        await db
          .update(project)
          .set({ name: row.name, teamName: row.teamName, tableNumber: row.tableNumber })
          .where(eq(project.id, found.id));
      } else {
        await db.insert(project).values({
          eventId,
          externalId: row.externalId,
          name: row.name,
          teamName: row.teamName,
          tableNumber: row.tableNumber,
        });
      }
    }
    return rows.length;
  } finally {
    await pool.end();
  }
}

export async function exportResults(
  eventId: string,
  file: string,
  format: "csv" | "json" = "csv",
) {
  const { db, pool } = createDb(requireDatabaseUrl());
  try {
    const [run] = await db
      .select({ id: resultRun.id })
      .from(resultRun)
      .where(eq(resultRun.eventId, eventId));
    if (!run) throw new Error("No result run for that event");
    const rows = await db
      .select({
        project: project.name,
        track: track.slug,
        placement: result.placement,
        score: result.score,
      })
      .from(result)
      .innerJoin(project, eq(project.id, result.projectId))
      .innerJoin(track, eq(track.id, result.trackId))
      .where(eq(result.runId, run.id));
    const body =
      format === "json" ? formatResultsJson(rows) : formatResultsCsv(rows);
    await writeFile(file, body);
    return rows.length;
  } finally {
    await pool.end();
  }
}
