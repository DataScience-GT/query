import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PortalContext } from "@query/api";
import { portalNavSections } from "@/lib/portal-nav";
import { portalSidebarSections } from "./portal-sidebar-sections";

// The root vitest config compiles JSX to React.createElement, and components
// written for Next's automatic runtime do not import React.
Object.assign(globalThis, { React });

const emptyMember = {
  isMember: false,
  isActive: false,
  hasLapsed: false,
  expiresAt: null,
  daysRemaining: null,
  memberType: null,
  renewalCount: 0,
} satisfies PortalContext["member"];

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    isAdmin: false,
    isScanner: false,
    isBugTester: false,
    role: null,
    permissions: [],
    isJudge: false,
    judgeId: null,
    judgeName: null,
    isProjectLeader: false,
    member: emptyMember,
    ...overrides,
  };
}

const viewers: [string, PortalContext | undefined][] = [
  ["signed out", undefined],
  ["visitor", ctx()],
  ["member", ctx({ member: { ...emptyMember, isMember: true } })],
  [
    "judge, scanner and project leader",
    ctx({ isJudge: true, isScanner: true, isProjectLeader: true }),
  ],
  ["admin", ctx({ isAdmin: true })],
  ["bug tester", ctx({ isBugTester: true })],
];

describe("portalSidebarSections", () => {
  it.each(viewers)(
    "keeps the nav's links for a %s and draws an icon for each",
    (_viewer, portal) => {
      const drawn = portalSidebarSections(portal, undefined);

      expect(
        drawn.map((section) =>
          section.items.map(({ name, href }) => [name, href]),
        ),
      ).toEqual(
        portalNavSections(portal).map((section) =>
          section.items.map(({ name, href }) => [name, href]),
        ),
      );
      for (const { icon } of drawn.flatMap((section) => section.items)) {
        expect(renderToStaticMarkup(icon as React.ReactElement)).toMatch(
          /^<svg .*text-\[var\(--nav-icon\)\]/,
        );
      }
    },
  );
});
