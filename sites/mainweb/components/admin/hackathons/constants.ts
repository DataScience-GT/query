import type { Tone } from "@query/ui/classes";
import type { HackathonStatus } from "@query/db/constants";

/** Label and tone of the status pill on a hackathon card, from the portal's own scale. */
export const STATUS_PILL: Record<HackathonStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  // Public landing page and interest list are live; registration is not, and
  // this is NOT yet the edition memberships attach to.
  announced: { label: "Announced", tone: "accent" },
  open: { label: "Open", tone: "success" },
  closed: { label: "Closed", tone: "warning" },
  in_progress: { label: "In Progress", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/**
 * The browser's time zone, e.g. "America/New_York". Date inputs on the
 * hackathon forms are read in it, so the forms name it rather than leave the
 * organiser to guess which clock a bare "9:00 AM" is on.
 */
export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Comma-separated text to the array the API stores, or null when empty.
 *
 * Judge assignment matches these strings exactly, so entries are trimmed and
 * blanks dropped — a stray ", " would otherwise become a track no project can
 * ever be matched against.
 */
export function splitList(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

export function toInputDate(d: Date | string) {
  const dt = new Date(d);
  // Adjust for timezone offset to keep local time in the YYYY-MM-DDTHH:mm format
  const offset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - offset).toISOString().slice(0, 16);
}
