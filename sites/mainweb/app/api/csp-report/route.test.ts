import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/csp-report/route";

const report = (ip: string) =>
  POST(
    new Request("http://localhost/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "content-length": "20",
        "x-forwarded-for": ip,
      },
      body: '{"csp-report":{"a":1}}',
    }) as never,
  );

describe("POST /api/csp-report", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a report and answers 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await report("198.51.100.1");
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("drops reports from one address once it passes its limit, still answering 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 40; i += 1) {
      expect((await report("198.51.100.2")).status).toBe(204);
    }
    expect(warn.mock.calls.length).toBeLessThan(40);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(30);

    // Another address is unaffected.
    warn.mockClear();
    await report("198.51.100.3");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
