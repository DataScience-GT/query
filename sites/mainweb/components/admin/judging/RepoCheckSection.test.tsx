import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoCheckSection } from "./RepoCheckSection";

// Rendered to markup with the tRPC hooks stubbed, as EntriesList.test.tsx does.
Object.assign(globalThis, { React });

type MutationOptions = { onSuccess?: () => void };

const mocks = vi.hoisted(() => ({
  invalidateJudging: vi.fn(),
  invalidateResults: vi.fn(),
  options: {} as Record<string, MutationOptions>,
  flag: {
    entryId: "entry-1",
    title: "Tidewater",
    removed: null,
    repoOwner: "team",
    repoName: "app",
    outcome: "late",
    pushedAt: "2026-02-08T13:00:00.000Z",
    lastOutcome: "unreadable",
    repos: [
      {
        owner: "team",
        repo: "app",
        outcome: "late",
        pushedAt: "2026-02-08T13:00:00.000Z",
        evidence: {
          commits: [
            {
              sha: "abcdef123456",
              message: "last minute fix",
              author: "Ada",
              committedAt: "1999-01-01T00:00:00Z",
              url: "https://github.com/team/app/commit/abcdef1",
            },
          ],
          pushes: [
            { at: "2026-02-08T13:00:00Z", ref: "refs/heads/dev", pusher: "ada" },
          ],
        },
      },
      { owner: "team", repo: "docs", outcome: "ok", pushedAt: null, evidence: null },
    ],
    checkedAt: "2026-02-08T14:00:00.000Z",
    decision: "pending",
    decidedAt: null,
    note: null,
    removedEntry: false,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => false,
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => (options: MutationOptions) => {
    mocks.options[name] = options;
    return { isPending: false, error: null, mutate: () => undefined };
  };
  return {
    trpc: {
      useUtils: () => ({
        judging: { invalidate: mocks.invalidateJudging },
        hackathon: { getResults: { invalidate: mocks.invalidateResults } },
      }),
      judging: {
        admin: {
          getRepoCheck: {
            useQuery: () => ({
              data: {
                enabled: true,
                graceMinutes: 15,
                lastRunAt: "2026-02-08T14:00:00.000Z",
                running: false,
                judgingOpen: true,
                hasToken: false,
                deadline: "2026-02-08T12:00:00.000Z",
                checked: 12,
                flagged: [mocks.flag],
              },
              isLoading: false,
              isError: false,
              error: null,
              refetch: () => undefined,
            }),
          },
          setRepoCheck: { useMutation: mutation("setRepoCheck") },
          runRepoCheckNow: { useMutation: mutation("runRepoCheckNow") },
          decideRepoCheck: { useMutation: mutation("decideRepoCheck") },
          reinstateRepoCheck: { useMutation: mutation("reinstateRepoCheck") },
        },
      },
    },
  };
});

const render = () =>
  renderToStaticMarkup(
    <RepoCheckSection hackathonId="11111111-1111-4111-8111-111111111111" />,
  );

beforeEach(() => {
  mocks.invalidateJudging.mockClear();
  mocks.invalidateResults.mockClear();
  mocks.options = {};
});

describe("RepoCheckSection", () => {
  it("lists a late project with its repo, times in Eastern and evidence", () => {
    const html = render();
    expect(html).toContain("Tidewater");
    expect(html).toContain("https://github.com/team/app");
    // Feb 8 13:00 UTC is 8:00 AM in New York; the deadline is 7:00 AM.
    expect(html).toContain("Last push Sun, Feb 8, 8:00 AM");
    expect(html).toContain("deadline Sun, Feb 8, 7:00 AM plus 15 minutes");
    expect(html).toContain("last minute fix");
    expect(html).toContain("Pushes to any branch count");
    expect(html).toContain("for context only");
    expect(html).toContain("https://github.com/team/docs");
    expect(html).toContain("Latest check: repo not readable");
    // The last run, 14:00 UTC, is 9:00 AM Eastern.
    expect(html).toContain("Last run Sun, Feb 8, 9:00 AM Eastern");
    expect(html).toContain("GitHub allows only 60 requests an hour");
    expect(html).toContain("Disqualify");
    expect(html).toContain("Clear");
    expect(html).not.toContain("Reinstate");
  });

  it("offers reinstating, not clearing, once disqualified", () => {
    mocks.flag.decision = "disqualified";
    mocks.flag.removedEntry = true;
    const html = render();
    expect(html).toContain("Reinstate");
    expect(html).not.toContain(">Disqualify<");
    expect(html).not.toContain(">Clear<");
    mocks.flag.decision = "pending";
    mocks.flag.removedEntry = false;
  });

  it.each(["decideRepoCheck", "reinstateRepoCheck"])(
    "refetches the public results after %s",
    (name) => {
      render();
      mocks.options[name]?.onSuccess?.();
      expect(mocks.invalidateJudging).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateResults).toHaveBeenCalledTimes(1);
    },
  );
});
