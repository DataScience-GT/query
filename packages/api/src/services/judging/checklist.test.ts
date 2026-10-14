import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  rubricLockReason,
  stateChangeProblem,
} from "./checklist";
import type { ChecklistFacts } from "./checklist";

const ready: ChecklistFacts = {
  entries: { devpost: 180, portal: 12 },
  ratingItems: 4,
  groupsInitialized: true,
  scheduledRoots: [
    {
      label: "General",
      rooms: [
        { name: "Klaus 1116", kind: "room", hasBuilding: true, hasLink: true },
        { name: "Klaus 1447", kind: "room", hasBuilding: true, hasLink: true },
      ],
    },
  ],
  scheduleSaved: true,
  state: "open",
  claimsStarted: true,
  itineraryPublished: true,
};

const item = (facts: ChecklistFacts, key: string) =>
  buildChecklist(facts).find((i) => i.key === key)!;

describe("buildChecklist", () => {
  it("lists every step, in order, done when everything is in place", () => {
    const items = buildChecklist(ready);
    expect(items.map((i) => i.key)).toEqual([
      "projects",
      "rubric",
      "rooms",
      "schedule",
      "open",
      "claims",
      "itinerary",
    ]);
    expect(items.every((i) => i.done)).toBe(true);
    expect(item(ready, "projects").hint).toBe(
      "192 projects: 180 from Devpost, 12 from portal submissions.",
    );
    expect(item(ready, "rooms").hint).toBe(
      "2 rooms across 1 scheduled challenge, each with a building and a QR link.",
    );
  });

  it("counts tables apart from rooms", () => {
    const withTables: ChecklistFacts = {
      ...ready,
      scheduledRoots: [
        {
          label: "General",
          rooms: [1, 2, 3].map((n) => ({
            name: `Table ${n}`,
            kind: "table" as const,
            hasBuilding: true,
            hasLink: true,
          })),
        },
        ...ready.scheduledRoots.map((root) => ({ ...root, label: "Sponsor" })),
      ],
    };
    expect(item(withTables, "rooms").hint).toBe(
      "2 rooms and 3 tables across 2 scheduled challenges, each with a building and a QR link.",
    );
  });

  it("starts with nothing done on a new edition", () => {
    const fresh: ChecklistFacts = {
      entries: { devpost: 0, portal: 0 },
      ratingItems: 0,
      groupsInitialized: false,
      scheduledRoots: [],
      scheduleSaved: false,
      state: "draft",
      claimsStarted: false,
      itineraryPublished: false,
    };
    const items = buildChecklist(fresh);
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual([
      // Nothing scheduled has projects, and no Devpost projects need claiming.
      "rooms",
      "claims",
    ]);
    expect(item(fresh, "rubric").hint).toMatch(/starter groups/);
  });

  it("asks for a rating once the groups exist", () => {
    const facts = { ...ready, ratingItems: 0 };
    expect(item(facts, "rubric")).toMatchObject({
      done: false,
      hint: "Add at least one rating question to the rubric.",
    });
  });

  it("names the first scheduled challenge or room that is not ready", () => {
    const noRoom = {
      ...ready,
      scheduledRoots: [...ready.scheduledRoots, { label: "Best Use of Snowflake", rooms: [] }],
    };
    expect(item(noRoom, "rooms")).toMatchObject({
      done: false,
      hint: "Best Use of Snowflake has no room or table. Add one on the Rooms tab.",
    });

    const noBuilding = {
      ...ready,
      scheduledRoots: [
        {
          label: "General",
          rooms: [
            {
              name: "Klaus 1116",
              kind: "room" as const,
              hasBuilding: true,
              hasLink: false,
            },
            {
              name: "Annex",
              kind: "room" as const,
              hasBuilding: false,
              hasLink: true,
            },
          ],
        },
      ],
    };
    // A missing building comes first: the schedule cannot be built without it.
    expect(item(noBuilding, "rooms").hint).toMatch(/^Annex has no building/);

    const noLink = {
      ...ready,
      scheduledRoots: [
        {
          label: "General",
          rooms: [
            {
              name: "Klaus 1116",
              kind: "room" as const,
              hasBuilding: true,
              hasLink: false,
            },
          ],
        },
      ],
    };
    expect(item(noLink, "rooms").hint).toBe(
      "Klaus 1116 has no QR link. Generate one on the Rooms tab.",
    );
  });

  it("treats claims as done when every project came from the portal", () => {
    const portalOnly = {
      ...ready,
      entries: { devpost: 0, portal: 40 },
      claimsStarted: false,
    };
    expect(item(portalOnly, "claims").done).toBe(true);
    expect(
      item({ ...ready, claimsStarted: false }, "claims"),
    ).toMatchObject({ done: false, hint: expect.stringMatching(/claim links/) });
  });

  it("says when judging was closed rather than never opened", () => {
    expect(item({ ...ready, state: "closed" }, "open")).toMatchObject({
      done: false,
      hint: expect.stringMatching(/closed. Reopen/),
    });
  });
});

describe("stateChangeProblem", () => {
  const facts = { ratingItems: 3, hasEvaluations: false };

  it("allows draft to open, open to closed and back", () => {
    expect(stateChangeProblem("draft", "open", facts)).toBeNull();
    expect(stateChangeProblem("open", "closed", facts)).toBeNull();
    expect(stateChangeProblem("closed", "open", facts)).toBeNull();
    expect(stateChangeProblem("open", "open", facts)).toBeNull();
  });

  it("needs a rating question to open", () => {
    expect(
      stateChangeProblem("draft", "open", { ...facts, ratingItems: 0 }),
    ).toMatch(/rating question/);
  });

  it("cannot close what was never opened", () => {
    expect(stateChangeProblem("draft", "closed", facts)).toMatch(/not been opened/);
  });

  it("goes back to draft only before anyone scores", () => {
    expect(stateChangeProblem("open", "draft", facts)).toBeNull();
    expect(stateChangeProblem("closed", "draft", facts)).toBeNull();
    expect(
      stateChangeProblem("closed", "draft", { ...facts, hasEvaluations: true }),
    ).toMatch(/cannot go back to draft/);
  });
});

describe("rubricLockReason", () => {
  const draft = { state: "draft" as const, scheduleSaved: false, hasEvaluations: false };

  it("is editable in draft with nothing saved", () => {
    expect(rubricLockReason(draft)).toBeNull();
  });

  it("locks once judging opens, scores exist or a schedule is saved", () => {
    expect(rubricLockReason({ ...draft, state: "open" })).toMatch(/opened/);
    expect(rubricLockReason({ ...draft, hasEvaluations: true })).toMatch(
      /scored/,
    );
    expect(rubricLockReason({ ...draft, scheduleSaved: true })).toMatch(
      /schedule is saved/,
    );
  });
});
