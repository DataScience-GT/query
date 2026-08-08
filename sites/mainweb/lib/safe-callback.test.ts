import { describe, it, expect } from "vitest";
import { safeCallback } from "./safe-callback";

describe("safeCallback", () => {
  it("keeps a same-origin path", () => {
    expect(safeCallback("/hacklytics")).toBe("/hacklytics");
    expect(safeCallback("/hackathons/123?tab=teams")).toBe(
      "/hackathons/123?tab=teams",
    );
  });

  it("rejects anything that is not a path", () => {
    expect(safeCallback(null)).toBeNull();
    expect(safeCallback(undefined)).toBeNull();
    expect(safeCallback("")).toBeNull();
    expect(safeCallback("https://evil.example")).toBeNull();
    expect(safeCallback("javascript:alert(1)")).toBeNull();
    expect(safeCallback("hacklytics")).toBeNull();
  });

  /**
   * The reason a bare startsWith("/") is not enough. Both of these begin with a
   * slash and both are read by browsers as another origin, so either one turns
   * the sign-in screen into an open redirect.
   */
  it("rejects protocol-relative URLs that start with a slash", () => {
    expect(safeCallback("//evil.example")).toBeNull();
    expect(safeCallback("//evil.example/path")).toBeNull();
    expect(safeCallback("/\\evil.example")).toBeNull();
  });
});
