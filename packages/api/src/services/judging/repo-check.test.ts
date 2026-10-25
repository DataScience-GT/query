import { afterEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { judgingConfigs, judgingEntries, judgingRepoChecks } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  GithubClient,
  REPO_CHECK_EVERY_MS,
  checkRepo,
  isLate,
  nextCheck,
  checkEntry,
  parseRepoUrl,
  repoCheckIfDue,
  repoCheckThrottle,
  reposOfEntry,
  runRepoCheck,
  settle,
} from "./repo-check";
import type { RepoCheckRow, RepoResult } from "./repo-check";

// The edition lock is a row lock; there is nothing to hold in a fake.
vi.mock("./challenges", () => ({ lockEdition: async () => undefined }));

const HACK = "hackathon";
const DEADLINE = new Date("2026-02-08T12:00:00Z");
const MINUTE = 60 * 1000;
const ref = { owner: "team", repo: "app" };

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that answers by URL substring, in the order the rules are given. */
function fakeFetch(rules: [string, Reply | (() => Reply)][]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string> });
    const rule = rules.find(([part]) => url.includes(part));
    const reply = rule ? (typeof rule[1] === "function" ? rule[1]() : rule[1]) : {};
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const repoReply = (pushedAt: string | null): Reply => ({
  body: { pushed_at: pushedAt },
});

describe("parseRepoUrl", () => {
  it("reads owner and repo from the usual links", () => {
    expect(parseRepoUrl("https://github.com/team/app")).toEqual(ref);
    expect(parseRepoUrl("https://www.github.com/team/app/")).toEqual(ref);
    expect(parseRepoUrl("http://github.com/team/app")).toEqual(ref);
    expect(parseRepoUrl("github.com/team/app")).toEqual(ref);
    expect(parseRepoUrl("  https://github.com/team/app  ")).toEqual(ref);
  });

  it("drops .git, trailing paths, queries and hashes", () => {
    expect(parseRepoUrl("https://github.com/team/app.git")).toEqual(ref);
    expect(parseRepoUrl("https://github.com/team/app/tree/main/src")).toEqual(ref);
    expect(parseRepoUrl("https://github.com/team/app/issues/3?x=1#top")).toEqual(
      ref,
    );
    expect(parseRepoUrl("https://github.com/team/my.app-v2_x")).toEqual({
      owner: "team",
      repo: "my.app-v2_x",
    });
  });

  it("is not fooled by other hosts or look-alikes", () => {
    expect(parseRepoUrl("https://gitlab.com/team/app")).toBeNull();
    expect(parseRepoUrl("https://github.com.evil.io/team/app")).toBeNull();
    expect(parseRepoUrl("https://evil.io/github.com/team/app")).toBeNull();
    expect(parseRepoUrl("https://gist.github.com/team/abc")).toBeNull();
    expect(parseRepoUrl("ftp://github.com/team/app")).toBeNull();
    expect(parseRepoUrl("https://team.github.io/app")).toBeNull();
  });

  it("refuses links that are not a repo", () => {
    expect(parseRepoUrl("https://github.com/team")).toBeNull();
    expect(parseRepoUrl("https://github.com/")).toBeNull();
    expect(parseRepoUrl("https://github.com/orgs/team/people")).toBeNull();
    expect(parseRepoUrl("https://github.com/settings/profile")).toBeNull();
    expect(parseRepoUrl("https://github.com/team/..")).toBeNull();
    expect(parseRepoUrl("https://github.com/-bad/app")).toBeNull();
    expect(parseRepoUrl("https://github.com/team/ap p")).toBeNull();
    expect(parseRepoUrl("not a url")).toBeNull();
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
    expect(parseRepoUrl(undefined)).toBeNull();
  });
});

describe("reposOfEntry", () => {
  it("puts the portal project's link first", () => {
    expect(
      reposOfEntry({
        githubUrl: "https://github.com/team/app",
        demoLinks: ["https://github.com/other/thing"],
      }),
    ).toEqual([ref, { owner: "other", repo: "thing" }]);
  });

  it("takes the repo links among the demo links and skips the rest", () => {
    expect(
      reposOfEntry({
        githubUrl: null,
        demoLinks: [
          "https://devpost.com/software/app",
          "https://github.com/team",
          "https://github.com/team/app/tree/dev",
        ],
      }),
    ).toEqual([ref]);
  });

  it("lists a repo once however it is linked", () => {
    expect(
      reposOfEntry({
        githubUrl: "https://github.com/team/app",
        demoLinks: [
          "https://github.com/Team/App.git",
          "https://github.com/team/app/issues",
        ],
      }),
    ).toEqual([ref]);
  });

  it("uses the demo links when the project's own link is not a repo", () => {
    expect(
      reposOfEntry({
        githubUrl: "https://github.com/team",
        demoLinks: ["https://github.com/team/app"],
      }),
    ).toEqual([ref]);
  });

  it("stops at three", () => {
    expect(
      reposOfEntry({
        githubUrl: null,
        demoLinks: [1, 2, 3, 4, 5].map((n) => `https://github.com/t/r${n}`),
      }).map((r) => r.repo),
    ).toEqual(["r1", "r2", "r3"]);
  });

  it("is empty with no repo anywhere", () => {
    expect(reposOfEntry({ githubUrl: null, demoLinks: [] })).toEqual([]);
    expect(
      reposOfEntry({ githubUrl: "", demoLinks: ["https://example.com"] }),
    ).toEqual([]);
  });
});

