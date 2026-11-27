import { VOLUNTEER_BLOCKS } from "@query/db/constants";
import type { VolunteerBlock } from "@query/db/constants";
import { venueParts } from "@/lib/venue-time";

/**
 * The weekend's three days as the edition's own dates ("Friday, Feb 26"),
 * counted from the day it starts at the venue. Built from calendar parts in
 * UTC so the server and the browser print the same day.
 */
export function volunteerDays(startDate: Date | string): string[] {
  const { year, month, day } = venueParts(startDate);
  const format = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return [0, 1, 2].map((offset) =>
    format.format(new Date(Date.UTC(year, month - 1, day + offset))),
  );
}

/** The time blocks grouped under their day, for the form's chips. */
export function volunteerBlockGroups(startDate: Date | string) {
  const days = volunteerDays(startDate);
  return days.map((heading, day) => ({
    day,
    heading,
    blocks: VOLUNTEER_BLOCKS.filter((b) => b.day === day),
  }));
}

/** One block as a line a person or a spreadsheet reads: "Friday, Feb 26: Afternoon setup". */
export function volunteerBlockLabel(
  id: string,
  startDate: Date | string,
): string {
  const block = VOLUNTEER_BLOCKS.find((b) => b.id === id);
  if (!block) return id;
  return `${volunteerDays(startDate)[block.day]}: ${block.part}`;
}

export type { VolunteerBlock };
