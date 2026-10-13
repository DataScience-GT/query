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
import {
  and,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sum,
} from "drizzle-orm";
import {
  type DrizzleDB,
  hackathonEventAttendees,
  hackathonEvents,
  hackathonParticipants,
  hackathonProjects,
  hackathons,
  judgeVotes,
  judgingProjects,
  memberResumes,
  members,
  stripePayments,
} from "@query/db";
import { startOfEasternDay } from "./eastern-time";

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
  // 0.75, 1.5 and 2 exist for the tail specifically: a quantile is interpolated
  // inside whichever bucket it lands in, and p99 sits above p95, so with 1
  // and 2.5 adjacent the number the alert fires on was a straight line drawn
  // across the range where it actually lives. 2 and 5 are there because they
  // are the thresholds PortalApiSlow and PortalApiTailSlow fire on, and a
  // threshold with no edge under it is alerting on an interpolation.
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 5, 10],
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

// Live editions only: open (registration), closed (registration shut, event
// not finished), in progress (the weekend). A completed edition drops off on
// the next refresh, so last year does not sit on the dashboard as current.
// Same rule as the other gauges — counted from the database, so which instance
// Prometheus scraped does not matter.

const PARTICIPANT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "waitlisted",
  "checked_in",
] as const;

const participantGauge = new Gauge({
  name: "dsgt_hackathon_participants",
  help: "Registrations for a live hackathon edition, by status.",
  labelNames: ["edition", "phase", "status"] as const,
  registers: [registry],
});

const projectGauge = new Gauge({
  name: "dsgt_hackathon_projects",
  help: "Submitted projects for a live edition, excluding admin withdrawals and drafts.",
  labelNames: ["edition", "phase"] as const,
  registers: [registry],
});

const hackathonCheckinsToday = new Gauge({
  name: "dsgt_hackathon_checkins_today",
  help: "Hackathon badge scans since midnight Eastern, for a live edition.",
  labelNames: ["edition", "phase"] as const,
  registers: [registry],
});

const hackathonJudgingProjects = new Gauge({
  name: "dsgt_hackathon_judging_projects",
  help: "Projects on the judging floor for a live edition, excluding withdrawals.",
  labelNames: ["edition", "phase"] as const,
  registers: [registry],
});

const hackathonVotes = new Gauge({
  name: "dsgt_hackathon_votes",
  help: "Judge scores recorded for a live edition.",
  labelNames: ["edition", "phase"] as const,
  registers: [registry],
});

const hackathonJudgingActive = new Gauge({
  name: "dsgt_hackathon_judging_active",
  help: "1 when judging is switched on for a live edition, otherwise 0.",
  labelNames: ["edition", "phase"] as const,
  registers: [registry],
});

export type LiveHackathon = {
  edition: string;
  phase: string;
  judgingActive: boolean;
  projects: number;
  checkinsToday: number;
  judgingProjects: number;
  votes: number;
  participants: Record<(typeof PARTICIPANT_STATUSES)[number], number>;
};

const LIVE_PHASES = ["open", "closed", "in_progress"] as const;

const blankParticipants = (): LiveHackathon["participants"] => ({
  pending: 0,
  approved: 0,
  rejected: 0,
  waitlisted: 0,
  checked_in: 0,
});

const countByEdition = (
  rows: { hackathonId: string; total: number }[],
) => {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.hackathonId, Number(row.total));
  return totals;
};

// Shared with the admin analytics page. Prometheus is optional; the portal
// has to be able to show the same counts when nothing is scraping.
export async function readLiveHackathons(
  db: DrizzleDB,
  now = new Date(),
): Promise<LiveHackathon[]> {
  const startOfToday = startOfEasternDay(now);

  const editions = await db
    .select({
      id: hackathons.id,
      edition: hackathons.name,
      phase: hackathons.status,
      judgingActive: hackathons.judgingActive,
    })
    .from(hackathons)
    .where(inArray(hackathons.status, [...LIVE_PHASES]));

  if (editions.length === 0) return [];

  const ids = editions.map((edition) => edition.id);

  const [byStatus, projectRows, scanRows, judgingRows, voteRows] =
    await Promise.all([
      db
        .select({
          hackathonId: hackathonParticipants.hackathonId,
          status: hackathonParticipants.registrationStatus,
          total: count(),
        })
        .from(hackathonParticipants)
        .where(inArray(hackathonParticipants.hackathonId, ids))
        .groupBy(
          hackathonParticipants.hackathonId,
          hackathonParticipants.registrationStatus,
        ),
      db
        .select({
          hackathonId: hackathonProjects.hackathonId,
          total: count(),
        })
        .from(hackathonProjects)
        .where(
          and(
            inArray(hackathonProjects.hackathonId, ids),
            ne(hackathonProjects.status, "draft"),
            isNull(hackathonProjects.withdrawnByAdminAt),
          ),
        )
        .groupBy(hackathonProjects.hackathonId),
      db
        .select({
          hackathonId: hackathonEvents.hackathonId,
          total: count(),
        })
        .from(hackathonEventAttendees)
        .innerJoin(
          hackathonEvents,
          eq(hackathonEvents.id, hackathonEventAttendees.eventId),
        )
        .where(
          and(
            inArray(hackathonEvents.hackathonId, ids),
            gte(hackathonEventAttendees.checkedInAt, startOfToday),
          ),
        )
        .groupBy(hackathonEvents.hackathonId),
      db
        .select({
          hackathonId: judgingProjects.hackathonId,
          total: count(),
        })
        .from(judgingProjects)
        .where(
          and(
            inArray(judgingProjects.hackathonId, ids),
            isNull(judgingProjects.withdrawnAt),
          ),
        )
        .groupBy(judgingProjects.hackathonId),
      db
        .select({
          hackathonId: judgingProjects.hackathonId,
          total: count(),
        })
        .from(judgeVotes)
        .innerJoin(
          judgingProjects,
          eq(judgingProjects.id, judgeVotes.projectId),
        )
        .where(
          and(
            inArray(judgingProjects.hackathonId, ids),
            isNull(judgingProjects.withdrawnAt),
          ),
        )
        .groupBy(judgingProjects.hackathonId),
    ]);

  const participantsByEdition = new Map<string, LiveHackathon["participants"]>();
  for (const row of byStatus) {
    const bucket =
      participantsByEdition.get(row.hackathonId) ?? blankParticipants();
    if (row.status in bucket) bucket[row.status] = Number(row.total);
    participantsByEdition.set(row.hackathonId, bucket);
  }

  const projects = countByEdition(projectRows);
  const scans = countByEdition(scanRows);
  const judging = countByEdition(judgingRows);
  const votes = countByEdition(voteRows);

  return editions.map((edition) => ({
    edition: edition.edition,
    phase: edition.phase,
    judgingActive: edition.judgingActive,
    projects: projects.get(edition.id) ?? 0,
    checkinsToday: scans.get(edition.id) ?? 0,
    judgingProjects: judging.get(edition.id) ?? 0,
    votes: votes.get(edition.id) ?? 0,
    participants: participantsByEdition.get(edition.id) ?? blankParticipants(),
  }));
}

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
// module is pulled into the metrics route and the rule is a few lines. Read in
// Eastern time like currentTerm, or the label flips four hours early at the
// May and December boundaries. If the two disagree the gauge is mislabelled,
// nothing more.
/** Null metadata is a year. Anything that is not a JSON object is left out. */
function planFromMetadata(metadata: string | null) {
  if (metadata == null) return "annual";
  if (!metadata.startsWith("{")) return null;
  const parsed = JSON.parse(metadata) as { plan?: unknown };
  return typeof parsed.plan === "string" && parsed.plan ? parsed.plan : "annual";
}

