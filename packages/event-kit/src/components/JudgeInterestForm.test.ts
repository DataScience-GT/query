import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeInterestUrl } from "./JudgeInterestForm";

const portal = "https://portal.example";
const local = "http://localhost:4000";

const onHost = (hostname: string) => vi.stubGlobal("window", { location: { hostname } });

afterEach(() => vi.unstubAllGlobals());

describe("judgeInterestUrl", () => {
  it("posts to the portal when there is no page, as at build time", () => {
    expect(judgeInterestUrl(portal, local)).toBe(`${portal}/api/judge-interest`);
  });

  it("posts to the portal from a public host", () => {
    onHost("hacklytics.io");
    expect(judgeInterestUrl(portal, local)).toBe(`${portal}/api/judge-interest`);
  });

  it("posts to the dev portal from a loopback host", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      onHost(host);
      expect(judgeInterestUrl(portal, local)).toBe(`${local}/api/judge-interest`);
    }
  });

  it("posts to the portal from a loopback host when the site names no dev portal", () => {
    onHost("localhost");
    expect(judgeInterestUrl(portal)).toBe(`${portal}/api/judge-interest`);
  });
});
