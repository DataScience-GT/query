import { auditLogs } from "@query/db";
import { and, lt, ne } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

/**
 * How long a security or admin event is kept.
 *
 * Retention used to run from a GitHub Actions cron hitting a public route with
 * a bearer secret. That is three moving parts — a schedule, a shared secret,
 * and an internet-reachable endpoint whose only protection is that secret —
 * for a job whose entire content is two DELETEs. If the workflow was disabled,
 * the repo was renamed, or the secret rotated, retention stopped silently and
 * nothing anywhere reported it.
 *
 * Retention is now tied to writes instead. Audit rows only accumulate when
 * something writes them, so pruning on write is self-regulating: a busy period
 * prunes often, an idle one has nothing to prune. No scheduler, no endpoint,
 * no secret.
 */
const RETAIN_DAYS = 90;
/** Critical events outlive the routine window; they are the ones worth keeping. */
const RETAIN_CRITICAL_DAYS = 365;

/** At most one prune per process per interval, however many rows are written. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPruneAt = 0;
let pruneInFlight = false;

const cutoff = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Deletes expired audit rows, at most hourly per process.
 *
 * Deliberately not awaited by callers and deliberately silent on failure:
 * retention is housekeeping, and a full audit table is a much smaller problem
 * than an admin action that fails because housekeeping did.
 */
export const maybePruneAuditLogs = (db: DrizzleDB) => {
  const now = Date.now();
  if (pruneInFlight || now - lastPruneAt < PRUNE_INTERVAL_MS) return;

  // Stamped before the await, so concurrent requests in the same process do
  // not all decide to prune at once.
  lastPruneAt = now;
  pruneInFlight = true;

  void (async () => {
    try {
      // Both bound on created_at, which audit_created_at_idx covers.
      await db
        .delete(auditLogs)
        .where(
          and(
            lt(auditLogs.createdAt, cutoff(RETAIN_DAYS)),
            ne(auditLogs.severity, "critical"),
          ),
        );

      await db
        .delete(auditLogs)
        .where(lt(auditLogs.createdAt, cutoff(RETAIN_CRITICAL_DAYS)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Audit] Retention prune failed:", error);
    } finally {
      pruneInFlight = false;
    }
  })();
};

/**
 * Records an administrative action.
 *
 * `audit_logs` already had a table, an admin reader and a severity enum, but
 * its only writer was the security middleware's four rate-limit event types —
 * so every guard on the destructive paths was the last line of defence with
 * nothing behind it. When somebody forces past a confirmation at 2am, this is
 * the only thing that can say who, what and when afterwards.
 *
 * Deliberately fire-and-forget: an audit write must never be the reason an
 * organiser's action fails. A delete that succeeded and went unrecorded is bad;
 * a delete that was refused because the logging table was busy is worse, and
 * would be indistinguishable from the guard doing its job.
 */
export const recordAdminAction = async (
  db: DrizzleDB,
  entry: {
    userId: string | null | undefined;
    action: string;
    resourceId?: string | null;
    /** `critical` for anything irreversible or forced past a refusal. */
    severity?: "info" | "warn" | "critical";
    metadata?: Record<string, unknown>;
  },
) => {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      resourceId: entry.resourceId ?? null,
      severity: entry.severity ?? "info",
      metadata: entry.metadata ?? {},
    });

    // Housekeeping rides along with the write that created the need for it.
    maybePruneAuditLogs(db);
  } catch (error) {
    // Deliberate server-side logging: if the audit trail itself cannot be
    // written, the console is the only remaining record that it was tried.
    // eslint-disable-next-line no-console
    console.error(`[Audit] Failed to record "${entry.action}":`, error);
  }
};
