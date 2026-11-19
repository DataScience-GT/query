import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: [] as { name: string }[],
  session: null as unknown,
  createContext: vi.fn(),
  getPortalContext: vi.fn(),
  myRegistrations: vi.fn(),
  me: vi.fn(),
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
      user: { getPortalContext: mocks.getPortalContext, me: mocks.me },
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
  mocks.me.mockReset();
  mocks.me.mockResolvedValue({ id: "u1" });
});

describe("loadPortalBootstrap round trips", () => {
  it("starts the registrations read before the portal context settles", async () => {
    let settle: (value: unknown) => void = () => {};
    mocks.getPortalContext.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const loading = loadPortalBootstrap();
    await vi.waitFor(() => expect(mocks.getPortalContext).toHaveBeenCalled());
    await Promise.resolve();
    expect(mocks.myRegistrations).toHaveBeenCalledTimes(1);

    settle({ isAdmin: false, isBugTester: false });
    await loading;
  });

  it("starts the profile read beside them and ignores its failure", async () => {
    mocks.me.mockRejectedValue(new Error("db down"));

    const result = await loadPortalBootstrap();
    expect(mocks.me).toHaveBeenCalledTimes(1);
    expect(result.navFailed).toBe(false);
  });

  it("leaves registrations out for staff and ignores a failure of the discarded read", async () => {
    mocks.getPortalContext.mockResolvedValue({
      isAdmin: true,
      isBugTester: false,
    });
    mocks.myRegistrations.mockRejectedValue(new Error("not needed"));

    const result = await loadPortalBootstrap();
    expect(result.registrations).toBeUndefined();
    expect(result.navFailed).toBe(false);
  });
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
