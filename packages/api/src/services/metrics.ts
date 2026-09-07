// Metrics, in Prometheus exposition format. Counters and histograms are
// in-process, and App Hosting autoscales, so each scrape reads one arbitrary
// instance and a scale-down throws its numbers away — directionally useful,
// never exact. Gauges derived from the database are recomputed on scrape from
// shared state and are the ones worth alerting on. Nothing here writes to
// Postgres: the database is a 0.5 GB Neon instance, and the collectors are
// count(*) reads behind a 60-second cache.
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import { sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export const registry = new Registry();

// Process CPU, memory, event-loop lag, handles. Free, and the only thing here
// that says anything about the runtime itself.
collectDefaultMetrics({ register: registry, prefix: "dsgt_" });

/** Where a membership grant came from. Each is a separate failure mode. */
export type GrantSource =
  | "confirm"
  | "webhook_intent"
  | "webhook_checkout"
  | "reconcile"
  | "autolink"
  | "link"
  | "verify_email";

export const paymentIntents = new Counter({
  name: "dsgt_payment_intents_total",
  help: "Payment intents this app minted, by what was being bought.",
  labelNames: ["plan", "bootcamp", "addon_only"] as const,
  registers: [registry],
});

export const membershipGrants = new Counter({
  name: "dsgt_membership_grants_total",
  help: "Memberships granted, by the path that granted them.",
  labelNames: ["source", "plan"] as const,
  registers: [registry],
});

// The one that matters. Every grant path records the payment first and grants
// afterwards, so a failure here means money taken and nothing given —
// recoverable, but only if somebody knows to look.
export const membershipGrantFailures = new Counter({
  name: "dsgt_membership_grant_failures_total",
  help: "Grants that threw after the payment was already recorded.",
  labelNames: ["source"] as const,
  registers: [registry],
});

export const paymentsRecovered = new Counter({
  name: "dsgt_payments_recovered_total",
  help: "Charges reconcile found that this app had never recorded.",
  registers: [registry],
});

export const trpcDuration = new Histogram({
  name: "dsgt_trpc_duration_seconds",
  help: "Portal API call duration, by procedure and outcome.",
  labelNames: ["procedure", "type", "ok"] as const,
  // Tuned for a Neon round trip from a serverless instance, not for a CDN.
  // 0.75 and 1.5 exist for the tail specifically: a quantile is interpolated
  // inside whichever bucket it lands in, and p99 sits above p95, so with 1
  // and 2.5 adjacent the number the alert fires on was a straight line drawn
  // across the range where it actually lives.
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2.5, 5, 10],
  registers: [registry],
});

// Database-derived gauges. No `collect` hook, so they are never gathered
// implicitly: refreshDbGauges decides when a query may run, and the cache
// below is what keeps a scrape loop off the database.

const membersActive = new Gauge({
  name: "dsgt_members_active",
  help: "Members whose paid term has not run out.",
  registers: [registry],
});

const membersLapsed = new Gauge({
  name: "dsgt_members_lapsed",
  help: "Member rows whose term has run out.",
  registers: [registry],
});

const bootcampEnrolled = new Gauge({
  name: "dsgt_bootcamp_enrolled",
  help: "Members enrolled in the bootcamp for a given term.",
  labelNames: ["term"] as const,
  registers: [registry],
});

// Answers "was the $15 plan worth adding". Read from what was charged, not
// the member row — the plan is not a column, it rides on the payment.
const paymentsByPlan = new Gauge({
  name: "dsgt_payments_by_plan",
  help: "Paid payments, by the plan their metadata says was bought.",
  labelNames: ["plan"] as const,
  registers: [registry],
});

// Paid, and attached to nobody. Every one is a person charged with no
// membership, so it should sit at zero and any climb is a bug in the link
// paths rather than a busy day.
const paymentsUnlinked = new Gauge({
  name: "dsgt_payments_unlinked",
  help: "Payments marked paid that no account has claimed.",
  registers: [registry],
});

const resumesStored = new Gauge({
  name: "dsgt_resumes_stored",
  help: "Resumes on file.",
  registers: [registry],
});

