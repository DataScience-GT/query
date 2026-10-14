import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CpsatPanel } from "./CpsatPanel";

// Rendered to markup with the tRPC hooks stubbed: the web app has no DOM test
// environment, so these check what each state shows and disables, not clicks.

// The root vitest config compiles JSX to React.createElement, and components
// written for Next's automatic runtime do not import React.
Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  available: true as boolean | undefined,
  readOnly: false,
  solvePending: false,
  // A run the stubbed solveCpsat reports as finished, once per render.
  solved: null as Record<string, unknown> | null,
  reported: false,
}));

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => mocks.readOnly,
}));

vi.mock("@/lib/trpc", () => {
  const idle = () => ({
    isPending: false,
    error: null,
    mutate: () => undefined,
    reset: () => undefined,
  });
  return {
    trpc: {
      useUtils: () => ({}),
      judging: {
        schedule: {
          cpsatAvailability: {
            useQuery: () => ({
              isPending: mocks.available === undefined,
              data:
                mocks.available === undefined
                  ? undefined
                  : { available: mocks.available },
            }),
          },
          solveCpsat: {
            useMutation: (options: {
              onSuccess: (data: Record<string, unknown>) => void;
            }) => {
              // Static rendering cannot click, so the result arrives the way
              // a settled mutation hands it over: through onSuccess.
              if (mocks.solved && !mocks.reported) {
                mocks.reported = true;
                options.onSuccess(mocks.solved);
              }
              return { ...idle(), isPending: mocks.solvePending };
            },
          },
          previewCpsat: { useMutation: idle },
          saveCpsat: { useMutation: idle },
        },
      },
    },
  };
});

const timing = {
  windowStart: new Date(2026, 10, 1, 10, 0),
  windowEnd: new Date(2026, 10, 1, 18, 0),
  setupMinutes: 2,
  judgingMinutes: 6,
  teardownMinutes: 2,
  sameBuildingBreakMinutes: 10,
  crossBuildingBreakMinutes: 20,
};

const rooms = [
  {
    id: "room-1",
    name: "Klaus 1443",
    buildingName: "Klaus",
    challengeLabel: "Best overall",
    scheduled: true,
  },
];

function solution(overrides: Record<string, unknown> = {}) {
  return {
    slots: 48,
    slotMinutes: 10,
    presentations: 2,
    projects: 1,
    rooms: 1,
    ok: true,
    relaxed: false,
    diagnostics: [],
    summary: {
      sponsorsDoneAt: null,
      allDoneAt: new Date(2026, 10, 1, 10, 40),
      sponsorRoomIdleMinutes: 0,
      buildingChanges: 0,
      breakMinutes: 20,
    },
    appointments: [
      {
        entryId: "entry-1",
        entryTitle: "Pathfinder",
        challengeId: "challenge-1",
        challengeLabel: "Best overall",
        roomId: "room-1",
        roomName: "Klaus 1443",
        buildingName: "Klaus",
        slot: 0,
        startsAt: new Date(2026, 10, 1, 10, 0),
      },
    ],
    reducedBreaks: [],
    candidateKey: "a".repeat(64),
    solverStatus: "optimal",
    solution: "{}",
    ...overrides,
  };
}

function render(props: { found?: boolean; stale?: boolean } = {}) {
  return renderToStaticMarkup(
    <CpsatPanel
      hackathonId="hackathon-1"
      rooms={rooms as never}
      timing={timing}
      found={props.found ?? false}
      stale={props.stale ?? false}
    />,
  );
}

/** The button labelled `text`, or the opening tag of the element with `id`. */
const button = (html: string, text: string) =>
  html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0] ?? "";
const byId = (html: string, id: string) =>
  html.match(new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`))?.[0] ?? "";
// The attribute, not the disabled: variants in the class list.
const DISABLED = ' disabled=""';

beforeEach(() => {
  mocks.available = true;
  mocks.readOnly = false;
  mocks.solvePending = false;
  mocks.solved = null;
  mocks.reported = false;
});

describe("CpsatPanel", () => {
  it("offers a run on the server, with a time limit, when CP-SAT is installed", () => {
    const html = render({ found: true });
    expect(html).toContain("Look for a better schedule");
    expect(button(html, "Solve with CP-SAT")).not.toContain(DISABLED);
    for (const seconds of [20, 45, 60]) {
      expect(html).toMatch(`<option value="${seconds}"`);
    }
    expect(html).toContain("Or run it on your own computer");
  });

  it("falls back to download and upload when it is not", () => {
    mocks.available = false;
    const html = render();
    expect(html).toContain("Try CP-SAT");
    expect(html).not.toContain("Solve with CP-SAT");
    expect(html).toContain("This server does not run CP-SAT itself");
    expect(button(html, "Download problem.json")).not.toContain(DISABLED);
    expect(byId(html, "cpsat-solution")).toContain('type="file"');
  });

  it("offers neither until it knows which applies", () => {
    mocks.available = undefined;
    const html = render();
    expect(html).not.toContain("Solve with CP-SAT");
    expect(html).not.toContain("Download problem.json");
  });

  it("says how long a run can take while it runs", () => {
    mocks.solvePending = true;
    const html = render();
    expect(html).toContain("It can take up to 20 seconds");
    expect(button(html, "Solving…")).toContain(DISABLED);
    expect(byId(html, "cpsat-solution")).toContain(DISABLED);
  });

  it("shows a run's schedule with CP-SAT's verdict and a save", () => {
    mocks.solved = solution();
    const html = render();
    expect(html).toContain("Proved optimal");
    expect(html).toContain("2 presentations from 1 project");
    expect(html).toContain("Pathfinder");
    expect(button(html, "Save CP-SAT schedule")).not.toContain(DISABLED);
  });

  it("says when the time limit ended the search", () => {
    mocks.solved = solution({ solverStatus: "feasible" });
    const html = render();
    expect(html).toContain("Best found in the time limit");
    expect(html).not.toContain("Proved optimal");
  });

  it("needs the shorter breaks confirmed before saving a relaxed schedule", () => {
    mocks.solved = solution({
      relaxed: true,
      reducedBreaks: [
        {
          entryId: "entry-1",
          entryTitle: "Pathfinder",
          fromRoomName: "Klaus 1443",
          toRoomName: "CULC 152",
          breakMinutes: 10,
        },
      ],
    });
    const html = render();
    expect(html).toContain("Save with these shorter breaks");
    expect(button(html, "Save CP-SAT schedule")).toContain(DISABLED);
  });

  it("lets a read-only organiser download but not run, upload or save", () => {
    mocks.readOnly = true;
    mocks.solved = solution();
    const html = render();
    expect(button(html, "Solve with CP-SAT")).toContain(DISABLED);
    expect(byId(html, "cpsat-solution")).toContain(DISABLED);
    expect(button(html, "Save CP-SAT schedule")).toContain(DISABLED);
    expect(button(html, "Download problem.json")).not.toContain(DISABLED);
  });

  it("asks for a new preview once the timing has changed", () => {
    mocks.solved = solution();
    const html = render({ stale: true });
    expect(html).toContain("The timing changed since this preview");
    expect(button(html, "Solve with CP-SAT")).toContain(DISABLED);
    expect(button(html, "Download problem.json")).toContain(DISABLED);
    expect(byId(html, "cpsat-solution")).toContain(DISABLED);
    expect(button(html, "Save CP-SAT schedule")).toContain(DISABLED);
  });
});
