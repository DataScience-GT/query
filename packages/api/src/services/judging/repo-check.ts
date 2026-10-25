// Late-push check. When an organiser turns it on for an edition, each project's
// GitHub repo is looked at and flagged if it was pushed to after the submission
// deadline. The signal is GitHub's own `pushed_at` (any branch), never commit
// dates, which come from the hacker's machine and can be set to anything. The
// commits and pushes after the deadline are kept as evidence for the organiser;
// they do not decide anything. Nothing is disqualified here: this only raises
// flags, and a flag waits for an organiser (admin/repo-check.ts).
//
// There is no worker. judging.admin.overview calls repoCheckIfDue, which starts
// a run in the background at most every 15 minutes, so a poll never waits on
// GitHub and the next one sees the results.

import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  hackathonProjects,
  judgingConfigs,
  judgingEntries,
  judgingRepoChecks,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  computeSubmissionWindow,
  loadHackathonBaseTime,
} from "../../routers/team/windows";

export type RepoRef = { owner: string; repo: string };
export type RepoOutcome = "ok" | "late" | "no_repo" | "unreadable" | "error";
export type RepoEvidence = NonNullable<
  typeof judgingRepoChecks.$inferSelect.evidence
>;
export type RepoCheckRow = typeof judgingRepoChecks.$inferSelect;

export type RepoResult = {
  outcome: RepoOutcome;
  ref: RepoRef | null;
  pushedAt: Date | null;
  evidence: RepoEvidence | null;
};

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IN_FLIGHT = 5;
const EVIDENCE_LIMIT = 20;
export const REPO_CHECK_EVERY_MS = 15 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// First path segments on github.com that are pages, not accounts.
const NOT_AN_OWNER = new Set([
  "about",
  "apps",
  "collections",
  "enterprise",
  "explore",
  "features",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "search",
  "settings",
  "sponsors",
  "topics",
  "trending",
  "users",
]);
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * `owner/repo` from a github.com link, or null. Anything after the repo
 * (`/tree/main`, `/issues`, a query or hash) and a trailing `.git` are ignored;
 * a profile, an organisation page or any other host is not a repo.
 */
