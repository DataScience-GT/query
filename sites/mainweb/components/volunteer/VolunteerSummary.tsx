import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_ROLES,
  isInPerson,
  isOnline,
  volunteerModeLabel,
  volunteerTopicLabel,
} from "@query/db/constants";
import type { VolunteerAnswers } from "@query/db/constants";
import { meta } from "@query/ui/classes";
import {
  volunteerBlockLabel,
  volunteerOnlineBlockLabel,
} from "@/lib/volunteer-blocks";

/**
 * What the person offered, as they wrote it, for them and for organizers. A
 * row appears only for the half of the application they were asked: an online
 * mentor has no shirt size to show.
 */
export function VolunteerSummary({
  answers,
  startDate,
}: {
  answers: VolunteerAnswers;
  startDate: Date | string;
}) {
  const rows: [string, string][] = [
    [
      "How you'll help",
      answers.mode === "both"
        ? "In person and online mentor"
        : volunteerModeLabel(answers.mode),
    ],
    [
      "What describes you",
      VOLUNTEER_AFFILIATIONS.find((a) => a.id === answers.affiliation)?.label ??
        answers.affiliation,
    ],
  ];

  if (isInPerson(answers)) {
    rows.push(
      [
        "Times you offered in person",
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
    );
  }

  if (isOnline(answers)) {
    rows.push(
      [
        "Topics you can help with",
        answers.topics
          .map((id) => volunteerTopicLabel(id, answers.topicOther))
          .join("\n"),
      ],
      [
        "Times you can be online (Eastern)",
        answers.onlineAvailability
          .map((id) => volunteerOnlineBlockLabel(id, startDate))
          .join("\n"),
      ],
      ["Mentoring experience", answers.mentorExperience],
    );
  }

  rows.push(["Phone", answers.phone || "Not given"]);

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
