import { describe, it, expect } from "vitest";
import { safeCallback } from "./safe-callback";

/**
 * Open-redirect surface.
 *
 * The value comes from `?callbackUrl=` and, after email-code verification, is
 * assigned straight to `window.location.href`. Anything this function returns
 * is somewhere a freshly signed-in member can be sent, so the interesting
 * inputs are the ones a browser reads differently from a naive prefix check.
 */
describe("safeCallback — hostile input", () => {
  it("allows an ordinary same-origin path", () => {
    expect(safeCallback("/dashboard")).toBe("/dashboard");
  });

  it("allows a path with a query string and fragment", () => {
    expect(safeCallback("/hackathons/1?tab=teams#top")).toBe(
      "/hackathons/1?tab=teams#top",
    );
  });

  it("rejects an absolute http URL", () => {
    expect(safeCallback("https://evil.example")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeCallback("//evil.example")).toBeNull();
  });

  it("rejects a backslash protocol-relative URL", () => {
    expect(safeCallback("/\\evil.example")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    expect(safeCallback("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data: URL", () => {
    expect(safeCallback("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects a bare hostname", () => {
    expect(safeCallback("evil.example")).toBeNull();
  });

  it("rejects null, undefined and empty", () => {
    expect(safeCallback(null)).toBeNull();
    expect(safeCallback(undefined)).toBeNull();
    expect(safeCallback("")).toBeNull();
  });

  it("rejects a leading space before a protocol-relative URL", () => {
    expect(safeCallback(" //evil.example")).toBeNull();
  });

  /**
   * URL parsing removes ASCII tab and newline from the input (WHATWG URL,
   * "remove all ASCII tab or newline"). So the browser reads "/\t/evil.example"
   * as "//evil.example" — protocol-relative, and therefore another origin —
   * while a literal prefix check sees a harmless-looking path.
   */
  it("rejects a tab hidden inside a protocol-relative URL", () => {
    expect(safeCallback("/\t/evil.example")).toBeNull();
  });

  it("rejects a newline hidden inside a protocol-relative URL", () => {
    expect(safeCallback("/\n/evil.example")).toBeNull();
  });

  it("rejects a carriage return hidden inside a protocol-relative URL", () => {
    expect(safeCallback("/\r/evil.example")).toBeNull();
  });

  it("rejects a tab followed by a backslash", () => {
    expect(safeCallback("/\t\\evil.example")).toBeNull();
  });

  it("rejects a tab splitting the leading double slash", () => {
    expect(safeCallback("/\t//evil.example")).toBeNull();
  });
});
