import { describe, expect, it, vi } from "vitest";

vi.mock("@query/core/server", () => ({
  siteOrigin: () => "https://query.example",
}));

import { isSameOriginRequest } from "./same-origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("isSameOriginRequest", () => {
  it("accepts the site's own Origin", () => {
    expect(isSameOriginRequest(h({ origin: "https://query.example" }))).toBe(true);
  });
  it("rejects a foreign or sibling-host Origin", () => {
    expect(isSameOriginRequest(h({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(h({ origin: "https://x.query.example" }))).toBe(false);
  });
  it("trusts Origin over Sec-Fetch-Site when both are sent", () => {
    expect(
      isSameOriginRequest(
        h({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }),
      ),
    ).toBe(false);
  });
  it("falls back to Sec-Fetch-Site when Origin is absent", () => {
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(h({}))).toBe(false);
  });
});
