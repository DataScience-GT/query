/**
 * Display rules shared by the public /events and /bootcamp pages. Club events
 * and bootcamp sessions are rows of one table; a session is the row with
 * `bootcamp_term` set, so /events filters on it being null and /bootcamp reads
 * one term of it.
 */

const EASTERN = "America/New_York";

/** `2026-fall` is how a term is stored; nobody should have to read it that way. */
export function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

/** The pieces of a date a row lays out separately, in Atlanta time. */
export function eventDateParts(date: Date) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString("en-US", { timeZone: EASTERN, ...options });

  return {
    month: part({ month: "short" }),
    day: part({ day: "numeric" }),
    weekday: part({ weekday: "long" }),
    time: part({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  };
}

/** "Tuesday, 6:30 PM EDT" plus the place when there is one. */
export function eventWhenWhere(date: Date, location: string | null) {
  const { weekday, time } = eventDateParts(date);
  return `${weekday}, ${time}${location ? ` · ${location}` : ""}`;
}

/**
 * Sessions are titled "Bootcamp week 6: deep learning" in the portal. The page
 * already says "Week 6", so the prefix is dropped there rather than repeated.
 */
export function sessionTitle(title: string) {
  const stripped = title.replace(/^bootcamp\s+week\s+\d+\s*[:\-–—]\s*/i, "");
  if (!stripped) return title;
  return `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`;
}

/**
 * Upcoming soonest first, past most recent first. `from` is the start of today
 * in Atlanta, so a session running this evening is still upcoming.
 */
export function splitByDay<T extends { eventDate: Date }>(rows: T[], from: Date) {
  const time = (row: T) => row.eventDate.getTime();
  return {
    upcoming: rows
      .filter((row) => time(row) >= from.getTime())
      .sort((a, b) => time(a) - time(b)),
    past: rows
      .filter((row) => time(row) < from.getTime())
      .sort((a, b) => time(b) - time(a)),
  };
}

type SummarySession = { eventDate: Date; location: string | null };
const TBA = "To be announced";

/**
 * The facts row at the top of /bootcamp. Time and room come from the session
 * the date comes from, since officers can move any one session. The constants
 * only stand in before a schedule is posted. Once every posted session is
 * behind us the row says so rather than showing a date that has passed.
 */
export function bootcampSummary(
  { upcoming, past }: { upcoming: SummarySession[]; past: SummarySession[] },
  fallback: {
    startDate?: string | null;
    time?: string | null;
    room?: string | null;
  },
) {
  const next = upcoming[0];
  if (next) {
    const { month, day, time } = eventDateParts(next.eventDate);
    return [
      { label: "Next session", value: `${month} ${day}` },
      { label: "Time", value: time },
      { label: "Room", value: next.location ?? fallback.room ?? TBA },
    ];
  }

  const last = past[0];
  if (last) {
    const { month, day } = eventDateParts(last.eventDate);
    return [
      { label: "Last session", value: `${month} ${day}` },
      { label: "Status", value: "This term's sessions have ended" },
    ];
  }

  return [
    { label: "First session", value: fallback.startDate ?? TBA },
    { label: "Time", value: fallback.time ?? TBA },
    { label: "Room", value: fallback.room ?? TBA },
  ];
}
