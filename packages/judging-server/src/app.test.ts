import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createMetrics } from "./metrics";

describe("health", () => {
  it("answers /healthz without a database", async () => {
    const app = createApp({
      db: {} as never,
      metrics: createMetrics(),
      jwtSecret: "test",
      devAuth: false,
      busMode: "memory",
    });
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
