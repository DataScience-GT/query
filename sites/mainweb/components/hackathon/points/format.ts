// Times on the venue's clock, as the schedule shows them: "2:00 PM" should be
// the time on the wall at the event, whatever zone the phone is set to.
const VENUE_TZ = "America/New_York";

const dayTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: VENUE_TZ,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: VENUE_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** "Sat 2:00 PM" */
export function venueDayTime(date: Date | string): string {
  return dayTimeFmt.format(new Date(date));
}

/** "2:00 PM" */
export function venueTime(date: Date | string): string {
  return timeFmt.format(new Date(date));
}

/** "Sat 2:00 PM – 4:00 PM" */
export function venueRange(start: Date | string, end: Date | string): string {
  return `${venueDayTime(start)} – ${venueTime(end)}`;
}

/** "1 point", "1,250 points" */
export function pointsLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${Math.abs(n) === 1 ? "point" : "points"}`;
}

/** "+50", "−20": a ledger amount with its sign always shown. */
export function signedPoints(n: number): string {
  if (n > 0) return `+${n.toLocaleString("en-US")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("en-US")}`;
  return "0";
}

/** "1st", "2nd", "11th", "23rd" */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** How an attendance row was made, in the hacker's words. */
export function attendanceMethodLabel(method: string | null): string | null {
  switch (method) {
    case "scan":
      return "Pass scanned";
    case "code":
      return "Event code";
    case "manual":
      return "Checked in by staff";
    default:
      return null;
  }
}
