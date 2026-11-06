import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InterestForm } from "./InterestForm";

// Rendered to markup with the session and tRPC hooks stubbed. The first render
// is what a server-rendered page puts in the HTML, so it is the one that has to
// be the final state when the page already knows who is looking.

Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  live: { data: undefined, status: "loading" } as {
    data: { user?: { email?: string | null } } | null | undefined;
    status: "loading" | "authenticated" | "unauthenticated";
  },
  myInterest: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: () => mocks.live }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({
    isPending: false,
    error: null,
    mutate: () => undefined,
  });
  return {
    trpc: {
      useUtils: () => ({ hackathon: {} }),
      hackathon: {
        myInterest: { useQuery: mocks.myInterest },
        registerInterest: { useMutation: mutation },
        withdrawInterest: { useMutation: mutation },
      },
    },
  };
});

const render = (serverSession?: { user?: { email?: string | null } } | null) =>
  renderToStaticMarkup(
    <InterestForm
      hackathonId="h1"
      callbackPath="/hacklytics"
      serverSession={serverSession}
    />,
  );

describe("InterestForm session lookup", () => {
  beforeEach(() => {
    mocks.live = { data: undefined, status: "loading" };
    mocks.myInterest.mockReset();
    mocks.myInterest.mockReturnValue({ data: undefined });
  });

  it("waits for the browser when the server said nothing", () => {
    expect(render()).toContain("Checking sign-in");
  });

  it("paints the sign-in prompt at once for a visitor the server saw signed out", () => {
    const html = render(null);
    expect(html).not.toContain("Checking sign-in");
    expect(html).toContain("Sign in to join the list");
    expect(html).toContain("/login?callbackUrl=%2Fhacklytics");
  });

  it("paints the form at once for a visitor the server saw signed in", () => {
    const html = render({ user: { email: "a@b.co" } });
    expect(html).not.toContain("Checking sign-in");
    expect(html).toContain("Join the interest list");
    expect(html).toContain("School or university");
  });

  it("asks for the interest row of a visitor the server saw signed in", () => {
    render({ user: { email: "a@b.co" } });
    expect(mocks.myInterest).toHaveBeenCalledWith(
      { hackathonId: "h1" },
      { enabled: true },
    );
  });

  it("does not ask for it for a visitor the server saw signed out", () => {
    render(null);
    expect(mocks.myInterest).toHaveBeenCalledWith(
      { hackathonId: "h1" },
      { enabled: false },
    );
  });

  it("follows the browser once its lookup has answered", () => {
    mocks.live = { data: null, status: "unauthenticated" };
    const html = render({ user: { email: "a@b.co" } });
    expect(html).toContain("Sign in to join the list");
    expect(html).not.toContain("Join the interest list");
  });
});
