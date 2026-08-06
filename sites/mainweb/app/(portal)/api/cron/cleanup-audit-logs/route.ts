import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, lt, ne } from "drizzle-orm";
import { db, auditLogs } from "@query/db";

/**
 * How long a security event is kept. This ran weekly as an unqualified
 * `db.delete(auditLogs)` — a truncate, not a cleanup — so the effective
 * retention for every injection attempt, auth failure and rate-limit trip was
 * however long it had been since Monday. An investigation into anything older
 * than that had nothing left to read.
 */
const RETAIN_DAYS = 90;
/** Critical events outlive the routine window; they are the ones worth keeping. */
const RETAIN_CRITICAL_DAYS = 365;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db)
    return NextResponse.json({ error: "DB not initialized" }, { status: 500 });

  const cutoff = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Both bound on created_at, which audit_created_at_idx covers.
  const routine = await db
    .delete(auditLogs)
    .where(
      and(
        lt(auditLogs.createdAt, cutoff(RETAIN_DAYS)),
        ne(auditLogs.severity, "critical"),
      ),
    )
    .returning({ id: auditLogs.id });

  const critical = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(RETAIN_CRITICAL_DAYS)))
    .returning({ id: auditLogs.id });

  return NextResponse.json({
    ok: true,
    deleted: routine.length + critical.length,
  });
}
