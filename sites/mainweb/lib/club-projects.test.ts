import { describe, expect, it } from "vitest";
import {
  INTEREST_FORM_URL,
  STATUS_CLASSES,
  STATUS_LABELS,
  byDisplayOrder,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
  type ClubProjectCard,
} from "./club-projects";

const card = (overrides: Partial<ClubProjectCard>): ClubProjectCard => ({
  id: "id",
  slug: "slug",
  name: "Project",
  status: "active",
  leadName: null,
  summary: "Summary",
  tech: [],
  repoUrl: null,
  joinUrl: null,
  capacityNote: null,
  term: "Fall 2026",
  initiativeId: null,
  sortOrder: 0,
  ...overrides,
});

describe("groupClubProjects", () => {
  it("keeps past projects out of the current roster", () => {
    const { current, past } = groupClubProjects([
      card({ id: "a", name: "Active", status: "active" }),
      card({ id: "b", name: "Old", status: "past" }),
      card({ id: "c", name: "Reviving", status: "revived" }),
      card({ id: "d", name: "Unclaimed", status: "needs_lead" }),
    ]);

    expect(current.map((p) => p.id)).toEqual(["a", "c", "d"]);
    expect(past.map((p) => p.id)).toEqual(["b"]);
  });

  it("orders by sortOrder, then name", () => {
    const projects = [
      card({ id: "z", name: "Zebra", sortOrder: 10 }),
      card({ id: "a", name: "Apple", sortOrder: 10 }),
      card({ id: "f", name: "First", sortOrder: 5 }),
    ];

    expect(groupClubProjects(projects).current.map((p) => p.id)).toEqual([
      "f",
      "a",
      "z",
    ]);
  });

  it("sorts deterministically when called twice on the same data", () => {
    const projects = [
      card({ id: "b", name: "B", sortOrder: 1 }),
      card({ id: "a", name: "A", sortOrder: 1 }),
    ];

    const first = groupClubProjects([...projects]).current.map((p) => p.id);
    const second = groupClubProjects([...projects]).current.map((p) => p.id);
    expect(first).toEqual(second);
  });

  it("returns empty groups for an empty roster", () => {
    expect(groupClubProjects([])).toEqual({ current: [], past: [] });
  });
});

describe("byDisplayOrder", () => {
  it("breaks sortOrder ties on name", () => {
    expect(
      byDisplayOrder(
        card({ name: "A", sortOrder: 1 }),
        card({ name: "B", sortOrder: 1 }),
      ),
    ).toBeLessThan(0);
  });
});

describe("joinHref", () => {
  it("sends a project with an initiative into the portal", () => {
    expect(joinHref(card({ initiativeId: "abc" }))).toBe("/initiatives");
  });

  it("prefers the portal over an external link when both exist", () => {
    expect(
      joinHref(card({ initiativeId: "abc", joinUrl: "https://example.org" })),
    ).toBe("/initiatives");
  });

  it("uses the project's own link when there is no initiative", () => {
    expect(joinHref(card({ joinUrl: "https://dsgt-arc.org/join" }))).toBe(
      "https://dsgt-arc.org/join",
    );
  });

  it("never leaves a card without somewhere to go", () => {
    expect(joinHref(card({}))).toBe(INTEREST_FORM_URL);
  });
});

describe("isExternalJoin", () => {
  it("is true only for off-site destinations", () => {
    expect(isExternalJoin(card({ initiativeId: "abc" }))).toBe(false);
    expect(isExternalJoin(card({ joinUrl: "https://dsgt-arc.org/join" }))).toBe(
      true,
    );
    expect(isExternalJoin(card({}))).toBe(true);
  });
});

describe("joinLabel", () => {
  it("asks for a lead when the project has none", () => {
    expect(joinLabel(card({ status: "needs_lead" }))).toBe("Lead this project");
  });

  it("says apply when there is an initiative to apply to", () => {
    expect(joinLabel(card({ initiativeId: "abc" }))).toBe("Apply to join");
  });

  it("falls back to interest for an external project", () => {
    expect(joinLabel(card({ joinUrl: "https://dsgt-arc.org/join" }))).toBe(
      "Express interest",
    );
  });
});

describe("status presentation", () => {
  it("labels and colours every status", () => {
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(STATUS_LABELS[status as keyof typeof STATUS_LABELS]).toBeTruthy();
      expect(
        STATUS_CLASSES[status as keyof typeof STATUS_CLASSES],
      ).toBeTruthy();
    }
  });

  it("does not present past projects in the active colour", () => {
    expect(STATUS_CLASSES.past).not.toBe(STATUS_CLASSES.active);
  });
});
