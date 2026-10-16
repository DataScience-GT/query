import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntriesList } from "./EntriesList";

// Rendered to markup with the tRPC hooks stubbed: the web app has no DOM test
// environment, so a mutation's onSuccess is read off the options each hook was
// given and called directly, rather than through a click.

// The root vitest config compiles JSX to React.createElement, and components
// written for Next's automatic runtime do not import React.
Object.assign(globalThis, { React });

type MutationOptions = { onSuccess?: () => void };

const mocks = vi.hoisted(() => ({
  invalidateJudging: vi.fn(),
  invalidateResults: vi.fn(),
  options: {} as Record<string, MutationOptions>,
  entry: {
    id: "entry-1",
    source: "portal",
    title: "Tidewater",
    submissionUrl: null,
    deletedAt: null,
    prizeIneligible: false,
    appointments: 0,
    completeEvaluations: 0,
    members: [],
    challenges: [],
    checkInFlags: [],
  },
}));

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => false,
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => (options: MutationOptions) => {
    mocks.options[name] = options;
    return {
      isPending: false,
      variables: undefined,
      error: null,
      mutate: () => undefined,
    };
  };
  return {
    trpc: {
      useUtils: () => ({
        judging: { invalidate: mocks.invalidateJudging },
        hackathon: { getResults: { invalidate: mocks.invalidateResults } },
      }),
      judging: {
        admin: {
          listEntries: {
            useQuery: () => ({
              data: {
                entries: [mocks.entry],
                total: 1,
                page: 1,
                pageSize: 50,
              },
              isLoading: false,
              isError: false,
              isPlaceholderData: false,
              error: null,
              refetch: () => undefined,
            }),
          },
          listChallenges: { useQuery: () => ({ data: { challenges: [] } }) },
          setEntryChallenges: { useMutation: mutation("setEntryChallenges") },
          removeEntry: { useMutation: mutation("removeEntry") },
          restoreEntry: { useMutation: mutation("restoreEntry") },
          dismissCheckInFlag: { useMutation: mutation("dismissCheckInFlag") },
          setPrizeEligibility: { useMutation: mutation("setPrizeEligibility") },
        },
      },
    },
  };
});

const succeed = (name: string) => {
  renderToStaticMarkup(
    <EntriesList hackathonId="11111111-1111-4111-8111-111111111111" />,
  );
  mocks.options[name]?.onSuccess?.();
};

beforeEach(() => {
  mocks.invalidateJudging.mockClear();
  mocks.invalidateResults.mockClear();
  mocks.options = {};
});

describe("EntriesList public results", () => {
  // Each of these changes what hackathon.getResults returns, and the portal
  // keeps that query fresh for minutes, so the public copy has to be dropped
  // along with the judging screens (as the Results tab does for eligibility).
  it.each(["setPrizeEligibility", "removeEntry", "restoreEntry"])(
    "refetches the public results after %s",
    (name) => {
      succeed(name);

      expect(mocks.invalidateJudging).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateResults).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["setEntryChallenges", "dismissCheckInFlag"])(
    "leaves the public results alone after %s",
    (name) => {
      succeed(name);

      expect(mocks.invalidateJudging).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateResults).not.toHaveBeenCalled();
    },
  );
});
