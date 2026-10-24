import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanAdvice } from "./PlanAdvice";

// Rendered to markup with the tRPC hooks stubbed, as JudgesPanel.test.tsx
// does: these check what each advice shows and disables, not clicks.
Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  readOnly: false,
  pending: false,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => mocks.readOnly,
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({
    isPending: mocks.pending,
    error: mocks.error,
    mutate: () => undefined,
  });
  return {
    trpc: {
      judging: {
        admin: {
          archiveRooms: { useMutation: mutation },
          createTables: { useMutation: mutation },
          createRoom: { useMutation: mutation },
        },
      },
    },
  };
});

const advice = [
  {
    kind: "judges" as const,
    message: "3 presentations would have no judge.",
  },
  {
    kind: "unusedTables" as const,
    message: "16 tables won't be used with 4 table judges.",
    action: { type: "archiveTables" as const, roomIds: ["a", "b"] },
  },
  {
    kind: "moreTables" as const,
    message: "General finishes last.",
    action: {
      type: "addTables" as const,
      challengeId: "c",
      buildingId: "b",
      count: 3,
    },
  },
  {
    kind: "sponsorRoom" as const,
    message: "Sponsor Alpha decides when judging ends.",
    action: {
      type: "addRooms" as const,
      rooms: [{ challengeId: "c", buildingId: "b", name: "Alpha 2" }],
    },
  },
];

const render = (list = advice) =>
  renderToStaticMarkup(
    <PlanAdvice hackathonId="h" advice={list} onChanged={() => undefined} />,
  );

beforeEach(() => {
  mocks.readOnly = false;
  mocks.pending = false;
  mocks.error = null;
});

describe("PlanAdvice", () => {
  it("shows nothing when there is no advice", () => {
    expect(render([])).toBe("");
  });

  it("gives each advice with an action a button that says what it does", () => {
    const html = render();
    expect(html).toContain("3 presentations would have no judge.");
    expect(html).toContain(">Archive 2 tables</button>");
    expect(html).toContain(">Add 3 tables</button>");
    expect(html).toContain(">Add room</button>");
    expect(html).toContain("It will be called Alpha 2.");
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it("disables the buttons while a change is pending or read-only", () => {
    mocks.pending = true;
    expect(render()).toContain("Working…");
    mocks.pending = false;
    mocks.readOnly = true;
    expect(render().match(/<button[^>]* disabled=""/g)).toHaveLength(3);
  });

  it("shows the error a change gave", () => {
    mocks.error = { message: "Table 4 has 1 scheduled presentation." };
    expect(render()).toContain('role="alert"');
  });
});
