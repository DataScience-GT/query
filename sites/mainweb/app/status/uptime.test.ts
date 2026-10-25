import { afterEach, describe, expect, it, vi } from "vitest";
import { loadUptime } from "./uptime";

afterEach(() => vi.unstubAllGlobals());

describe("loadUptime", () => {
  it("returns the parsed file", async () => {
    const body = {
      version: 1,
      updatedAt: 1,
      recent: [],
      days: [],
      deploy: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect(await loadUptime()).toEqual(body);
  });

  it("returns null on a network error, a bad status or a bad body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await loadUptime()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    expect(await loadUptime()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ nope: 1 })),
    );
    expect(await loadUptime()).toBeNull();
  });
});
