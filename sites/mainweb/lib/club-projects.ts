import type { ClubProjectStatus } from "@query/db";

export interface ClubProjectCard {
  id: string;
  slug: string;
  name: string;
  status: ClubProjectStatus;
  leadName: string | null;
  summary: string;
  tech: string[];
  repoUrl: string | null;
  joinUrl: string | null;
  capacityNote: string | null;
  term: string | null;
  initiativeId: string | null;
  sortOrder: number;
}

export const INTEREST_FORM_URL = "https://forms.gle/Lgoia8m3sAP9XgpB9";

export const STATUS_LABELS: Record<ClubProjectStatus, string> = {
  active: "Active",
  revived: "Reviving",
  needs_lead: "Needs a lead",
  past: "Past",
};

export const STATUS_CLASSES: Record<ClubProjectStatus, string> = {
  active: "bg-[var(--navy)] text-[var(--buzz)] border-[var(--navy)]",
  revived: "bg-[var(--trace)]/10 text-[var(--trace)] border-[var(--trace)]/30",
  needs_lead: "bg-[var(--buzz)]/25 text-[var(--ink)] border-[var(--buzz)]",
  past: "bg-transparent text-[var(--muted)] border-[var(--rule)]",
};

export const isCurrent = (project: { status: ClubProjectStatus }) =>
  project.status !== "past";

export const byDisplayOrder = (a: ClubProjectCard, b: ClubProjectCard) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export const groupClubProjects = (projects: ClubProjectCard[]) => ({
  current: projects.filter(isCurrent).sort(byDisplayOrder),
  past: projects.filter((p) => !isCurrent(p)).sort(byDisplayOrder),
});

// Applying happens in the portal. Without an initiative, fall back to the
// project's own link, then the interest form.
export const joinHref = (project: ClubProjectCard) =>
  project.initiativeId
    ? "/initiatives"
    : (project.joinUrl ?? INTEREST_FORM_URL);

export const joinLabel = (project: ClubProjectCard) => {
  if (project.status === "needs_lead") return "Lead this project";
  if (project.initiativeId) return "Apply to join";
  return "Express interest";
};

export const isExternalJoin = (project: ClubProjectCard) =>
  joinHref(project).startsWith("http");
