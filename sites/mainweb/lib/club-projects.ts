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
  active: "bg-[#00A8A8]/[0.12] text-[#00A8A8] border-transparent",
  revived: "bg-[#00A8A8]/10 text-[#00A8A8] border-[#00A8A8]/20",
  needs_lead: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  past: "bg-white/5 text-[#7a7a7a] border-white/10",
};

const isCurrent = (project: { status: ClubProjectStatus }) =>
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
  return "Apply to join";
};

export const isExternalJoin = (project: ClubProjectCard) =>
  joinHref(project).startsWith("http");
