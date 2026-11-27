import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_ROLES,
  isInPerson,
  isOnline,
  volunteerModeLabel,
  volunteerTopicLabel,
} from "@query/db/constants";
import type {
  VolunteerAnswers,
  VolunteerMode,
  VolunteerStatus,
} from "@query/db/constants";
import { csvCell } from "@/lib/csv";
import {
  volunteerBlockLabel,
  volunteerOnlineBlockLabel,
} from "@/lib/volunteer-blocks";

export type VolunteerCsvRow = {
  status: VolunteerStatus;
  mode: VolunteerMode;
  createdAt: Date | string;
  answers: VolunteerAnswers;
  user: { name: string | null; email: string | null } | null;
};

const HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Status",
  "Type",
  "Affiliation",
  "Availability",
  "Roles",
  "Experience",
  "Shirt size",
  "Dietary restrictions",
  "Mentor topics",
  "Online availability (Eastern)",
  "Mentor experience",
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
    // Cells for the half of the application the person did not fill in stay empty.
    const venue = isInPerson(a) ? a : null;
    const mentor = isOnline(a) ? a : null;
    return [
      row.user?.name ?? "",
      row.user?.email ?? "",
      a.phone ?? "",
      row.status,
      volunteerModeLabel(row.mode),
      label(VOLUNTEER_AFFILIATIONS, a.affiliation),
      venue?.availability
        .map((id) => volunteerBlockLabel(id, startDate))
        .join("; ") ?? "",
      venue?.roles.map((id) => label(VOLUNTEER_ROLES, id)).join("; ") ?? "",
      venue?.experience ?? "",
      venue?.shirtSize ?? "",
      venue ? venue.dietary.join("; ") || "None" : "",
      mentor?.topics
        .map((id) => volunteerTopicLabel(id, mentor.topicOther))
        .join("; ") ?? "",
      mentor?.onlineAvailability
        .map((id) => volunteerOnlineBlockLabel(id, startDate))
        .join("; ") ?? "",
      mentor?.mentorExperience ?? "",
      new Date(row.createdAt).toISOString(),
    ]
      .map(csvCell)
      .join(",");
  });
  return [HEADERS.map(csvCell).join(","), ...lines].join("\n");
}
