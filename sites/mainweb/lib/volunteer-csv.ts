import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_ROLES,
} from "@query/db/constants";
import type { VolunteerAnswers, VolunteerStatus } from "@query/db/constants";
import { csvCell } from "@/lib/csv";
import { volunteerBlockLabel } from "@/lib/volunteer-blocks";

export type VolunteerCsvRow = {
  status: VolunteerStatus;
  createdAt: Date | string;
  answers: VolunteerAnswers;
  user: { name: string | null; email: string | null } | null;
};

const HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Status",
  "Affiliation",
  "Availability",
  "Roles",
  "Experience",
  "Shirt size",
  "Dietary restrictions",
  "Applied at",
];

const label = <T extends { id: string; label: string }>(
  list: readonly T[],
  id: string,
) => list.find((item) => item.id === id)?.label ?? id;

/**
 * The volunteer roster as CSV text. Every cell goes through csvCell: names
 * and experience are typed by applicants, and a leading = + - @ would run as
 * a formula in Excel. Lists are joined with semicolons so a cell holds them
 * without the CSV's own commas.
 */
export function volunteerCsv(
  rows: readonly VolunteerCsvRow[],
  startDate: Date | string,
): string {
  const lines = rows.map((row) => {
    const a = row.answers;
    return [
      row.user?.name ?? "",
      row.user?.email ?? "",
      a.phone,
      row.status,
      label(VOLUNTEER_AFFILIATIONS, a.affiliation),
      a.availability.map((id) => volunteerBlockLabel(id, startDate)).join("; "),
      a.roles.map((id) => label(VOLUNTEER_ROLES, id)).join("; "),
      a.experience ?? "",
      a.shirtSize,
      a.dietary.join("; ") || "None",
      new Date(row.createdAt).toISOString(),
    ]
      .map(csvCell)
      .join(",");
  });
  return [HEADERS.map(csvCell).join(","), ...lines].join("\n");
}
