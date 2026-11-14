import { beforeEach, describe, expect, it, vi } from "vitest";

const mockValues = vi.fn();
const mockConflict = vi.fn();

vi.mock("@query/db", () => ({
  judgeInterest: {
    edition: "edition",
    email: "email",
  },
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mockValues(values);
        return {
          onConflictDoUpdate: (args: unknown) => {
            mockConflict(args);
            return Promise.resolve();
          },
        };
      },
    }),
  },
}));

import { OPTIONS, POST } from "@/app/(portal)/api/judge-interest/route";

const ORIGIN = "https://hacklytics.io";
const valid = {
  name: "Ada Lovelace",
  email: "  Ada@Example.COM ",
  company: "Analytical Engines",
  title: "Principal",
  expertise: "ML",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  message: "Happy to help.",
};

// A fresh address per test, so the per-IP limiter's state does not leak.
let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

function post(
  body: unknown,
  headers: Record<string, string> = {},
  raw = false,
) {
  return POST(
    new Request("http://localhost/api/judge-interest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": nextIp(),
        ...headers,
      },
      body: raw ? (body as string) : JSON.stringify(body),
    }) as never,
  );
}

describe("POST /api/judge-interest", () => {
  beforeEach(() => {
    mockValues.mockClear();
    mockConflict.mockClear();
  });

  it("saves a valid submission with the email normalised", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        edition: "hacklytics-2027",
        email: "ada@example.com",
        name: "Ada Lovelace",
        company: "Analytical Engines",
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("stores blank optional fields as null", async () => {
    const res = await post({
      name: "A",
      email: "a@b.co",
      company: "C",
      title: "",
      linkedinUrl: "",
    });
    expect(res.status).toBe(200);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, linkedinUrl: null, message: null }),
    );
  });

  it("upserts on (edition, email) so a resubmit updates the row", async () => {
    const first = await post(valid);
    const second = await post({ ...valid, company: "New Co" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockConflict).toHaveBeenCalledTimes(2);
    const { target, set } = mockConflict.mock.calls[1][0] as {
      target: string[];
      set: Record<string, unknown>;
    };
    expect(target).toEqual(["edition", "email"]);
    expect(set.company).toBe("New Co");
  });

  it("answers a honeypot hit with success and stores nothing", async () => {
    const res = await post({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockValues).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing name", { ...valid, name: "" }],
    ["a missing company", { ...valid, company: "  " }],
    ["a bad email", { ...valid, email: "not-an-email" }],
    ["a non-URL LinkedIn", { ...valid, linkedinUrl: "linkedin" }],
    ["a javascript: LinkedIn", { ...valid, linkedinUrl: "javascript:alert(1)" }],
    ["an over-long message", { ...valid, message: "x".repeat(1001) }],
    ["an over-long name", { ...valid, name: "x".repeat(121) }],
  ])("rejects %s with 400 and a message", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error.length).toBeGreaterThan(0);
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await post("{nope", {}, true);
    expect(res.status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const res = await post({ ...valid, message: "x".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("rate limits one address after ten submissions", async () => {
    const headers = { "x-forwarded-for": "198.51.100.77" };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await post(valid, headers)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const blocked = await post(valid, headers);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  describe("CORS", () => {
    it.each([
      "https://hacklytics.io",
      "https://www.hacklytics.io",
      "https://hacklytics2027.web.app",
      "http://localhost:3000",
      "http://localhost:4321",
    ])("answers the preflight for %s", (origin) => {
      const res = OPTIONS(
        new Request("http://localhost/api/judge-interest", {
          method: "OPTIONS",
          headers: { origin },
        }) as never,
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it.each(["https://evil.example", "https://hacklytics.io.evil.example", ""])(
      "refuses the preflight for %j",
      (origin) => {
        const res = OPTIONS(
          new Request("http://localhost/api/judge-interest", {
            method: "OPTIONS",
            headers: origin ? { origin } : {},
          }) as never,
        );
        expect(res.status).toBe(403);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
      },
    );

    it("refuses a POST from another origin without saving", async () => {
      const res = await post(valid, { origin: "https://evil.example" });
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(mockValues).not.toHaveBeenCalled();
    });
  });
});
