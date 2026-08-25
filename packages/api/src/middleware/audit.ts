import { auditLogs } from "@query/db";
import { and, lt, ne } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

// How long a security or admin event is kept. Retention used to run from a
// GitHub Actions cron hitting a public route with a bearer secret — three
// moving parts for a job whose content is two DELETEs, and if the workflow
// was disabled or the secret rotated it stopped silently. It is tied to
// writes now: audit rows only accumulate when something writes them, so
// pruning on write is self-regulating.
const RETAIN_DAYS = 90;
/** Critical events outlive the routine window; they are the ones worth keeping. */
const RETAIN_CRITICAL_DAYS = 365;

/** At most one prune per process per interval, however many rows are written. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const cutoff = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Holds the "have we pruned recently" state that decides whether a write also
// triggers retention. Two loose module flags could be touched by any code in
// the file; the throttle only works if nothing else can.
export class AuditRetention {
  private lastPruneAt = 0;
  private inFlight = false;

  constructor(private readonly intervalMs: number = PRUNE_INTERVAL_MS) {}

  // Deletes expired audit rows, at most once per interval per process. Not
  // awaited and silent on failure: a full audit table is a much smaller problem
  // than an admin action that fails because housekeeping did.
  maybePrune(db: DrizzleDB) {
    const now = Date.now();
    if (this.inFlight || now - this.lastPruneAt < this.intervalMs) return;

    // Stamped before the await, so concurrent requests in the same process do not
    // all decide to prune at once.
    this.lastPruneAt = now;
    this.inFlight = true;

    void this.prune(db).finally(() => {
      this.inFlight = false;
    });
  }

  private async prune(db: DrizzleDB) {
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
    }
  }
}

const retention = new AuditRetention();

export const maybePruneAuditLogs = (db: DrizzleDB) => retention.maybePrune(db);

// Records an administrative action. `audit_logs` had a table, a reader and a
// severity enum, but its only writer was the security middleware's four
// rate-limit events — so every guard on the destructive paths had nothing
// behind it. Fire-and-forget: a delete that succeeded and went unrecorded is
// bad, but one refused because the logging table was busy is worse, and would
// be indistinguishable from the guard doing its job.
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
