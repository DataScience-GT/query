import { describe, expect, it } from "vitest";
import { projectMatchesTrack } from "./match";

describe("projectMatchesTrack", () => {
  const project = {
    tracks: ["Finance"],
    challenges: ["Sponsor"],
    isCreateX: true,
  };

  it("matches every project when the judge has no track", () => {
    expect(projectMatchesTrack(project, null)).toBe(true);
  });

  it("matches by track, challenge, and the createx flag", () => {
    expect(projectMatchesTrack(project, "Finance")).toBe(true);
    expect(projectMatchesTrack(project, "Sponsor")).toBe(true);
    expect(projectMatchesTrack(project, "createX")).toBe(true);
    expect(projectMatchesTrack(project, "Health")).toBe(false);
  });
});
