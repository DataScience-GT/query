import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated" }),
  signIn: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import LoginActions from "./LoginActions";

const render = (discord: boolean) =>
  renderToStaticMarkup(
    <LoginActions callbackUrl={null} discord={discord} inAppBrowser={false} />,
  );

describe("LoginActions", () => {
  it("shows the Discord button only when the server registered it", () => {
    expect(render(true)).toContain("Continue with Discord");
    expect(render(false)).not.toContain("Continue with Discord");
    expect(render(true)).not.toContain("Continue with GitHub");
  });

  it("tells people who used GitHub how to get back in", () => {
    const html = render(true);
    expect(html).toContain("Used GitHub before?");
    expect(html).toContain("Google, Discord or an email code");
    expect(render(false)).toContain("Google or an email code");
  });
});
