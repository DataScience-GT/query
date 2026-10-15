import { describe, it, expect } from "vitest";
import type { PortalContext } from "@query/api";
import {
  isPortalNavActive,
  navHackathon,
  portalNavSections,
} from "./portal-nav";

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
      "Club Check-In",
      "Bootcamp",
      "Club Projects",
      "Settings",
    ]);
    expect(names(sections, "portal")).not.toContain("Club Portal");
    // Applying to a subteam needs a membership, so the link waits for one.
    expect(names(sections, "portal")).not.toContain("Subteams");
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
      "Club Check-In",
      "Bootcamp",
      "Club Projects",
      "Subteams",
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
    expect(names(sections, "portal")).toContain("Club Attendance");
    expect(names(sections, "hackathon")).not.toContain("Club Attendance");
    expect(names(sections, "portal")).not.toContain("Judge Portal");
  });

  it("sends members to /subteams and staff to /admin/subteams", () => {
    const member = portalNavSections(
      ctx({ member: { ...emptyMember, isMember: true, isActive: true } }),
    );
    expect(hrefs(member)).toContain("/subteams");
    expect(hrefs(member)).not.toContain("/admin/subteams");

    const admin = portalNavSections(ctx({ isAdmin: true, role: "admin" }));
    expect(hrefs(admin)).toContain("/admin/subteams");
    expect(hrefs(admin)).not.toContain("/subteams");
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
      "Club Attendance",
      "Club Projects",
      "Club Project Applications",
      "Subteams",
      "Bootcamp",
      "Memberships",
      "Resume Book",
      "Staff & Roles",
      "Analytics",
      "Docs",
      "Settings",
    ]);
    expect(hrefs(sections)).not.toContain("/admin/setup");
    expect(sections.flatMap((s) => s.items.map((i) => i.name))).not.toContain(
      "Judging Setup",
    );
  });
});

describe("portalNavSections for bug testers", () => {
  it("shows the admin tools read-only, minus staff-only pages", () => {
    const sections = portalNavSections(
      ctx({ isBugTester: true, isScanner: true, role: "bug_tester" }),
    );
    expect(hrefs(sections)).toContain("/admin/hackathons");
    expect(hrefs(sections)).toContain("/admin/judging");
    expect(hrefs(sections)).toContain("/admin/analytics");
    expect(hrefs(sections)).toContain("/admin/subteams");
    // Pages whose queries refuse anyone but full staff.
    expect(hrefs(sections)).not.toContain("/admin/staff");
    expect(hrefs(sections)).not.toContain("/lead");
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

describe("navHackathon", () => {
  const edition = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Example Hack",
    status: "in_progress",
    startDate: new Date("2027-02-26T14:00:00Z"),
    endDate: new Date("2027-02-28T17:00:00Z"),
  };
  const reg = (
    registrationStatus: string,
    overrides: Partial<typeof edition> = {},
  ) => ({ registrationStatus, hackathon: { ...edition, ...overrides } });
  const DURING = new Date("2027-02-27T18:00:00Z");
  const TWO_DAYS_OUT = new Date("2027-02-24T18:00:00Z");
  const FOUR_DAYS_OUT = new Date("2027-02-22T18:00:00Z");
  const AFTER = new Date("2027-03-05T18:00:00Z");

  it("picks an accepted or checked-in hacker's running edition", () => {
    for (const status of ["approved", "checked_in"]) {
      expect(navHackathon([reg(status)], DURING)).toEqual({
        id: edition.id,
        name: edition.name,
      });
    }
  });

  it("starts two days before the edition and not earlier", () => {
    expect(navHackathon([reg("approved")], TWO_DAYS_OUT)).not.toBeNull();
    expect(navHackathon([reg("approved")], FOUR_DAYS_OUT)).toBeNull();
  });

  it("ends with the edition", () => {
    expect(navHackathon([reg("checked_in")], AFTER)).toBeNull();
  });

  it("ignores applications that are not admitted, and cancelled editions", () => {
    for (const status of ["pending", "waitlisted", "rejected"]) {
      expect(navHackathon([reg(status)], DURING)).toBeNull();
    }
    expect(
      navHackathon([reg("approved", { status: "cancelled" })], DURING),
    ).toBeNull();
  });

  it("takes the soonest of two and tolerates no data", () => {
    const later = reg("approved", {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Later Hack",
      startDate: new Date("2027-02-27T14:00:00Z"),
    });
    expect(navHackathon([later, reg("approved")], DURING)?.name).toBe(
      "Example Hack",
    );
    expect(navHackathon([], DURING)).toBeNull();
    expect(navHackathon(undefined, DURING)).toBeNull();
  });
});

describe("portalNavSections with a hackathon in progress", () => {
  const hackathon = { id: "uuid-bloom", name: "Hacklytics: Bloom" };

  it("leads the hackathon side with My <edition>, pointing at the event page", () => {
    const sections = portalNavSections(ctx(), hackathon);
    expect(names(sections, "hackathon")).toEqual([
      "My Hacklytics: Bloom",
      "Dashboard",
      "Hackathons",
      "Submit Project",
    ]);
    expect(sections[0]?.items[0]?.href).toBe("/hackathons/hacklytics-bloom");
  });

  it("leaves every club link in place for a member", () => {
    const member = ctx({
      member: { ...emptyMember, isMember: true, isActive: true },
    });
    const plain = portalNavSections(member);
    const focused = portalNavSections(member, hackathon);
    expect(names(focused, "portal")).toEqual(names(plain, "portal"));
    expect(names(focused, "hackathon")).toEqual([
      "My Hacklytics: Bloom",
      ...names(plain, "hackathon"),
    ]);
  });

  it("adds nothing without one, and nothing for staff", () => {
    expect(names(portalNavSections(ctx(), null), "hackathon")).toEqual(
      names(portalNavSections(ctx()), "hackathon"),
    );
    const admin = portalNavSections(ctx({ isAdmin: true, role: "admin" }), hackathon);
    expect(names(admin, "hackathon")).toEqual([
      "Hackathons",
      "Judging",
      "Projects",
    ]);
  });
});

describe("isPortalNavActive with a deeper item", () => {
  const hrefs = ["/hackathons", "/hackathons/hacklytics-bloom", "/submit"];

  it("lights only My <edition> on its own page", () => {
    expect(
      isPortalNavActive("/hackathons/hacklytics-bloom", "/hackathons", hrefs),
    ).toBe(false);
    expect(
      isPortalNavActive(
        "/hackathons/hacklytics-bloom",
        "/hackathons/hacklytics-bloom",
        hrefs,
      ),
    ).toBe(true);
    expect(
      isPortalNavActive(
        "/hackathons/hacklytics-bloom/checkin",
        "/hackathons/hacklytics-bloom",
        hrefs,
      ),
    ).toBe(true);
  });

  it("keeps Hackathons lit on any other edition's page", () => {
    expect(
      isPortalNavActive("/hackathons/other-hack", "/hackathons", hrefs),
    ).toBe(true);
  });
});
