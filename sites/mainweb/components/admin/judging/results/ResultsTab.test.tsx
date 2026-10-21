import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsTab } from "./ResultsTab";

// Rendered to markup with the tRPC hooks stubbed: the web app has no DOM test
// environment, so these check what each state shows and disables, not clicks.

// The root vitest config compiles JSX to React.createElement, and components
// written for Next's automatic runtime do not import React.
Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => {
  const at = new Date("2027-02-06T11:00:00Z");
  const audit = (
    id: string,
    judgeName: string,
    over: Record<string, unknown>,
  ) => ({
    id,
    entryId: "entry-1",
    title: "Tidewater",
    challengeId: "ch-1",
    challenge: "General",
    judgeId: `judge-${id}`,
    judgeName,
    kind: "member",
    appointmentId: null,
    isComplete: true,
    revision: 1,
    submittedAt: at,
    autoSubmitted: false,
    autoSubmittedAt: null,
    updatedAt: at,
    score: 4,
    counted: true,
    ...over,
  });
  return {
    at,
    readOnly: false,
    publishedAt: null as Date | null,
    // One whole evaluation, one auto-submitted with every rating and a
    // response missing, one auto-submitted short of a rating.
    rows: [
      audit("whole", "Bea Whole", {}),
      audit("auto", "Ada Auto", {
        isComplete: false,
        autoSubmitted: true,
        autoSubmittedAt: at,
      }),
      audit("short", "Cy Short", {
        isComplete: false,
        autoSubmitted: true,
        autoSubmittedAt: at,
        counted: false,
      }),
    ],
  };
});

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => mocks.readOnly,
}));

vi.mock("@/lib/trpc", () => {
  const idle = () => ({
    isPending: false,
    variables: undefined,
    error: null,
    mutate: () => undefined,
  });
  const query = (data: unknown) => () => ({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => undefined,
  });
  return {
    trpc: {
      useUtils: () => ({}),
      hackathon: {
        getById: { useQuery: query({ status: "active" }) },
        update: { useMutation: idle },
      },
      judging: {
        admin: {
          setPrizeEligibility: { useMutation: idle },
          reopenGrade: { useMutation: idle },
        },
        results: {
          compute: { useMutation: idle },
          publish: { useMutation: idle },
          unpublish: { useMutation: idle },
          list: {
            useQuery: () => ({
              data: {
                computedAt: mocks.at,
                publishedAt: mocks.publishedAt,
                evaluationsSinceCompute: 0,
                calibration: [],
                scopes: [],
              },
              isLoading: false,
              isError: false,
              error: null,
              refetch: () => undefined,
            }),
          },
          evaluationAudit: { useQuery: query(mocks.rows) },
        },
      },
    },
  };
});

const render = () =>
  renderToStaticMarkup(
    <ResultsTab hackathonId="11111111-1111-4111-8111-111111111111" />,
  );

// The attribute, not the `disabled:` variants in the class list.
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

/** The opening tag of every Reopen button. */
const reopenButtons = (markup: string) =>
  [...markup.matchAll(/<button\b[^>]*>(?=Reopen for grading)/g)].map(
    (match) => match[0],
  );

beforeEach(() => {
  mocks.readOnly = false;
  mocks.publishedAt = null;
});

describe("ResultsTab evaluations", () => {
  it("offers to reopen each evaluation for grading", () => {
    const buttons = reopenButtons(render());

    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(isDisabled(button)).toBe(false);
  });

  it("says which incomplete evaluations count toward the placings", () => {
    const markup = render();

    expect(markup).toContain("Complete");
    expect(markup).toContain("Counts, response missing");
    expect(markup).toContain("Incomplete, not counted");
  });

  it("holds the button back while results are published, and says why", () => {
    mocks.publishedAt = mocks.at;

    const buttons = reopenButtons(render());

    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(isDisabled(button)).toBe(true);
      expect(button).toContain("Unpublish first to reopen a grade.");
    }
  });

  it("holds the button back for a read-only tester", () => {
    mocks.readOnly = true;

    const buttons = reopenButtons(render());

    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(isDisabled(button)).toBe(true);
      expect(button).toContain("Read-only");
    }
  });
});
