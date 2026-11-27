import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_ROLES,
} from "@query/db/constants";
import type { VolunteerAnswers } from "@query/db/constants";
import { meta } from "@query/ui/classes";
import { volunteerBlockLabel } from "@/lib/volunteer-blocks";

/** What the person offered, as they wrote it, for them and for organizers. */
export function VolunteerSummary({
  answers,
  startDate,
  showPhone = true,
}: {
  answers: VolunteerAnswers;
  startDate: Date | string;
  showPhone?: boolean;
}) {
  const rows: [string, string][] = [
    [
      "What describes you",
      VOLUNTEER_AFFILIATIONS.find((a) => a.id === answers.affiliation)?.label ??
        answers.affiliation,
    ],
    [
      "Times you offered",
      answers.availability
        .map((id) => volunteerBlockLabel(id, startDate))
        .join("\n"),
    ],
    [
      "Roles you'd like",
      answers.roles.length
        ? answers.roles
            .map((id) => VOLUNTEER_ROLES.find((r) => r.id === id)?.label ?? id)
            .join("\n")
        : "Wherever you're needed",
    ],
    ["Experience", answers.experience ?? "None given"],
    ["Shirt size", answers.shirtSize],
    ["Dietary restrictions", answers.dietary.join(", ") || "None"],
    ...(showPhone ? [["Phone", answers.phone] as [string, string]] : []),
  ];

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className={meta}>{label}</dt>
          <dd className="whitespace-pre-line break-words text-[15px] text-[var(--text-primary)]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
