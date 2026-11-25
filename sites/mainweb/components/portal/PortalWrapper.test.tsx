// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalWrapper from "./PortalWrapper";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

// The sidebar reads the session and the theme; only what the wrapper hands it
// matters here.
vi.mock("./PortalSidebar", () => ({
  default: ({ fixedTheme }: { fixedTheme?: boolean }) => (
    <nav data-fixed-theme={String(!!fixedTheme)} />
  ),
}));

function shell(pathname: string) {
  mocks.pathname = pathname;
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <PortalWrapper sections={[]}>
        <main>page</main>
      </PortalWrapper>,
    ),
  );
  return {
    root: container.firstElementChild as HTMLElement,
    sidebar: container.querySelector("nav"),
  };
}

describe("PortalWrapper", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
  });

  it("wears the Digital Bloom theme on a Hacklytics edition and its subpages", () => {
    for (const path of [
      "/hackathons/hacklytics-digital-bloom",
      "/hackathons/hacklytics-digital-bloom/checkin",
      "/hackathons/Hacklytics%3A%20Digital%20Bloom",
    ]) {
      const { root, sidebar } = shell(path);
      expect(root.classList.contains("hl-theme"), path).toBe(true);
      expect(sidebar?.getAttribute("data-fixed-theme"), path).toBe("true");
    }
  });

  it("leaves the dashboard and other hackathons in the portal look", () => {
    for (const path of [
      "/dashboard",
      "/hackathons",
      "/hackathons/hello-hacks-2027",
      "/admin/hackathons/hacklytics-digital-bloom",
    ]) {
      const { root, sidebar } = shell(path);
      expect(root.classList.contains("hl-theme"), path).toBe(false);
      expect(sidebar?.getAttribute("data-fixed-theme"), path).toBe("false");
    }
  });

  it("still fills the screen with the portal ground", () => {
    const { root } = shell("/hackathons/hacklytics-digital-bloom");
    expect(root.className).toContain("min-h-screen");
    expect(root.className).toContain("bg-[var(--bg-primary)]");
    expect(root.textContent).toContain("page");
  });
});
