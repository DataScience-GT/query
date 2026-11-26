import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  allowed: true,
  busy: false,
  ranFrom: null as string | null,
  posts: 0,
}));

vi.mock("@query/core/server", () => ({
  siteOrigin: () => "https://query.example",
}));

vi.mock("@query/auth", () => ({
  handlers: {
    GET: vi.fn(),
    POST: async () => {
      state.posts += 1;
      return new Response(JSON.stringify({ url: "https://query.example/verify" }), {
        status: 200,
      });
    },
  },
  // The real one carries the client address to sendVerificationRequest and
  // reports whether a cap kept the code back.
  runCodeRequest: async (ip: string, handle: () => Promise<Response>) => {
    state.ranFrom = ip;
    return { response: await handle(), busy: state.busy };
  },
}));

vi.mock("@query/api", () => ({
  rateLimit: () => ({ allowed: state.allowed }),
  resolveClientIp: (forwarded: string | null) =>
    forwarded?.split(",").at(-1)?.trim() ?? "unknown",
}));

const { POST } = await import("@/app/(portal)/api/auth/[...nextauth]/route");

const post = (path: string) =>
  POST({
    url: `https://query.example/api/auth/${path}`,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-forwarded-for" ? "9.9.9.9, 203.0.113.7" : null,
    },
  } as unknown as NextRequest);

describe("POST /api/auth/signin/nodemailer", () => {
  beforeEach(() => {
    state.allowed = true;
    state.busy = false;
    state.ranFrom = null;
    state.posts = 0;
  });

  it("passes a request through and runs it as the client's address", async () => {
    const res = await post("signin/nodemailer");

    expect(res.status).toBe(200);
    expect(state.ranFrom).toBe("203.0.113.7");
  });

  it("answers 429 with the sign-in error the page reads when a cap held the code back", async () => {
    state.busy = true;
    const res = await post("signin/nodemailer");

    expect(res.status).toBe(429);
    // next-auth/react reads `error` off the url it is given.
    const { url } = (await res.json()) as { url: string };
    expect(new URL(url).searchParams.get("error")).toBe("CodesBusy");
  });

  it("answers the same way when this instance's own limiter refuses, without sending anything", async () => {
    state.allowed = false;
    const res = await post("signin/nodemailer");

    expect(res.status).toBe(429);
    const { url } = (await res.json()) as { url: string };
    expect(new URL(url).searchParams.get("error")).toBe("CodesBusy");
    expect(state.posts).toBe(0);
  });

  it("leaves every other sign-in request alone", async () => {
    state.allowed = false;
    state.busy = true;
    const res = await post("signin/discord");

    expect(res.status).toBe(200);
    expect(state.ranFrom).toBeNull();
  });
});
