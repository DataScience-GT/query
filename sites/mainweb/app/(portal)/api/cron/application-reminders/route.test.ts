import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const run = vi.hoisted(() => vi.fn());
vi.mock("@query/db", () => ({ db: { marker: "db" } }));
vi.mock("@query/api/application-reminders", () => ({
  sendApplicationReminders: run,
}));

const SECRET = "s3cret-token-value";

let counter = 0;
/** Each call gets its own address unless told otherwise, so the limiter never crosses cases. */
const call = (
  headers: Record<string, string> = {},
  ip = `198.51.100.${++counter}`,
) =>
  POST(
    new Request("http://localhost/api/cron/application-reminders", {
      method: "POST",
      headers: { "x-forwarded-for": ip, ...headers },
    }) as never,
  );

describe("POST /api/cron/application-reminders", () => {
  beforeEach(() => {
    run.mockReset();
    run.mockResolvedValue({ claimed: 3, sent: 2, failed: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers 404 when CRON_SECRET is not set, even with a token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 401 without a token, with a wrong one, and with the wrong scheme", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    for (const authorization of [
      undefined,
      "Bearer wrong",
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      `Basic ${SECRET}`,
      SECRET,
    ]) {
      const res = await call(authorization ? { authorization } : {});
      expect(res.status).toBe(401);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the reminders and reports the counts on a good token", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ claimed: 3, sent: 2, failed: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toEqual({ marker: "db" });
  });

  it("answers 500 without the error text when a run fails", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    run.mockRejectedValue(new Error("connection string postgres://secret"));
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("postgres");
    log.mockRestore();
  });

  it("limits an address, wrong guesses included, and leaves others alone", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (await call({ authorization: "Bearer nope" }, "203.0.113.9")).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    const other = await call(
      { authorization: `Bearer ${SECRET}` },
      "203.0.113.10",
    );
    expect(other.status).toBe(200);
  });
});