// Read from the metadata rows, not from the bucket — this is what the club is
// paying Cloud Storage to hold, and it only ever grows.
const resumeBytesStored = new Gauge({
  name: "dsgt_resume_bytes_stored",
  help: "Bytes of resumes held in Cloud Storage.",
  registers: [registry],
});

const gaugeRefreshFailures = new Counter({
  name: "dsgt_metrics_refresh_failures_total",
  help: "Times the gauge collectors could not read the database.",
  registers: [registry],
});

/** Long enough that a 30s scrape loop cannot turn into a query loop. */
const GAUGE_TTL_MS = 60_000;

class GaugeCache {
  private lastRun = 0;
  private inFlight: Promise<void> | undefined;

  // One refresh at a time, and at most one per TTL. Prometheus scrapes on a
  // timer and a second scraper can land mid-flight; without the shared promise
  // each would start its own round of counts against a student-club database.
  async refresh(run: () => Promise<void>) {
    const now = Date.now();
    if (this.inFlight) return this.inFlight;
    if (now - this.lastRun < GAUGE_TTL_MS) return;

    this.inFlight = run()
      .then(() => {
        this.lastRun = Date.now();
      })
      .finally(() => {
        this.inFlight = undefined;
      });

    return this.inFlight;
  }
}

const gaugeCache = new GaugeCache();

// `2026-fall` — duplicated from @query/db rather than imported, because this
// module is pulled into the metrics route and the rule is three lines. If the
// two disagree the gauge is mislabelled, nothing more.
const currentTermLabel = (now = new Date()) =>
  now.getMonth() <= 4
    ? `${now.getFullYear()}-spring`
    : `${now.getFullYear()}-fall`;

// Recomputes the database-derived gauges, at most once a minute. Every query
// is a count behind an index-friendly predicate, and a failure leaves the
// previous values in place — metrics must never take a request path down.
export async function refreshDbGauges(db: DrizzleDB | null | undefined) {
  if (!db) return;

  await gaugeCache.refresh(async () => {
    try {
      const term = currentTermLabel();

      const totals = await db.execute<{
        active: string;
        lapsed: string;
        bootcamp: string;
        unlinked: string;
      }>(sql`
        select
          count(*) filter (
            where "is_active" and "membership_end_date" > now()
          ) as active,
          count(*) filter (
            where "membership_end_date" is not null
              and "membership_end_date" <= now()
          ) as lapsed,
          count(*) filter (where "bootcamp_term" = ${term}) as bootcamp,
          (
            select count(*) from "stripe_payment"
            where "payment_status" = 'paid' and "linked_user_id" is null
          ) as unlinked
        from "member"
      `);

      const counts = totals.rows[0];

      if (counts) {
        membersActive.set(Number(counts.active));
        membersLapsed.set(Number(counts.lapsed));
        bootcampEnrolled.set({ term }, Number(counts.bootcamp));
        paymentsUnlinked.set(Number(counts.unlinked));
      }

      // `like '{%'` before the jsonb cast, deliberately: one row of unparseable
      // metadata would error the whole statement, and rows written before the plan
      // existed have no `plan` key — those bought the only thing on offer, a year.
      const byPlan = await db.execute<{ plan: string; total: string }>(sql`
        select
          coalesce(("metadata"::jsonb ->> 'plan'), 'annual') as plan,
          count(*) as total
        from "stripe_payment"
        where "payment_status" = 'paid'
          and ("metadata" is null or "metadata" like '{%')
        group by 1
      `);

      paymentsByPlan.reset();
      for (const row of byPlan.rows) {
        paymentsByPlan.set({ plan: row.plan }, Number(row.total));
      }

      const resumes = await db.execute<{ files: string; bytes: string }>(sql`
        select count(*) as files, coalesce(sum("size_bytes"), 0) as bytes
        from "member_resume"
      `);

      const resumeTotals = resumes.rows[0];
      if (resumeTotals) {
        resumesStored.set(Number(resumeTotals.files));
        resumeBytesStored.set(Number(resumeTotals.bytes));
      }
    } catch {
      // Stale gauges beat a 500 on the scrape endpoint.
      gaugeRefreshFailures.inc();
    }
  });
}

/** The exposition text Prometheus reads. */
export const renderMetrics = () => registry.metrics();

export const metricsContentType = registry.contentType;
