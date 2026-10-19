import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JudgeDialog } from "./JudgeDialog";
import { JudgesPanel } from "./JudgesPanel";

// Rendered to markup with the tRPC hooks stubbed, as CpsatPanel.test.tsx does:
// these check what each state shows and disables, not clicks.
Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  readOnly: false,
  pending: false,
  assigned: null as Record<string, unknown> | null,
  choices: null as Record<string, unknown> | null,
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
          assignJudges: {
            // Static rendering cannot click, so a finished run is simply
            // there as the mutation's data.
            useMutation: () => ({
              ...idle(),
              data: mocks.assigned ?? undefined,
              isPending: mocks.pending,
            }),
          },
          setAssignedJudge: { useMutation: idle },
          judgeChoices: {
            useQuery: () => ({
              isLoading: mocks.choices === null,
              error: null,
              data: mocks.choices ?? undefined,
              refetch: () => undefined,
            }),
          },
        },
      },
    },
  };
});

const windowStart = new Date(2026, 10, 1, 10, 0);

const judging = (overrides: Record<string, unknown> = {}) => ({
  judges: 3,
  assigned: 5,
  unassigned: 0,
  loads: [
    {
      judgeId: "m1",
      name: "Ada",
      kind: "member",
      roomName: null,
      available: true,
      load: 3,
    },
    {
      judgeId: "gs",
      name: "Grace",
      kind: "guest",
      roomName: "Acme 1",
      available: true,
      load: 2,
    },
    {
      judgeId: "old",
      name: "Linus",
      kind: "guest",
      roomName: null,
      available: false,
      load: 0,
    },
  ],
  warnings: [],
  ...overrides,
});

function panel(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <JudgesPanel
      hackathonId="hackathon-1"
      judging={judging(over) as never}
      windowStart={windowStart}
    />,
  );
}

const button = (html: string, text: string) =>
  html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0] ?? "";
const DISABLED = ' disabled=""';

beforeEach(() => {
  mocks.readOnly = false;
  mocks.pending = false;
  mocks.assigned = null;
  mocks.choices = null;
});

describe("JudgesPanel", () => {
  it("states the rule and what is assigned, with a button to assign again", () => {
    const html = panel();
    expect(html).toContain("graded once, by one judge");
    expect(html).toContain(
      "5 presentations with a judge. Every upcoming one has its judge.",
    );
    expect(button(html, "Assign judges")).not.toContain(DISABLED);
  });

  it("counts the presentations still waiting for a judge", () => {
    const html = panel({ unassigned: 2 });
    expect(html).toContain(
      "5 presentations with a judge, 2 still waiting for one.",
    );
  });

  it("lists each judge with their load, and says who has no room or table", () => {
    const html = panel();
    expect(html).toContain("Presentations per judge");
    expect(html).toContain("Ada");
    expect(html).toContain("Table judge");
    expect(html).toContain("Guest · Acme 1");
    expect(html).toContain("Linus");
    expect(html).toContain("has no room or table now");
  });

  it("warns of the slots where judges run short, with their times", () => {
    const html = panel({
      warnings: [
        {
          slot: 9,
          startsAt: new Date(2026, 10, 1, 11, 30),
          challengeId: "general",
          challengeLabel: "General",
          presentations: 2,
          judgesFree: 1,
          message: "Slot 10: 2 presentations in General, only 1 judge free",
        },
      ],
    });
    expect(html).toContain("1 slot has too few judges");
    expect(html).toContain(
      "Slot 10: 2 presentations in General, only 1 judge free, at 11:30",
    );
  });

  it("cannot assign before any judge has joined", () => {
    const html = panel({ judges: 0, assigned: 0, unassigned: 4, loads: [] });
    expect(html).toContain("No judge has joined a room or table yet");
    expect(button(html, "Assign judges")).toContain(DISABLED);
  });

  it("is read-only for a read-only organiser, and busy while it works", () => {
    mocks.readOnly = true;
    expect(button(panel(), "Assign judges")).toContain(DISABLED);

    mocks.readOnly = false;
    mocks.pending = true;
    expect(button(panel(), "Assigning…")).toContain(DISABLED);
  });

  it("reports what an assignment changed and who worked it out", () => {
    mocks.assigned = { changed: 4, solver: "cp-sat" };
    expect(panel()).toContain(
      "4 presentations given a judge, worked out by CP-SAT.",
    );

    mocks.assigned = { changed: 0, solver: "in-app" };
    expect(panel()).toContain("Nothing changed");
  });
});

const dialog = () =>
  renderToStaticMarkup(
    <JudgeDialog
      hackathonId="hackathon-1"
      appointmentId="appointment-1"
      windowStart={windowStart}
      onClose={() => undefined}
    />,
  );

const choices = (over: Record<string, unknown> = {}) => ({
  appointment: {
    id: "appointment-1",
    entryTitle: "Pathfinder",
    challengeLabel: "General",
    roomName: "Table G1",
    startsAt: new Date(2026, 10, 1, 11, 30),
    assignedJudgeId: "m1",
    canAssignJudge: true,
  },
  choices: [
    {
      judgeId: "m2",
      name: "Bea",
      kind: "member",
      load: 2,
      bookedWith: null,
      booked: false,
    },
    {
      judgeId: "m1",
      name: "Ada",
      kind: "member",
      load: 3,
      bookedWith: null,
      booked: false,
    },
    {
      judgeId: "gs",
      name: "Grace",
      kind: "guest",
      load: 1,
      bookedWith: "Pathfinder",
      booked: true,
    },
  ],
  ...over,
});

describe("JudgeDialog", () => {
  it("waits for the judges", () => {
    expect(dialog()).toContain("Finding judges…");
  });

  it("offers only the judges the server says may grade it, and no judge", () => {
    mocks.choices = choices();
    const html = dialog();
    expect(html).toContain("Pathfinder");
    expect(html).toContain("General · Table G1 · 11:30");
    expect(html).toContain('<option value="">No judge</option>');
    expect(html).toContain("Bea · 2 presentations");
    expect(html).toContain(
      "Grace (guest) · 1 presentation · grading Pathfinder then",
    );
  });

  it("starts on the current judge, and cannot save without a change", () => {
    mocks.choices = choices();
    const html = dialog();
    expect(html).toMatch(/<option value="m1" selected=""/);
    expect(button(html, "Save judge")).toContain(DISABLED);
  });

  it("leaves a judge who is already grading something else out of reach", () => {
    mocks.choices = choices();
    expect(dialog()).toMatch(/<option value="gs" disabled=""/);
  });

  it("says why when the presentation can no longer change judge", () => {
    mocks.choices = choices({
      appointment: { ...choices().appointment, canAssignJudge: false },
    });
    const html = dialog();
    expect(html).toContain("has started, or a judge has begun on it");
    expect(button(html, "Save judge")).toContain(DISABLED);
  });

  it("says so when no judge can grade it yet", () => {
    mocks.choices = choices({ choices: [] });
    expect(dialog()).toContain("No judge can grade this yet.");
  });
});
