import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { fileTag, planImport, portalLabels } from "./import";
import type { ImportFacts } from "./import";

const quiet: ImportFacts = {
  inventoryLocked: false,
  claimsStarted: false,
  hasEvaluations: false,
  scheduleSaved: false,
};
const name = { hackathonName: "Hacklytics 2027" };

function refusal(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    return error as TRPCError;
  }
  throw new Error("expected a refusal");
}

describe("planImport", () => {
  describe("automatic", () => {
    it("replaces while nothing depends on the project list", () => {
      expect(planImport("automatic", quiet, name)).toEqual({
        replace: true,
        revokeAccess: false,
      });
    });

    it.each([
      ["a room link locked the list", { inventoryLocked: true }],
      ["hackers have claimed", { claimsStarted: true }],
      ["judges have scored", { hasEvaluations: true }],
      ["a schedule is saved", { scheduleSaved: true }],
    ])("only adds once %s", (_why, facts) => {
      expect(planImport("automatic", { ...quiet, ...facts }, name)).toEqual({
        replace: false,
        revokeAccess: false,
      });
    });
  });

  describe("replace", () => {
    it("replaces an unlocked list without asking for the name", () => {
      expect(planImport("replace", quiet, name)).toEqual({
        replace: true,
        revokeAccess: false,
      });
    });

    it("needs the typed name once room links are out, then signs guests out", () => {
      const locked = { ...quiet, inventoryLocked: true };
      expect(refusal(() => planImport("replace", locked, name)).code).toBe(
        "BAD_REQUEST",
      );
      expect(
        refusal(() =>
          planImport("replace", locked, { ...name, typed: "hacklytics 2027" }),
        ).message,
      ).toContain("Type the hackathon name, Hacklytics 2027");
      expect(
        planImport("replace", locked, { ...name, typed: " Hacklytics 2027 " }),
      ).toEqual({ replace: true, revokeAccess: true });
    });

    it.each([
      ["claims", { claimsStarted: true }, /claiming/],
      ["a saved schedule", { scheduleSaved: true }, /schedule is saved/],
      ["evaluations", { hasEvaluations: true }, /scored/],
    ])("is refused after %s, even with the name typed", (_why, facts, message) => {
      const error = refusal(() =>
        planImport(
          "replace",
          { ...quiet, inventoryLocked: true, ...facts },
          { ...name, typed: "Hacklytics 2027" },
        ),
      );
      expect(error.code).toBe("PRECONDITION_FAILED");
      expect(error.message).toMatch(message);
    });
  });
});

describe("portalLabels", () => {
  it("joins tracks, challenges and CreateX, without NONE or repeats", () => {
    expect(
      portalLabels({
        tracks: ["Healthcare", "NONE", " Finance "],
        challenges: ["MLH_MONGODB", "healthcare", ""],
        isCreateX: true,
      }),
    ).toEqual(["CreateX", "Finance", "Healthcare", "MLH_MONGODB"]);
  });

  it("is empty for a project that opted into nothing", () => {
    expect(
      portalLabels({ tracks: null, challenges: ["none"], isCreateX: false }),
    ).toEqual([]);
  });
});

describe("fileTag", () => {
  it("is short, stable and says nothing about the contents", () => {
    const csv = "Project Title,Submitter Email\nTidewater,priya@gatech.edu\n";
    expect(fileTag(csv)).toMatch(/^[0-9a-f]{12}$/);
    expect(fileTag(csv)).toBe(fileTag(csv));
    expect(fileTag(`${csv} `)).not.toBe(fileTag(csv));
  });
});
