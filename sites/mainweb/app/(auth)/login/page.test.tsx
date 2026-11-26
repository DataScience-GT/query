import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The page is one page. Where the visitor came from decides where they land
// afterwards (callbackUrl), never what the page says.

Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({ discord: true }));

vi.mock("@query/auth", () => ({
  auth: async () => null,
  discordLoginEnabled: () => mocks.discord,
}));
vi.mock("@query/api", () => ({
  appRouter: { createCaller: () => ({}) },
  createContext: async () => ({}),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0" }),
}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("./LoginActions", () => ({
  default: (props: {
    callbackUrl: string | null;
    discord: boolean;
    inAppBrowser: boolean;
  }) => (
    <div
      data-callback={props.callbackUrl ?? ""}
      data-discord={String(props.discord)}
      data-in-app={String(props.inAppBrowser)}
    />
  ),
}));

import LoginPage from "./page";

const render = async (callbackUrl?: string) =>
  renderToStaticMarkup(
    await LoginPage({ searchParams: Promise.resolve({ callbackUrl }) }),
  );

// The island's own props legitimately carry the destination; everything else
// has to match byte for byte.
const withoutDestination = (html: string) =>
  html.replace(/ data-callback="[^"]*"/, "");

describe("login page", () => {
  it("looks and reads the same for every callbackUrl", async () => {
    const plain = await render();
    for (const callbackUrl of [
      "/hackathons/hacklytics-digital-bloom",
      "/hacklytics",
      "/dashboard",
    ]) {
      expect(withoutDestination(await render(callbackUrl))).toBe(
        withoutDestination(plain),
      );
    }
  });

  it("has one heading and no hackathon variant", async () => {
    const html = await render("/hacklytics");
    expect(html).toMatch(/>Query<span[^>]*>\.<\/span><\/h1>/);
    expect(html).toContain("DS@GT");
    expect(html).toContain("No membership is needed to apply to a hackathon");
    expect(html).not.toContain("For hackers");
    expect(html).not.toContain(">Hacklytics</h1>");
    expect(html).not.toContain(">Hackathons</h1>");
  });

  it("still hands the destination to the sign-in buttons", async () => {
    const html = await render("/hackathons/hacklytics-digital-bloom");
    expect(html).toContain(
      'data-callback="/hackathons/hacklytics-digital-bloom"',
    );
  });

  it("passes the server's Discord answer to the buttons", async () => {
    expect(await render()).toContain('data-discord="true"');
    mocks.discord = false;
    try {
      expect(await render()).toContain('data-discord="false"');
    } finally {
      mocks.discord = true;
    }
  });
});