const currentTermLabel = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return month <= 5 ? `${year}-spring` : `${year}-fall`;
};

// Recomputes the database-derived gauges, at most once a minute. Every query
// is a count behind an index-friendly predicate, and a failure leaves the
// previous values in place — metrics must never take a request path down.
export async function refreshDbGauges(db: DrizzleDB | null | undefined) {
  if (!db) return;

  await gaugeCache.refresh(async () => {
    try {
      const term = currentTermLabel();
      const now = new Date();

      const [
        [active],
        [lapsed],
        [bootcamp],
        [unlinked],
        paidRows,
        [resumeTotals],
      ] = await Promise.all([
        db
          .select({ total: count() })
          .from(members)
          .where(
            and(eq(members.isActive, true), gt(members.membershipEndDate, now)),
          ),
        db
          .select({ total: count() })
          .from(members)
          .where(
            and(
              isNotNull(members.membershipEndDate),
              lte(members.membershipEndDate, now),
            ),
          ),
        db
          .select({ total: count() })
          .from(members)
          .where(eq(members.bootcampTerm, term)),
        db
          .select({ total: count() })
          .from(stripePayments)
          .where(
            and(
              eq(stripePayments.paymentStatus, "paid"),
              isNull(stripePayments.linkedUserId),
            ),
          ),
        db
          .select({ metadata: stripePayments.metadata })
          .from(stripePayments)
          .where(eq(stripePayments.paymentStatus, "paid")),
        db
          .select({
            files: count(),
            bytes: sum(memberResumes.sizeBytes),
          })
          .from(memberResumes),
      ]);

      membersActive.set(Number(active?.total ?? 0));
      membersLapsed.set(Number(lapsed?.total ?? 0));
      bootcampEnrolled.set({ term }, Number(bootcamp?.total ?? 0));
      paymentsUnlinked.set(Number(unlinked?.total ?? 0));

      // Plan lives in the payment metadata string. Rows that are not JSON are
      // skipped; a missing plan is the only product that existed then, a year.
      // One unparseable object still fails the refresh, same as a bad cast did.
      const plans = new Map<string, number>();
      for (const row of paidRows) {
        const plan = planFromMetadata(row.metadata);
        if (!plan) continue;
        plans.set(plan, (plans.get(plan) ?? 0) + 1);
      }

      paymentsByPlan.reset();
      for (const [plan, total] of plans) {
        paymentsByPlan.set({ plan }, total);
      }

      resumesStored.set(Number(resumeTotals?.files ?? 0));
      resumeBytesStored.set(Number(resumeTotals?.bytes ?? 0));

      const live = await readLiveHackathons(db);

      // reset before set: an edition that left the live set has to disappear,
      // or the dashboard keeps yesterday's registration count.
      participantGauge.reset();
      projectGauge.reset();
      hackathonCheckinsToday.reset();
      hackathonJudgingProjects.reset();
      hackathonVotes.reset();
      hackathonJudgingActive.reset();

      for (const edition of live) {
        const labels = { edition: edition.edition, phase: edition.phase };
        projectGauge.set(labels, edition.projects);
        hackathonCheckinsToday.set(labels, edition.checkinsToday);
        hackathonJudgingProjects.set(labels, edition.judgingProjects);
        hackathonVotes.set(labels, edition.votes);
        hackathonJudgingActive.set(labels, edition.judgingActive ? 1 : 0);
        for (const status of PARTICIPANT_STATUSES) {
          participantGauge.set(
            { ...labels, status },
            edition.participants[status],
          );
        }
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
