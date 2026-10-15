import { describe, expect, it } from "vitest";
import {
  descendantsOf,
  effectiveMode,
  normalizeLabel,
  rootOf,
  sameLabel,
} from "./scope";
import type { ChallengeNode } from "./scope";

// General (scheduled, no children)
// MLH Challenges (unscheduled group)
//   ├── Best Use of MongoDB (stored as scheduled, inherits unscheduled)
//   │     └── MongoDB Atlas bonus
//   └── Best Domain Name
// Online (remote)
const challenges: ChallengeNode[] = [
  { id: "general", parentId: null, mode: "scheduled" },
  { id: "mlh", parentId: null, mode: "unscheduled" },
  { id: "mongo", parentId: "mlh", mode: "scheduled" },
  { id: "domain", parentId: "mlh", mode: "remote" },
  { id: "atlas", parentId: "mongo", mode: "scheduled" },
  { id: "online", parentId: null, mode: "remote" },
];

describe("rootOf", () => {
  it("is the challenge itself when it has no parent", () => {
    expect(rootOf(challenges, "general")?.id).toBe("general");
  });

  it("walks up to the top of the tree", () => {
    expect(rootOf(challenges, "mongo")?.id).toBe("mlh");
    expect(rootOf(challenges, "atlas")?.id).toBe("mlh");
  });

  it("is null for an id that is not in the list", () => {
    expect(rootOf(challenges, "missing")).toBeNull();
  });

  it("treats a parent that is not in the list as no parent", () => {
    const orphan = [{ id: "a", parentId: "gone", mode: "remote" as const }];
    expect(rootOf(orphan, "a")?.id).toBe("a");
  });

  it("is null when parent links loop", () => {
    const loop: ChallengeNode[] = [
      { id: "a", parentId: "b", mode: "scheduled" },
      { id: "b", parentId: "a", mode: "scheduled" },
    ];
    expect(rootOf(loop, "a")).toBeNull();
  });
});

describe("effectiveMode", () => {
  it("is a root's own mode", () => {
    expect(effectiveMode(challenges, "general")).toBe("scheduled");
    expect(effectiveMode(challenges, "online")).toBe("remote");
  });

  it("is inherited from the root, whatever the child stores", () => {
    expect(effectiveMode(challenges, "mongo")).toBe("unscheduled");
    expect(effectiveMode(challenges, "domain")).toBe("unscheduled");
    expect(effectiveMode(challenges, "atlas")).toBe("unscheduled");
  });

  it("is null for an unknown challenge", () => {
    expect(effectiveMode(challenges, "missing")).toBeNull();
  });
});

describe("descendantsOf", () => {
  it("lists every level below, nearest first, not the challenge itself", () => {
    expect(descendantsOf(challenges, "mlh").map((c) => c.id)).toEqual([
      "mongo",
      "domain",
      "atlas",
    ]);
  });

  it("is empty for a leaf or an unknown id", () => {
    expect(descendantsOf(challenges, "general")).toEqual([]);
    expect(descendantsOf(challenges, "missing")).toEqual([]);
  });

  it("starts below a child, not at its root", () => {
    expect(descendantsOf(challenges, "mongo").map((c) => c.id)).toEqual([
      "atlas",
    ]);
  });
});

describe("labels", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeLabel("  Best   Use of\tMongoDB \n")).toBe(
      "Best Use of MongoDB",
    );
  });

  it("matches ignoring case and spacing", () => {
    expect(sameLabel("Best Use of MongoDB", " best use  of mongodb")).toBe(
      true,
    );
    expect(sameLabel("MLH", "mlh")).toBe(true);
  });

  it("does not match different labels", () => {
    expect(sameLabel("Best Use of MongoDB", "Best Use of Gemini")).toBe(false);
    expect(sameLabel("AI", "A I")).toBe(false);
  });
});
