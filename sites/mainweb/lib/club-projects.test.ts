import { describe, it, expect } from "vitest";
import {
  CURRENT_CLUB_PROJECTS,
  PAST_CLUB_PROJECTS,
  PROJECTS_INTEREST_FORM,
  projectStatusLabel,
} from "./club-projects";

describe("CURRENT_CLUB_PROJECTS", () => {
  it("lists the Fall 2026 roster in the published order", () => {
    expect(CURRENT_CLUB_PROJECTS.map((p) => p.name)).toEqual([
      "Roboinvesting",
      "ARC",
      "Deep Learning Playground",
      "Sports Analytics",
      "DS@GT Website",
    ]);
  });

  it("does not include the removed AI Trading Agent project", () => {
    const blob = JSON.stringify(CURRENT_CLUB_PROJECTS);
    expect(blob).not.toMatch(/AI Trading Agent/i);
    expect(blob).not.toMatch(/Wesley Lu/i);
    expect(blob).not.toMatch(/wesleylu@gatech\.edu/i);
  });

  it("uses the shared interest form", () => {
    expect(PROJECTS_INTEREST_FORM).toBe(
      "https://forms.gle/Lgoia8m3sAP9XgpB9",
    );
  });

  it("keeps Roboinvesting active with Andrew and a recruiting range", () => {
    const project = CURRENT_CLUB_PROJECTS.find(
      (p) => p.slug === "roboinvesting",
    );
    expect(project?.status).toBe("active");
    expect(project?.lead).toBe("Andrew Hlavacek");
    expect(project?.email).toBe("ahlavacek6@gatech.edu");
    expect(project?.recruiting).toMatch(/4–6/);
    expect(project?.links.map((l) => l.href)).toContain(
      "https://github.com/DataScience-GT/RoboinvestingDashboard",
    );
  });

  it("points ARC join traffic at dsgt-arc.org/join", () => {
    const project = CURRENT_CLUB_PROJECTS.find((p) => p.slug === "arc");
    expect(project?.lead).toBe("Murilo Gustineli");
    expect(project?.links.map((l) => l.href)).toContain(
      "https://dsgt-arc.org/join",
    );
  });

  it("does not claim Deep Learning Playground is live", () => {
    const project = CURRENT_CLUB_PROJECTS.find((p) => p.slug === "dlp");
    expect(project?.revived).toBe(true);
    expect(project?.lead).toBeNull();
    expect(project?.links.map((l) => l.href)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/datasciencegt-dlp/i)]),
    );
    expect(JSON.stringify(project)).not.toMatch(/datasciencegt-dlp/i);
    expect(project?.links.map((l) => l.href)).toContain(
      "https://github.com/DataScience-GT/Deep-Learning-Playground",
    );
  });

  it("points Sports Analytics at AthleticsScrapers, not FA24-Sports-Analysis", () => {
    const project = CURRENT_CLUB_PROJECTS.find((p) => p.slug === "sports");
    const hrefs = project?.links.map((l) => l.href).join(" ") ?? "";
    expect(hrefs).toContain(
      "https://github.com/DataScience-GT/DSGT-AthleticsScrapers",
    );
    expect(hrefs).not.toMatch(/FA24-Sports-Analysis/i);
    expect(project?.lead).toBeNull();
    expect(project?.revived).toBe(true);
  });

  it("lists the website as live and looking for a lead", () => {
    const project = CURRENT_CLUB_PROJECTS.find((p) => p.slug === "website");
    expect(project?.lead).toBeNull();
    expect(project?.leadNote).toMatch(/Aamogh/i);
    expect(project?.description).toMatch(/datasciencegt\.org/);
    expect(project?.links.map((l) => l.href)).toContain("/");
    expect(project?.links.map((l) => l.href)).toContain(
      "https://github.com/DataScience-GT/query",
    );
  });

  it("labels revived projects as needing a lead", () => {
    const dlp = CURRENT_CLUB_PROJECTS.find((p) => p.slug === "dlp");
    expect(dlp && projectStatusLabel(dlp)).toBe("Revived · needs a lead");
  });
});

describe("PAST_CLUB_PROJECTS", () => {
  it("keeps the old archive names out of the current roster", () => {
    const current = CURRENT_CLUB_PROJECTS.map((p) => `${p.name} ${p.lead}`);
    expect(current.join(" ")).not.toMatch(/Noah Iversen/);
    expect(current.join(" ")).not.toMatch(/Aryan Hazra/);
    expect(current.join(" ")).not.toMatch(/Jane Ivanova/);
    expect(current.join(" ")).not.toMatch(/Anthony Miyaguchi/);
    expect(current.join(" ")).not.toMatch(/Casper Guo/);
    expect(PAST_CLUB_PROJECTS.map((p) => p.lead)).toEqual([
      "Noah Iversen",
      "Aryan Hazra",
      "Jane Ivanova",
      "Anthony Miyaguchi",
      "Casper Guo",
    ]);
  });
});