export function parseRepoUrl(raw: string | null | undefined): RepoRef | null {
  const text = raw?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }
  const [owner, name] = url.pathname.split("/").filter(Boolean);
  if (!owner || !name) return null;
  const repo = name.replace(/\.git$/i, "");
  if (!OWNER.test(owner) || NOT_AN_OWNER.has(owner.toLowerCase())) return null;
  if (!REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** The portal project's repo link, else the first repo link among the demo links. */
export function repoOfEntry(entry: {
  githubUrl: string | null;
  demoLinks: readonly string[];
}): RepoRef | null {
  const own = parseRepoUrl(entry.githubUrl);
  if (own) return own;
  for (const link of entry.demoLinks) {
    const found = parseRepoUrl(link);
    if (found) return found;
  }
  return null;
}

/** Later than the deadline plus grace. A push exactly on the line is on time. */
export function isLate(pushedAt: Date, deadline: Date, graceMinutes: number) {
  return pushedAt.getTime() > deadline.getTime() + graceMinutes * MINUTE_MS;
}

/** GitHub said to slow down, or the budget for this run is spent. */
export class RateLimited extends Error {}

type GithubReply = { status: number; body: unknown };

/**
 * A GitHub REST client for one run. Once the rate limit is hit or the last
 * request used it up, every further call throws RateLimited without a request.
 */
export class GithubClient {
  exhausted = false;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly token: string | undefined,
  ) {}

  async get(path: string): Promise<GithubReply> {
    if (this.exhausted) throw new RateLimited("rate limited");
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "query-judging-repo-check",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await this.fetchFn(`${GITHUB_API}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") this.exhausted = true;

    const limited =
      response.status === 429 ||
      (response.status === 403 &&
        (remaining === "0" || response.headers.has("retry-after")));
    if (limited) {
      this.exhausted = true;
      throw new RateLimited("rate limited");
    }
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}

// GitHub's JSON is read defensively: a field that is not what it should be
// reads as missing.
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : null);

/** Commits and pushes after the deadline. Context only; a failure leaves it short. */
async function gatherEvidence(
  client: GithubClient,
  ref: RepoRef,
  deadline: Date,
): Promise<RepoEvidence> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const evidence: RepoEvidence = { commits: [], pushes: [] };
  try {
    const commits = await client.get(
      `${base}/commits?since=${encodeURIComponent(deadline.toISOString())}&per_page=${EVIDENCE_LIMIT}`,
    );
    if (commits.status === 200 && Array.isArray(commits.body)) {
      evidence.commits = commits.body.slice(0, EVIDENCE_LIMIT).map((item) => {
        const c = obj(item);
        const commit = obj(c.commit);
        return {
          sha: text(c.sha) ?? "",
          message: (text(commit.message) ?? "").split("\n")[0]!.slice(0, 200),
          author: text(obj(commit.author).name),
          committedAt: text(obj(commit.committer).date),
          url: text(c.html_url) ?? "",
        };
      });
    }
  } catch {
    // Evidence is optional: pushed_at has already decided.
  }
  try {
    const events = await client.get(`${base}/events?per_page=100`);
    if (events.status === 200 && Array.isArray(events.body)) {
      evidence.pushes = events.body
        .map(obj)
        .filter((e) => {
          const at = text(e.created_at);
          return e.type === "PushEvent" && at !== null && new Date(at) > deadline;
        })
        .slice(0, EVIDENCE_LIMIT)
        .map((e) => ({
          at: text(e.created_at)!,
          ref: text(obj(e.payload).ref),
          pusher: text(obj(e.actor).login),
        }));
    }
  } catch {
    // Same.
  }
  return evidence;
}

/**
 * One repo against the deadline. Throws RateLimited when GitHub says to stop;
 * any other failure to reach it is an `error`, tried again next run.
 */
export async function checkRepo(
  client: GithubClient,
  ref: RepoRef,
  deadline: Date,
  graceMinutes: number,
): Promise<RepoResult> {
  let reply: GithubReply;
  try {
    reply = await client.get(`/repos/${ref.owner}/${ref.repo}`);
  } catch (error) {
    if (error instanceof RateLimited) throw error;
    return { outcome: "error", ref, pushedAt: null, evidence: null };
  }
  if ([401, 403, 404, 410, 451].includes(reply.status)) {
    return { outcome: "unreadable", ref, pushedAt: null, evidence: null };
  }
  const pushed = obj(reply.body).pushed_at;
  if (reply.status !== 200 || (pushed != null && typeof pushed !== "string")) {
    return { outcome: "error", ref, pushedAt: null, evidence: null };
  }
  // An empty repo has never been pushed to.
  const pushedAt = pushed ? new Date(pushed) : null;
  if (!pushedAt || !isLate(pushedAt, deadline, graceMinutes)) {
    return { outcome: "ok", ref, pushedAt, evidence: null };
  }
  return {
    outcome: "late",
    ref,
    pushedAt,
    evidence: await gatherEvidence(client, ref, deadline),
  };
}

/**
 * The row to store after a check, or null to leave what is there. An entry an
 * organiser has decided stays decided unless the repo was pushed to after the
 * decision, which reopens it as pending with the new evidence; a check that
 * could not look (error, unreadable, no repo) never undoes a decision.
 */
export function nextCheck(
  existing: RepoCheckRow | undefined,
  result: RepoResult,
  checkedAt: Date,
): Omit<RepoCheckRow, "entryId" | "hackathonId"> | null {
  const fresh = {
    repoOwner: result.ref?.owner ?? null,
    repoName: result.ref?.repo ?? null,
    outcome: result.outcome,
    pushedAt: result.pushedAt,
    evidence: result.evidence,
    checkedAt,
    decision: "pending" as const,
    decidedById: null,
    decidedAt: null,
    note: null,
    removedEntry: existing?.removedEntry ?? false,
  };
  if (!existing || existing.decision === "pending") return fresh;
  const pushedSince =
    result.outcome === "late" &&
    result.pushedAt !== null &&
    existing.decidedAt !== null &&
    result.pushedAt > existing.decidedAt;
  return pushedSince ? fresh : null;
}

/** `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

type RunDeps = { fetchFn?: typeof fetch; token?: string; now?: Date };

/** Editions with a run going in this process, so two never overlap. */
const running = new Set<string>();

export const repoCheckRunning = (hackathonId: string) =>
  running.has(hackathonId);

/**
 * Checks every project of the edition, five repos at a time. When GitHub's rate
 * limit runs out the rest are recorded as `error` (unless they already carry a
 * decision) and the next run picks them up.
 */
export async function runRepoCheck(
  db: DrizzleDB,
  hackathonId: string,
  deps: RunDeps = {},
) {
  if (running.has(hackathonId)) return;
  running.add(hackathonId);
  try {
    const now = deps.now ?? new Date();
    const [config] = await db
      .select({ graceMinutes: judgingConfigs.repoCheckGraceMinutes })
      .from(judgingConfigs)
      .where(eq(judgingConfigs.hackathonId, hackathonId))
      .limit(1);
    if (!config) return;
    const base = await loadHackathonBaseTime(db, hackathonId);
    const deadline = computeSubmissionWindow(base, now).closesAt;

    const [entries, existing] = await Promise.all([
      db
        .select({
          id: judgingEntries.id,
          deletedAt: judgingEntries.deletedAt,
          demoLinks: judgingEntries.demoLinks,
          githubUrl: hackathonProjects.githubUrl,
        })
        .from(judgingEntries)
        .leftJoin(
          hackathonProjects,
          eq(hackathonProjects.id, judgingEntries.sourceProjectId),
        )
        .where(eq(judgingEntries.hackathonId, hackathonId)),
      db
        .select()
        .from(judgingRepoChecks)
        .where(eq(judgingRepoChecks.hackathonId, hackathonId)),
    ]);
    const before = new Map(existing.map((row) => [row.entryId, row]));
    // A removed project is looked at only if it was disqualified here, to see
    // whether it was pushed to again.
    const todo = entries.filter(
      (entry) =>
        !entry.deletedAt || before.get(entry.id)?.decision === "disqualified",
    );

    const client = new GithubClient(
      deps.fetchFn ?? fetch,
      deps.token ?? (process.env.GITHUB_TOKEN || undefined),
    );
    await mapLimit(todo, MAX_IN_FLIGHT, async (entry) => {
      const ref = repoOfEntry(entry);
      let result: RepoResult;
      if (!ref) {
        result = { outcome: "no_repo", ref: null, pushedAt: null, evidence: null };
      } else {
        try {
          result = await checkRepo(client, ref, deadline, config.graceMinutes);
        } catch (error) {
          if (!(error instanceof RateLimited)) throw error;
          result = { outcome: "error", ref, pushedAt: null, evidence: null };
        }
      }
      const row = nextCheck(before.get(entry.id), result, now);
      if (!row) return;
      await db
        .insert(judgingRepoChecks)
        .values({ entryId: entry.id, hackathonId, ...row })
        .onConflictDoUpdate({ target: judgingRepoChecks.entryId, set: row });
    });
  } catch (error) {
    // Deliberate operational logging: nothing awaits a background run, so this
    // is the only record that it failed. The next run starts afresh.
    // eslint-disable-next-line no-console
    console.error(`[Judging] Repo check for ${hackathonId} failed:`, error);
  } finally {
    running.delete(hackathonId);
  }
}

/** When each edition's run was last started in this process. */
export const repoCheckThrottle = new Map<string, number>();

/**
 * Starts a run in the background unless one was started less than 15 minutes
 * ago, here or on another instance (the claim on the config row), the switch
 * is off, or judging is not open. Resolves once the run is under way, with a
 * handle to its end for tests; callers on a read do not wait for it. Never
 * throws.
 */
export async function repoCheckIfDue(
  db: DrizzleDB,
  hackathonId: string,
  now: Date = new Date(),
  deps: RunDeps = {},
): Promise<{ done: Promise<void> } | undefined> {
  const last = repoCheckThrottle.get(hackathonId);
  if (last !== undefined && now.getTime() - last < REPO_CHECK_EVERY_MS) return;
  repoCheckThrottle.set(hackathonId, now.getTime());
  try {
    const [claimed] = await db
      .update(judgingConfigs)
      .set({ repoCheckLastRunAt: now })
      .where(
        and(
          eq(judgingConfigs.hackathonId, hackathonId),
          eq(judgingConfigs.repoCheckEnabled, true),
          eq(judgingConfigs.state, "open"),
          or(
            isNull(judgingConfigs.repoCheckLastRunAt),
            lt(
              judgingConfigs.repoCheckLastRunAt,
              new Date(now.getTime() - REPO_CHECK_EVERY_MS),
            ),
          ),
        ),
      )
      .returning({ hackathonId: judgingConfigs.hackathonId });
    if (!claimed) return;
    return { done: runRepoCheck(db, hackathonId, { ...deps, now }) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Judging] Repo check for ${hackathonId} failed:`, error);
  }
}
