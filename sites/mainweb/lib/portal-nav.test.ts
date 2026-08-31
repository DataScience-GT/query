import { describe, it, expect } from "vitest";
import type { PortalContext } from "@query/api";
import { isPortalNavActive, portalNavSections } from "./portal-nav";

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

function names(
  sections: ReturnType<typeof portalNavSections>,
  id: "hackathon" | "portal",
): string[] {
  return sections.find((s) => s.id === id)?.items.map((i) => i.name) ?? [];
}

function hrefs(sections: ReturnType<typeof portalNavSections>): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.href));
}

describe("portalNavSections", () => {
  it("splits hackathon and portal for a guest, with Dashboard on the hackathon side", () => {
    const sections = portalNavSections(ctx());
    expect(sections.map((s) => s.id)).toEqual(["hackathon", "portal"]);
    expect(names(sections, "hackathon")).toEqual([
      "Dashboard",
      "Hackathons",
      "Submit Project",
    ]);
    expect(names(sections, "portal")).toEqual([
      "Bootcamp",
      "Club Projects",
      "Settings",
    ]);
    expect(names(sections, "portal")).not.toContain("Club Portal");
  });

  it("moves Dashboard and Club Portal onto the portal side for a member", () => {
    const sections = portalNavSections(
      ctx({ member: { ...emptyMember, isMember: true, isActive: true } }),
    );
    expect(names(sections, "hackathon")).toEqual([
      "Hackathons",
      "Submit Project",
    ]);
    expect(names(sections, "hackathon")).not.toContain("Dashboard");
    expect(names(sections, "portal")).toEqual([
      "Dashboard",
      "Club Portal",
      "Bootcamp",
      "Club Projects",
      "Settings",
    ]);
  });

  it("adds judge and scanner links only on the hackathon side", () => {
    const sections = portalNavSections(ctx({ isJudge: true, isScanner: true }));
    expect(names(sections, "hackathon")).toEqual([
      "Dashboard",
      "Hackathons",
      "Submit Project",
      "Judge Portal",
      "Check-In Desk",
    ]);
    expect(names(sections, "portal")).toContain("Club Check-In");
    expect(names(sections, "hackathon")).not.toContain("Club Check-In");
    expect(names(sections, "portal")).not.toContain("Judge Portal");
  });

  it("adds My Club Projects on the portal side for a project leader", () => {
    const sections = portalNavSections(ctx({ isProjectLeader: true }));
    expect(names(sections, "portal")).toContain("My Club Projects");
    expect(names(sections, "hackathon")).not.toContain("My Club Projects");
  });

  it("splits admin tools the same way and omits Judging Setup", () => {
    const sections = portalNavSections(ctx({ isAdmin: true, role: "admin" }));
    expect(names(sections, "hackathon")).toEqual([
      "Hackathons",
      "Judging",
      "Projects",
    ]);
    expect(names(sections, "hackathon")).not.toContain("Attendees");
    expect(names(sections, "hackathon")).not.toContain("Club Attendees");
    expect(names(sections, "portal")).toEqual([
      "Club Hub",
      "Club Attendees",
      "Club Check-In",
      "Club Projects",
      "Club Project Applications",
      "Bootcamp",
      "Memberships",
      "Staff & Roles",
      "Analytics",
      "Audit Log",
      "Docs",
      "Settings",
    ]);
    expect(hrefs(sections)).not.toContain("/admin/setup");
    expect(sections.flatMap((s) => s.items.map((i) => i.name))).not.toContain(
      "Judging Setup",
    );
  });
});

describe("isPortalNavActive", () => {
  it("does not treat /admin as a prefix of every admin page", () => {
    expect(isPortalNavActive("/admin", "/admin")).toBe(true);
    expect(isPortalNavActive("/admin/hackathons", "/admin")).toBe(false);
    expect(
      isPortalNavActive("/admin/hackathons/bloom", "/admin/hackathons"),
    ).toBe(true);
  });

  it("does not treat /dashboard as a prefix of other routes", () => {
    expect(isPortalNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isPortalNavActive("/hackathons", "/dashboard")).toBe(false);
  });

  it("does not treat /club as a prefix of /club/bootcamp", () => {
    expect(isPortalNavActive("/club", "/club")).toBe(true);
    expect(isPortalNavActive("/club/bootcamp", "/club")).toBe(false);
    expect(isPortalNavActive("/club/bootcamp", "/club/bootcamp")).toBe(true);
  });

  it("does not treat /scan as a prefix of /scan/club", () => {
    expect(isPortalNavActive("/scan", "/scan")).toBe(true);
    expect(isPortalNavActive("/scan/club", "/scan")).toBe(false);
    expect(isPortalNavActive("/scan/club", "/scan/club")).toBe(true);
  });
});
