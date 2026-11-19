import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useInvalidatePortalContext } from "./use-portal-context";

// The root vitest config compiles JSX to React.createElement, and components
// written for Next's automatic runtime do not import React.
Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      user: { getPortalContext: { invalidate: mocks.invalidate } },
    }),
  },
}));

describe("useInvalidatePortalContext", () => {
  it("refreshes the route with the cache, because the portal layout reads the context on the server", () => {
    const hooked: (() => unknown)[] = [];
    function Probe() {
      hooked.push(useInvalidatePortalContext());
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));

    hooked[0]?.();

    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
