import type { SubteamApplicationStatus } from "@query/db";
import { status as statusClass } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

/**
 * One definition of each subteam state, shared by the member page and the
 * admin screen, so "Accepted" cannot end up green in one and grey in the other.
 */

const applicationTones: Record<
  SubteamApplicationStatus,
  { member: string; admin: string; tone: Tone }
> = {
  pending: { member: "Waiting on review", admin: "Waiting", tone: "warning" },
  accepted: { member: "On the team", admin: "Accepted", tone: "success" },
  rejected: { member: "Not this time", admin: "Rejected", tone: "neutral" },
  withdrawn: { member: "Withdrawn", admin: "Withdrawn", tone: "neutral" },
  removed: {
    member: "No longer on the team",
    admin: "Removed",
    tone: "neutral",
  },
};

export function SubteamApplicationChip({
  status,
  side = "member",
}: {
  status: SubteamApplicationStatus;
  side?: "member" | "admin";
}) {
  const tone = applicationTones[status];
  return (
    <span className={`${statusClass(tone.tone)} shrink-0`}>{tone[side]}</span>
  );
}

/** Archived outranks open/closed: an archived subteam is closed whatever the flag says. */
export function SubteamChip({
  isOpen,
  archivedAt,
}: {
  isOpen: boolean;
  archivedAt: Date | string | null;
}) {
  const [label, tone]: [string, Tone] =
    archivedAt !== null
      ? ["Archived", "neutral"]
      : isOpen
        ? ["Taking applications", "accent"]
        : ["Applications closed", "neutral"];
  return <span className={`${statusClass(tone)} shrink-0`}>{label}</span>;
}

export const shortDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
