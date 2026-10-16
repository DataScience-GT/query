import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DangerZone } from "./DangerZone";
import type { Overview } from "./shared";

// Rendered to markup with the tRPC hooks stubbed, as in EntriesList.test.tsx:
// a mutation's onSuccess is read off the options its hook was given and called
// directly.

Object.assign(globalThis, { React });

type MutationOptions = { onSuccess?: (result: unknown) => void };

const mocks = vi.hoisted(() => ({
  invalidateJudging: vi.fn(),
  invalidateResults: vi.fn(),
  options: {} as Record<string, MutationOptions>,
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
      error: null,
      mutate: () => undefined,
      reset: () => undefined,
    };
  };
  return {
    trpc: {
      useUtils: () => ({
        judging: { invalidate: mocks.invalidateJudging },
        hackathon: { getResults: { invalidate: mocks.invalidateResults } },
      }),
      judging: {
        admin: Object.fromEntries(
          [
            "dropEvaluations",
            "resetLaunch",
            "dropRooms",
            "resetProjects",
            "resetSetup",
            "resetAll",
          ].map((name) => [name, { useMutation: mutation(name) }]),
        ),
      },
    },
  };
});

const overview = {
  hackathon: { name: "Spring Build" },
  schedule: null,
  counts: {
    evaluations: { total: 0, drafts: 0 },
    rooms: { active: 0, archived: 0 },
  },
} as unknown as Overview;

// Every count a summary line reads, so each onSuccess can build its text.
const result = {
  evaluations: 0,
  drafts: 0,
  placements: 0,
  claimLinks: 0,
  unclaimedMembers: 0,
  rooms: 0,
  announcements: 0,
  entries: 0,
  challenges: 0,
  groups: 0,
  rubricItems: 0,
  judges: 0,
  scheduleDropped: false,
};

const succeed = (name: string) => {
  renderToStaticMarkup(
    <DangerZone
      hackathonId="11111111-1111-4111-8111-111111111111"
      overview={overview}
    />,
  );
  mocks.options[name]?.onSuccess?.(result);
};

beforeEach(() => {
  mocks.invalidateJudging.mockClear();
  mocks.invalidateResults.mockClear();
  mocks.options = {};
});

describe("DangerZone public results", () => {
  it.each(["dropEvaluations", "resetProjects", "resetAll"])(
    "refetches the public results after %s",
    (name) => {
      succeed(name);

      expect(mocks.invalidateJudging).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateResults).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["resetLaunch", "dropRooms", "resetSetup"])(
    "leaves the public results alone after %s",
    (name) => {
      succeed(name);

      expect(mocks.invalidateJudging).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateResults).not.toHaveBeenCalled();
    },
  );
});
