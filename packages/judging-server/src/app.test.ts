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

describe("session actor", () => {
  it("asks resolveActor when there is no bearer token", async () => {
    const seen: string[] = [];
    const app = createApp({
      db: {} as never,
      metrics: createMetrics(),
      jwtSecret: "test",
      devAuth: false,
      busMode: "memory",
      resolveActor: async (request) => {
        seen.push(new URL(request.url).pathname);
        return null;
      },
    });
    const response = await app.request(
      "/v1/session/progress?eventId=00000000-0000-4000-8000-000000000000",
    );
    expect(response.status).toBe(401);
    expect(seen).toEqual(["/v1/session/progress"]);
  });
});
