import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: [] as { name: string }[],
  session: null as unknown,
  createContext: vi.fn(),
  getPortalContext: vi.fn(),
  myRegistrations: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => mocks.cookies }),
  headers: async () => new Headers(),
}));

vi.mock("@query/api", () => ({
  resolveClientIp: () => undefined,
  createContext: mocks.createContext,
  appRouter: {
    createCaller: () => ({
      user: { getPortalContext: mocks.getPortalContext },
      hackathon: { myRegistrations: mocks.myRegistrations },
    }),
  },
}));

const { loadPortalBootstrap } = await import("./portal-bootstrap.server");

const signedIn = { user: { id: "u1", name: "Ada" }, expires: "2099-01-01" };

beforeEach(() => {
  mocks.cookies = [{ name: "authjs.session-token" }];
  mocks.createContext.mockReset();
  mocks.createContext.mockImplementation(async () => ({
    session: mocks.session,
  }));
  mocks.session = signedIn;
  mocks.getPortalContext.mockReset();
  mocks.getPortalContext.mockResolvedValue({
    isAdmin: false,
    isBugTester: false,
  });
  mocks.myRegistrations.mockReset();
  mocks.myRegistrations.mockResolvedValue([]);
});

describe("loadPortalBootstrap navFailed", () => {
  it("is false when every read succeeds", async () => {
    expect((await loadPortalBootstrap()).navFailed).toBe(false);
  });

  it("is false for a visitor with no session cookie", async () => {
    mocks.cookies = [];
    expect((await loadPortalBootstrap()).navFailed).toBe(false);
  });

  it("is true when the session lookup throws", async () => {
    mocks.createContext.mockRejectedValue(new Error("db down"));
    expect((await loadPortalBootstrap()).navFailed).toBe(true);
  });

  it("is true when a session cookie finds no session, since createContext swallows lookup errors", async () => {
    mocks.session = null;
    expect((await loadPortalBootstrap()).navFailed).toBe(true);
  });

  it("is true when the portal context read fails", async () => {
    mocks.getPortalContext.mockRejectedValue(new Error("db down"));
    expect((await loadPortalBootstrap()).navFailed).toBe(true);
  });

  it("is true when the registrations read fails", async () => {
    mocks.myRegistrations.mockRejectedValue(new Error("db down"));
    expect((await loadPortalBootstrap()).navFailed).toBe(true);
  });
});