describe("isLate", () => {
  it("flags only a push after the deadline", () => {
    expect(isLate(new Date(DEADLINE.getTime() - 1), DEADLINE, 0)).toBe(false);
    expect(isLate(DEADLINE, DEADLINE, 0)).toBe(false);
    expect(isLate(new Date(DEADLINE.getTime() + 1), DEADLINE, 0)).toBe(true);
  });

  it("adds the grace, and a push on its last millisecond is on time", () => {
    const edge = new Date(DEADLINE.getTime() + 15 * MINUTE);
    expect(isLate(edge, DEADLINE, 15)).toBe(false);
    expect(isLate(new Date(edge.getTime() + 1), DEADLINE, 15)).toBe(true);
    expect(isLate(new Date(DEADLINE.getTime() + 10 * MINUTE), DEADLINE, 15)).toBe(
      false,
    );
  });
});

describe("checkRepo", () => {
  const run = (rules: Parameters<typeof fakeFetch>[0], grace = 0, token?: string) => {
    const fetched = fakeFetch(rules);
    const client = new GithubClient(fetched.fn, token);
    return { fetched, client, result: checkRepo(client, ref, DEADLINE, grace) };
  };

  it("is ok when the last push was before the deadline", async () => {
    const { fetched, result } = run([
      ["/repos/team/app", repoReply("2026-02-08T11:59:59Z")],
    ]);
    await expect(result).resolves.toMatchObject({
      outcome: "ok",
      pushedAt: new Date("2026-02-08T11:59:59Z"),
      evidence: null,
    });
    expect(fetched.calls).toHaveLength(1);
  });

  it("is ok for a push exactly on the deadline, and for an empty repo", async () => {
    await expect(
      run([["/repos/team/app", repoReply("2026-02-08T12:00:00Z")]]).result,
    ).resolves.toMatchObject({ outcome: "ok" });
    await expect(
      run([["/repos/team/app", repoReply(null)]]).result,
    ).resolves.toMatchObject({ outcome: "ok", pushedAt: null });
  });

  it("is ok inside the grace and late one second past it", async () => {
    await expect(
      run([["/repos/team/app", repoReply("2026-02-08T12:15:00Z")]], 15).result,
    ).resolves.toMatchObject({ outcome: "ok" });
    await expect(
      run([["/repos/team/app", repoReply("2026-02-08T12:15:01Z")]], 15).result,
    ).resolves.toMatchObject({ outcome: "late" });
  });

  it("gathers commits and pushes after the deadline for a late repo", async () => {
    const { fetched, result } = run([
      ["/commits", { body: [
        {
          sha: "abc123",
          html_url: "https://github.com/team/app/commit/abc123",
          commit: {
            message: "fix the demo\n\nlong body",
            author: { name: "Ada" },
            committer: { date: "1999-01-01T00:00:00Z" },
          },
        },
      ] }],
      ["/events", { body: [
        {
          type: "PushEvent",
          created_at: "2026-02-08T13:00:00Z",
          actor: { login: "ada" },
          payload: { ref: "refs/heads/dev" },
        },
        {
          type: "PushEvent",
          created_at: "2026-02-08T10:00:00Z",
          actor: { login: "ada" },
          payload: { ref: "refs/heads/main" },
        },
        { type: "WatchEvent", created_at: "2026-02-08T14:00:00Z" },
      ] }],
      ["/repos/team/app", repoReply("2026-02-08T13:00:00Z")],
    ]);
    const done = await result;
    expect(done.outcome).toBe("late");
    expect(done.evidence).toEqual({
      commits: [
        {
          sha: "abc123",
          message: "fix the demo",
          author: "Ada",
          committedAt: "1999-01-01T00:00:00Z",
          url: "https://github.com/team/app/commit/abc123",
        },
      ],
      pushes: [{ at: "2026-02-08T13:00:00Z", ref: "refs/heads/dev", pusher: "ada" }],
    });
    expect(fetched.calls[1]!.url).toContain(
      `since=${encodeURIComponent(DEADLINE.toISOString())}&per_page=20`,
    );
    expect(fetched.calls[2]!.url).toContain("/events?per_page=100");
  });

  it("keeps at most 20 commits and 20 pushes", async () => {
    const commit = (i: number) => ({
      sha: String(i),
      html_url: "u",
      commit: { message: "m", author: { name: "a" }, committer: { date: "d" } },
    });
    const push = (i: number) => ({
      type: "PushEvent",
      created_at: `2026-02-09T00:00:${String(i).padStart(2, "0")}Z`,
      actor: { login: "a" },
      payload: { ref: "r" },
    });
    const { result } = run([
      ["/commits", { body: Array.from({ length: 30 }, (_, i) => commit(i)) }],
      ["/events", { body: Array.from({ length: 30 }, (_, i) => push(i)) }],
      ["/repos/team/app", repoReply("2026-02-09T00:00:00Z")],
    ]);
    const done = await result;
    expect(done.evidence!.commits).toHaveLength(20);
    expect(done.evidence!.pushes).toHaveLength(20);
  });

  it("says which evidence could not be fetched", async () => {
    const { result } = run([
      ["/commits", { body: [] }],
      ["/events", { status: 500 }],
      ["/repos/team/app", repoReply("2026-02-09T00:00:00Z")],
    ]);
    await expect(result).resolves.toMatchObject({ gaps: ["pushes"] });
  });

  it("is still late when the evidence cannot be fetched", async () => {
    const { result } = run([
      ["/commits", { status: 500 }],
      ["/events", { status: 500 }],
      ["/repos/team/app", repoReply("2026-02-09T00:00:00Z")],
    ]);
    await expect(result).resolves.toMatchObject({
      outcome: "late",
      evidence: { commits: [], pushes: [] },
    });
  });

  it("calls a missing, private or blocked repo unreadable", async () => {
    for (const status of [404, 403, 451, 410]) {
      await expect(
        run([["/repos/team/app", { status }]]).result,
      ).resolves.toMatchObject({ outcome: "unreadable", pushedAt: null });
    }
  });

  it("calls a server failure or a dropped connection an error", async () => {
    await expect(
      run([["/repos/team/app", { status: 502 }]]).result,
    ).resolves.toMatchObject({ outcome: "error" });

    const client = new GithubClient(
      (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
      undefined,
    );
    await expect(checkRepo(client, ref, DEADLINE, 0)).resolves.toMatchObject({
      outcome: "error",
    });
  });

  it("sends a User-Agent, and the token only when there is one", async () => {
    const without = run([["/repos/team/app", repoReply(null)]]);
    await without.result;
    expect(without.fetched.calls[0]!.headers["User-Agent"]).toBeTruthy();
    expect(without.fetched.calls[0]!.headers.Authorization).toBeUndefined();

    const withToken = run([["/repos/team/app", repoReply(null)]], 0, "ghp_x");
    await withToken.result;
    expect(withToken.fetched.calls[0]!.headers.Authorization).toBe("Bearer ghp_x");
  });

  it("times a request out after 10 seconds", async () => {
    const signals: AbortSignal[] = [];
    const client = new GithubClient(
      (async (_url: unknown, init?: RequestInit) => {
        signals.push(init!.signal!);
        return new Response("{}");
      }) as unknown as typeof fetch,
      undefined,
    );
    await client.get("/repos/team/app");
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  describe("rate limits", () => {
    it("stops on a 403 with no requests left", async () => {
      await expect(
        run([
          ["/repos/team/app", { status: 403, headers: { "x-ratelimit-remaining": "0" } }],
        ]).result,
      ).rejects.toThrow("rate limited");
    });

    it("stops on retry-after and on 429", async () => {
      await expect(
        run([["/repos/team/app", { status: 403, headers: { "retry-after": "60" } }]])
          .result,
      ).rejects.toThrow("rate limited");
      await expect(
        run([["/repos/team/app", { status: 429 }]]).result,
      ).rejects.toThrow("rate limited");
    });

    it("stops on a 403 whose message is a secondary rate limit", async () => {
      await expect(
        run([
          [
            "/repos/team/app",
            {
              status: 403,
              body: { message: "You have exceeded a secondary rate limit." },
            },
          ],
        ]).result,
      ).rejects.toThrow("rate limited");
    });

    it("does not mistake a private repo's 403 for a limit", async () => {
      await expect(
        run([
          ["/repos/team/app", { status: 403, headers: { "x-ratelimit-remaining": "40" } }],
        ]).result,
      ).resolves.toMatchObject({ outcome: "unreadable" });
    });

    it("makes no more requests once the last one used the budget up", async () => {
      const fetched = fakeFetch([
        [
          "/repos/team/app",
          { body: { pushed_at: null }, headers: { "x-ratelimit-remaining": "0" } },
        ],
      ]);
      const client = new GithubClient(fetched.fn, undefined);
      await expect(checkRepo(client, ref, DEADLINE, 0)).resolves.toMatchObject({
        outcome: "ok",
      });
      await expect(checkRepo(client, ref, DEADLINE, 0)).rejects.toThrow(
        "rate limited",
      );
      expect(fetched.calls).toHaveLength(1);
    });
  });
});

describe("checkEntry", () => {
  const refs = [
    { owner: "t", repo: "a" },
    { owner: "t", repo: "b" },
  ];
  const client = (rules: Parameters<typeof fakeFetch>[0]) =>
    new GithubClient(fakeFetch(rules).fn, undefined);
  const check = async (
    c: GithubClient,
    list: typeof refs,
    deadline: Date,
    grace: number,
  ) => settle(await checkEntry(c, list, deadline, grace), deadline, grace);

  it("flags the entry when any of its repos is late, with that repo's evidence", async () => {
    const done = await check(
      client([
        ["/repos/t/a", repoReply("2026-02-08T10:00:00Z")],
        ["/repos/t/b", repoReply("2026-02-08T13:00:00Z")],
      ]),
      refs,
      DEADLINE,
      0,
    );
    expect(done).toMatchObject({ outcome: "late", ref: refs[1] });
    expect(done.repos.map((r) => [r.repo, r.outcome])).toEqual([
      ["a", "ok"],
      ["b", "late"],
    ]);
    expect(done.repos[1]!.evidence).not.toBeNull();
    expect(done.repos[0]!.evidence).toBeNull();
  });

  it("is ok only when every repo is", async () => {
    const rules: Parameters<typeof fakeFetch>[0] = [
      ["/repos/t/a", repoReply("2026-02-08T10:00:00Z")],
      ["/repos/t/b", { status: 404 }],
    ];
    expect((await check(client(rules), refs, DEADLINE, 0)).outcome).toBe(
      "unreadable",
    );
    rules[1] = ["/repos/t/b", repoReply("2026-02-08T11:00:00Z")];
    expect((await check(client(rules), refs, DEADLINE, 0)).outcome).toBe("ok");
  });

  it("applies the grace it is settled with, not the one it was fetched with", async () => {
    const found = await checkEntry(
      client([["/repos/t/a", repoReply("2026-02-08T12:30:00Z")]]),
      [refs[0]!],
      DEADLINE,
      0,
    );
    expect(settle(found, DEADLINE, 0).outcome).toBe("late");
    expect(settle(found, DEADLINE, 60).outcome).toBe("ok");
    expect(settle(found, DEADLINE, 29).outcome).toBe("late");
    expect(settle(found, DEADLINE, 30).outcome).toBe("ok");
  });

  it("has no repo to check without a link", async () => {
    expect(await check(client([]), [], DEADLINE, 0)).toMatchObject({
      outcome: "no_repo",
      repos: [],
    });
  });

  it("is an error when the rate limit hits before any repo is late", async () => {
    const done = await check(
      client([
        ["/repos/t/a", repoReply("2026-02-08T10:00:00Z")],
        ["/repos/t/b", { status: 429 }],
      ]),
      refs,
      DEADLINE,
      0,
    );
    expect(done.outcome).toBe("error");
  });

  it("still reports a late repo found before the rate limit", async () => {
    const done = await check(
      client([
        ["/commits", { status: 500 }],
        ["/events", { status: 500 }],
        ["/repos/t/a", repoReply("2026-02-08T13:00:00Z")],
        ["/repos/t/b", { status: 429 }],
      ]),
      refs,
      DEADLINE,
      0,
    );
    expect(done.outcome).toBe("late");
  });
});

const result = (over: Partial<RepoResult>): RepoResult => ({
  outcome: "late",
  ref,
  pushedAt: new Date("2026-02-08T13:00:00Z"),
  evidence: { commits: [], pushes: [] },
  repos: [],
  ...over,
});

const decided = (over: Partial<RepoCheckRow> = {}): RepoCheckRow => ({
  entryId: "e1",
  hackathonId: HACK,
  repoOwner: "team",
  repoName: "app",
  outcome: "late",
  pushedAt: new Date("2026-02-08T13:00:00Z"),
  evidence: { commits: [], pushes: [] },
  checkedAt: new Date("2026-02-08T14:00:00Z"),
  decision: "cleared",
  decidedById: "admin",
  decidedAt: new Date("2026-02-08T15:00:00Z"),
  note: "agreed with the team",
  removedEntry: false,
  removedDeletedAt: null,
  repos: [],
  lastOutcome: "late",
  ...over,
});

describe("nextCheck", () => {
  const checkedAt = new Date("2026-02-08T16:00:00Z");

  it("stores a first check as pending", () => {
    expect(nextCheck(undefined, result({}), checkedAt)).toMatchObject({
      outcome: "late",
      decision: "pending",
      checkedAt,
    });
  });

  it("refreshes a pending check", () => {
    const row = nextCheck(
      decided({ decision: "pending", decidedAt: null, outcome: "ok" }),
      result({ outcome: "late" }),
      checkedAt,
    );
    expect(row).toMatchObject({ outcome: "late", decision: "pending" });
  });

  it("keeps a pending late flag when a later check cannot look or finds nothing", () => {
    const flag = decided({ decision: "pending", decidedAt: null });
    for (const outcome of ["error", "unreadable", "no_repo", "ok"] as const) {
      expect(
        nextCheck(flag, result({ outcome, pushedAt: null, evidence: null }), checkedAt),
      ).toMatchObject({
        outcome: "late",
        pushedAt: flag.pushedAt,
        evidence: flag.evidence,
        decision: "pending",
        lastOutcome: outcome,
        checkedAt,
      });
    }
  });

  describe("evidence of a pending late flag", () => {
    const commit = (sha: string) => ({
      sha,
      message: sha,
      author: "Ada",
      committedAt: null,
      url: "u",
    });
    const push = (at: string) => ({ at, ref: "r", pusher: "p" });
    const held = {
      commits: [commit("old")],
      pushes: [push("2026-02-08T13:00:00Z")],
    };
    const part = (evidence: RepoResult["evidence"], pushedAt: string) => ({
      owner: "team",
      repo: "app",
      outcome: "late" as const,
      pushedAt,
      evidence,
    });
    const flag = decided({
      decision: "pending",
      decidedAt: null,
      evidence: held,
      repos: [part(held, "2026-02-08T13:00:00.000Z")],
    });
    const later = new Date("2026-02-08T18:00:00Z");
    const found = (
      evidence: RepoResult["evidence"],
      gaps: ("commits" | "pushes")[] = [],
    ) =>
      result({
        pushedAt: later,
        evidence,
        repos: [part(evidence, later.toISOString())],
        repoGaps: gaps.length ? { "team/app": gaps } : {},
      });

    it("keeps it, and takes the new push time, when the fetch failed", () => {
      const row = nextCheck(
        flag,
        found({ commits: [], pushes: [] }, ["commits", "pushes"]),
        checkedAt,
      );
      expect(row).toMatchObject({ outcome: "late", pushedAt: later });
      expect(row!.evidence).toEqual(held);
      expect(row!.repos![0]).toMatchObject({
        pushedAt: later.toISOString(),
        evidence: held,
      });
    });

    it("keeps what an empty fetch lacks and takes what the other fetch found", () => {
      const fresh = { commits: [commit("new")], pushes: [] };
      const row = nextCheck(flag, found(fresh), checkedAt);
      expect(row!.evidence).toEqual({
        commits: [commit("new")],
        pushes: held.pushes,
      });
    });

    it("takes the new evidence when the fetch succeeded", () => {
      const fresh = {
        commits: [commit("new")],
        pushes: [push("2026-02-08T18:00:00Z")],
      };
      expect(nextCheck(flag, found(fresh), checkedAt)!.evidence).toEqual(fresh);
    });

    it("keeps a failed side only where it failed", () => {
      const fresh = { commits: [], pushes: [push("2026-02-08T18:00:00Z")] };
      expect(nextCheck(flag, found(fresh, ["commits"]), checkedAt)!.evidence).toEqual({
        commits: held.commits,
        pushes: fresh.pushes,
      });
    });
  });

  it("replaces a pending late flag with a newer late one", () => {
    const pushedAt = new Date("2026-02-08T18:00:00Z");
    expect(
      nextCheck(
        decided({ decision: "pending", decidedAt: null }),
        result({ pushedAt }),
        checkedAt,
      ),
    ).toMatchObject({ outcome: "late", pushedAt, lastOutcome: "late" });
  });

  it("leaves a decided entry alone when nothing was pushed since", () => {
    for (const decision of ["cleared", "disqualified"] as const) {
      expect(
        nextCheck(decided({ decision }), result({}), checkedAt),
      ).toBeNull();
    }
  });

  it("reopens a decided entry pushed to after the decision", () => {
    const pushedAt = new Date("2026-02-08T15:00:01Z");
    for (const decision of ["cleared", "disqualified"] as const) {
      const row = nextCheck(
        decided({ decision, removedEntry: decision === "disqualified" }),
        result({
          pushedAt,
          evidence: {
            commits: [],
            pushes: [{ at: pushedAt.toISOString(), ref: "r", pusher: "p" }],
          },
        }),
        checkedAt,
      );
      expect(row).toMatchObject({
        decision: "pending",
        decidedById: null,
        decidedAt: null,
        note: null,
        pushedAt,
        removedEntry: decision === "disqualified",
      });
      expect(row!.evidence!.pushes).toHaveLength(1);
    }
  });

  it("does not reopen on a push exactly at the decision", () => {
    expect(
      nextCheck(
        decided(),
        result({ pushedAt: new Date("2026-02-08T15:00:00Z") }),
        checkedAt,
      ),
    ).toBeNull();
  });

  it("never undoes a decision because a check could not look", () => {
    for (const outcome of ["error", "unreadable", "no_repo", "ok"] as const) {
      expect(
        nextCheck(decided(), result({ outcome, pushedAt: null }), checkedAt),
      ).toBeNull();
    }
  });
});

type Write = { table: string; values: Record<string, unknown> };
type Chain = PromiseLike<unknown> & {
  from: (table: unknown) => Chain;
  leftJoin: () => Chain;
  where: (condition?: unknown) => Chain;
  limit: () => Chain;
};

/** A database whose selects answer by table and whose writes are recorded. */
function fakeDb(opts: {
  config?: Record<string, unknown> | null;
  claim?: boolean;
  entries?: Record<string, unknown>[];
  checks?: Record<string, unknown>[];
}) {
  const writes: Write[] = [];
  const claims: unknown[] = [];
  const select = () => {
    let table = "";
    let first: unknown = null;
    const chain = {
      then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => {
        const checks = (opts.checks ?? []).filter(
          (c) => first === HACK || c.entryId === first,
        );
        const rows =
          table === getTableName(judgingConfigs)
            ? [opts.config === null ? undefined : (opts.config ?? { graceMinutes: 0 })]
            : table === getTableName(judgingEntries)
              ? (opts.entries ?? [])
              : checks;
        return Promise.resolve(rows.filter(Boolean)).then(ok, err);
      },
    } as unknown as Chain;
    chain.from = (t) => {
      table = getTableName(t as never);
      return chain;
    };
    chain.leftJoin = () => chain;
    chain.where = (condition?: unknown) => {
      first = condition ? new PgDialect().sqlToQuery(condition as never).params[0] : null;
      return chain;
    };
    chain.limit = () => chain;
    return chain;
  };
  const db = {
    transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    query: {
      hackathons: {
        findFirst: async () => ({
          hackingStartTime: new Date("2026-02-07T00:00:00Z"),
          startDate: new Date("2026-02-07T00:00:00Z"),
        }),
      },
    },
    select,
    update: () => ({
      set: (values: unknown) => ({
        where: () => ({
          returning: async () => {
            claims.push(values);
            return opts.claim ? [{ hackathonId: HACK }] : [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoUpdate: async () => {
          writes.push({
            table: getTableName(table as never),
            values: values as Write["values"],
          });
        },
      }),
    }),
  };
  return { db: db as unknown as DrizzleDB, writes, claims };
}

const entryRow = (id: string, link: string | null) => ({
  id,
  deletedAt: null,
  demoLinks: link ? [link] : [],
  githubUrl: null,
});

describe("runRepoCheck", () => {
  const written = (writes: Write[]) =>
    new Map(
      writes
        .filter((w) => w.table === getTableName(judgingRepoChecks))
        .map((w) => [w.values.entryId as string, w.values]),
    );

  it("records ok, late, no_repo and unreadable per project", async () => {
    const { db, writes } = fakeDb({
      entries: [
        entryRow("a", "https://github.com/t/ok"),
        entryRow("b", "https://github.com/t/late"),
        entryRow("c", null),
        entryRow("d", "https://github.com/t/gone"),
      ],
    });
    const fetched = fakeFetch([
      ["/repos/t/ok", repoReply("2026-02-08T11:00:00Z")],
      ["/repos/t/late", repoReply("2026-02-08T12:30:00Z")],
      ["/repos/t/gone", { status: 404 }],
    ]);
    await runRepoCheck(db, HACK, {
      fetchFn: fetched.fn,
      now: new Date("2026-02-09T00:00:00Z"),
    });
    const rows = written(writes);
    expect([...rows.keys()].sort()).toEqual(["a", "b", "c", "d"]);
    expect(rows.get("a")).toMatchObject({ outcome: "ok", decision: "pending" });
    expect(rows.get("b")).toMatchObject({ outcome: "late", repoName: "late" });
    expect(rows.get("c")).toMatchObject({ outcome: "no_repo", repoOwner: null });
    expect(rows.get("d")).toMatchObject({ outcome: "unreadable" });
  });

  it("uses the submission close time and the edition's grace", async () => {
    // Hacking starts Feb 7 00:00Z; submissions close 36 hours later.
    const { db, writes } = fakeDb({
      config: { graceMinutes: 30 },
      entries: [entryRow("a", "https://github.com/t/a")],
    });
    await runRepoCheck(db, HACK, {
      fetchFn: fakeFetch([["/repos/t/a", repoReply("2026-02-08T12:30:00Z")]]).fn,
    });
    expect(written(writes).get("a")).toMatchObject({ outcome: "ok" });
  });

  it("never has more than 5 requests in flight", async () => {
    const entries = Array.from({ length: 23 }, (_, i) =>
      entryRow(`e${i}`, `https://github.com/t/r${i}`),
    );
    const { db } = fakeDb({ entries });
    let inFlight = 0;
    let peak = 0;
    const fetchFn = (async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return new Response(JSON.stringify({ pushed_at: null }));
    }) as unknown as typeof fetch;
    await runRepoCheck(db, HACK, { fetchFn });
    expect(peak).toBe(5);
  });

  it("marks the rest error once the rate limit is hit, and spares decided ones", async () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      entryRow(`e${i}`, `https://github.com/t/r${i}`),
    );
    const { db, writes } = fakeDb({
      entries,
      checks: [decided({ entryId: "e11", hackathonId: HACK })],
    });
    let served = 0;
    const fetchFn = vi.fn(async () => {
      served++;
      if (served > 3) {
        return new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        });
      }
      return new Response(JSON.stringify({ pushed_at: null }));
    }) as unknown as typeof fetch;
    await runRepoCheck(db, HACK, { fetchFn });

    const rows = written(writes);
    const outcomes = [...rows.values()].map((row) => row.outcome);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(3);
    expect(outcomes.filter((o) => o === "error").length).toBeGreaterThan(0);
    expect(rows.has("e11")).toBe(false);
    // Only requests already in flight when the limit hit were made.
    expect(served).toBeLessThanOrEqual(3 + 5);
  });

  it("does not look at removed projects, except disqualified ones", async () => {
    const removed = { ...entryRow("x", "https://github.com/t/x"), deletedAt: new Date() };
    const dq = { ...entryRow("y", "https://github.com/t/y"), deletedAt: new Date() };
    const { db } = fakeDb({
      entries: [removed, dq],
      checks: [decided({ entryId: "y", decision: "disqualified" })],
    });
    const fetched = fakeFetch([["/repos", repoReply(null)]]);
    await runRepoCheck(db, HACK, { fetchFn: fetched.fn });
    expect(fetched.calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/t/y",
    ]);
  });

  it("reopens a cleared project that was pushed to after it was cleared", async () => {
    const { db, writes } = fakeDb({
      entries: [entryRow("e1", "https://github.com/t/a")],
      checks: [decided()],
    });
    const fetched = fakeFetch([
      ["/repos/t/a", repoReply("2026-02-08T15:00:01Z")],
    ]);
    await runRepoCheck(db, HACK, { fetchFn: fetched.fn });
    expect(written(writes).get("e1")).toMatchObject({
      decision: "pending",
      outcome: "late",
    });
  });

  it("keeps a decision an organiser makes while the run is in flight", async () => {
    const checks: Record<string, unknown>[] = [];
    const { db, writes } = fakeDb({
      entries: [
        entryRow("e1", "https://github.com/t/a"),
        entryRow("e2", "https://github.com/t/b"),
      ],
      checks,
    });
    // GitHub answers late for both; while it does, e1 is disqualified.
    const fetchFn = vi.fn(async (input: unknown) => {
      if (String(input).endsWith("/repos/t/a")) {
        checks.push(
          decided({
            entryId: "e1",
            decision: "disqualified",
            removedEntry: true,
            decidedAt: new Date("2026-02-09T00:00:00Z"),
          }),
        );
      }
      return new Response(JSON.stringify({ pushed_at: "2026-02-08T13:00:00Z" }));
    }) as unknown as typeof fetch;
    await runRepoCheck(db, HACK, {
      fetchFn,
      now: new Date("2026-02-09T00:00:01Z"),
    });
    const rows = written(writes);
    expect(rows.has("e1")).toBe(false);
    expect(rows.get("e2")).toMatchObject({ outcome: "late", decision: "pending" });
  });

  it("settles against the grace as it is when the result is saved", async () => {
    const config = { graceMinutes: 0 };
    const { db, writes } = fakeDb({
      config,
      entries: [entryRow("e1", "https://github.com/t/a")],
    });
    // 30 minutes after the deadline; an organiser allows an hour meanwhile.
    const fetchFn = vi.fn(async () => {
      config.graceMinutes = 60;
      return new Response(JSON.stringify({ pushed_at: "2026-02-08T12:30:00Z" }));
    }) as unknown as typeof fetch;
    await runRepoCheck(db, HACK, { fetchFn });
    expect(written(writes).get("e1")).toMatchObject({ outcome: "ok" });
  });

  it("checks the longest unchecked first", async () => {
    const { db } = fakeDb({
      entries: [
        entryRow("fresh", "https://github.com/t/fresh"),
        entryRow("never", "https://github.com/t/never"),
        entryRow("stale", "https://github.com/t/stale"),
      ],
      checks: [
        decided({
          entryId: "fresh",
          decision: "pending",
          decidedAt: null,
          checkedAt: new Date("2026-02-08T19:00:00Z"),
        }),
        decided({
          entryId: "stale",
          decision: "pending",
          decidedAt: null,
          checkedAt: new Date("2026-02-08T13:00:00Z"),
        }),
      ],
    });
    const fetched = fakeFetch([["/repos", repoReply(null)]]);
    // One at a time so the order of requests is the order of the work.
    await runRepoCheck(db, HACK, { fetchFn: fetched.fn });
    expect(fetched.calls.map((c) => c.url.split("/").pop())).toEqual([
      "never",
      "stale",
      "fresh",
    ]);
  });

  it("does not run twice at once", async () => {
    const { db } = fakeDb({ entries: [entryRow("a", "https://github.com/t/a")] });
    const fetched = fakeFetch([["/repos/t/a", repoReply(null)]]);
    await Promise.all([
      runRepoCheck(db, HACK, { fetchFn: fetched.fn }),
      runRepoCheck(db, HACK, { fetchFn: fetched.fn }),
    ]);
    expect(fetched.calls).toHaveLength(1);
  });
});

describe("repoCheckIfDue", () => {
  afterEach(() => {
    repoCheckThrottle.clear();
    vi.restoreAllMocks();
  });

  const t0 = new Date("2026-02-08T20:00:00Z");
  const fetchFn = fakeFetch([["/repos", repoReply(null)]]).fn;

  it("starts a run when the claim on the config row succeeds", async () => {
    const { db, claims, writes } = fakeDb({
      claim: true,
      entries: [entryRow("a", "https://github.com/t/a")],
    });
    const started = await repoCheckIfDue(db, HACK, t0, { fetchFn });
    expect(claims).toEqual([{ repoCheckLastRunAt: t0 }]);
    await started!.done;
    expect(writes).toHaveLength(1);
  });

  it("does not start one when another instance holds the claim, or it is off", async () => {
    const { db, writes } = fakeDb({
      claim: false,
      entries: [entryRow("a", "https://github.com/t/a")],
    });
    expect(await repoCheckIfDue(db, HACK, t0, { fetchFn })).toBeUndefined();
    expect(writes).toHaveLength(0);
  });

  it("asks at most once every 15 minutes in this process", async () => {
    const { db, claims } = fakeDb({ claim: true });
    const started = await repoCheckIfDue(db, HACK, t0, { fetchFn });
    await started?.done;
    await repoCheckIfDue(db, HACK, new Date(t0.getTime() + REPO_CHECK_EVERY_MS - 1), { fetchFn });
    expect(claims).toHaveLength(1);
    const again = await repoCheckIfDue(
      db,
      HACK,
      new Date(t0.getTime() + REPO_CHECK_EVERY_MS),
      { fetchFn },
    );
    await again?.done;
    expect(claims).toHaveLength(2);
  });

  it("keeps the throttle per edition", async () => {
    const { db, claims } = fakeDb({ claim: true });
    await (await repoCheckIfDue(db, "one", t0, { fetchFn }))?.done;
    await (await repoCheckIfDue(db, "two", t0, { fetchFn }))?.done;
    expect(claims).toHaveLength(2);
  });

  it("does not wait for GitHub", async () => {
    const { db } = fakeDb({
      claim: true,
      entries: [entryRow("a", "https://github.com/t/a")],
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = (async () => {
      await gate;
      return new Response(JSON.stringify({ pushed_at: null }));
    }) as unknown as typeof fetch;
    const started = await repoCheckIfDue(db, HACK, t0, { fetchFn: slow });
    expect(started).toBeDefined();
    release();
    await started!.done;
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = fakeDb({ claim: true });
    (db as unknown as { update: () => never }).update = () => {
      throw new Error("db down");
    };
    await expect(repoCheckIfDue(db, HACK, t0, { fetchFn })).resolves.toBeUndefined();
  });
});
