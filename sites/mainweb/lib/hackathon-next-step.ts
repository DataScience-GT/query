import { hackathonPathSegment } from "./hackathon-slug";
import { eventDay, eventMoment } from "../components/hackathon/judging/event-time";

/**
 * The one thing a hacker should do next, worked out from data the pages
 * already hold. Pure on purpose: the pages own the queries (and only run the
 * ones `nextStepQueries` says matter), this decides what they mean.
 *
 * Steps, in the order a hacker meets them:
 *   register -> review -> pass -> team -> submit -> judging -> results
 * `status` is not a step: waitlisted, rejected, cancelled and "event ended"
 * have nothing to act on, so they read as a status line.
 */

export type NextStepKind =
  | "register"
  | "review"
  | "pass"
  | "team"
  | "submit"
  | "judging"
  | "results"
  | "status";

export type HackathonNextStep = {
  step: NextStepKind;
  label: string;
  detail?: string;
  href: string;
};

type DateLike = Date | string;

export type NextStepHackathon = {
  id: string;
  name: string;
  status: string;
  startDate: DateLike;
  endDate: DateLike;
  registrationDeadline?: DateLike | null;
};

/** The parts of a judging itinerary appointment the strip reads. */
export type NextStepAppointment = {
  startsAt: DateLike;
  endsAt: DateLike;
  room: string | null;
  building: string | null;
  status: string;
};

export type NextStepInput = {
  now: Date;
  hackathon: NextStepHackathon;
  /** `null`/`undefined` when the viewer has not registered. */
  registrationStatus: string | null | undefined;
  hasTeam: boolean;
  /** `team.submissionWindow`; leave out while it is loading or not needed. */
  submissionWindow?: { opensAt: DateLike; closesAt: DateLike } | null;
  /** Whether their project is filed (see `projectSubmitted`). */
  submitted?: boolean;
  /**
   * `judging.hacker.itinerary`, if it was read. `entry` is the project they
   * hold a place on, which may have come from Devpost rather than /submit.
   */
  itinerary?: {
    entry: { id: string } | null;
    appointments: readonly NextStepAppointment[];
  } | null;
  /** `hackathon.getResults` came back with rows. */
  resultsPublished?: boolean;
};

// Deadlines and slots are the venue's clock, never the viewer's: half the
// field is remote, and a deadline in the wrong zone costs somebody their entry.
const EVENT_TZ = "America/New_York";

// Same fields as the submit page prints its deadlines with.
const deadlineFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

// Day granularity, on the viewer's clock: the last day counts all day.
const startOfDay = (d: DateLike) => {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
};

/**
 * Whether today falls on the edition's days, widened by `leadDays` before it
 * starts. Viewer's clock, day granularity.
 */
export function isWithinEditionDates(
  edition: { startDate: DateLike; endDate: DateLike },
  now: Date,
  leadDays = 0,
): boolean {
  const from = startOfDay(edition.startDate);
  from.setDate(from.getDate() - leadDays);
  const today = startOfDay(now).getTime();
  return from.getTime() <= today && today <= startOfDay(edition.endDate).getTime();
}

const isOver = (hackathon: NextStepHackathon, now: Date) =>
  hackathon.status === "completed" ||
  startOfDay(hackathon.endDate).getTime() < startOfDay(now).getTime();

const hasStarted = (hackathon: NextStepHackathon, now: Date) =>
  hackathon.status === "in_progress" ||
  hackathon.status === "completed" ||
  startOfDay(hackathon.startDate).getTime() <= startOfDay(now).getTime();

const ADMITTED = new Set(["approved", "checked_in"]);

/** A draft is saved work, not an entry; only these reach the judges. */
export function projectSubmitted(
  project: { status: string } | null | undefined,
): boolean {
  return !!project && project.status !== "draft";
}

/**
 * Which of the extra queries the step can use. A hacker who is not checked in
 * needs neither the submission nor the itinerary, and nobody needs them for an
 * event that is over, so those requests are not made. The itinerary is read
 * without waiting on a filed project: a team that entered on Devpost has none
 * here, only the place it claimed in judging.
 */
export function nextStepQueries(input: {
  now: Date;
  hackathon: NextStepHackathon;
  registrationStatus: string | null | undefined;
}): { submission: boolean; judging: boolean; results: boolean } {
  const { now, hackathon, registrationStatus } = input;
  const live = hackathon.status !== "cancelled" && !isOver(hackathon, now);
  const checkedIn = registrationStatus === "checked_in";
  return {
    submission: checkedIn && live,
    judging: checkedIn && live,
    results:
      ADMITTED.has(registrationStatus ?? "") &&
      hackathon.status !== "cancelled" &&
      hasStarted(hackathon, now),
  };
}

/**
 * The first slot that has not ended or been fully judged, by start time. A
 * slot a judge has started scoring reads `incomplete` while it is still on.
 */
function upcomingSlot(
  appointments: readonly NextStepAppointment[],
  now: Date,
): NextStepAppointment | null {
  let next: NextStepAppointment | null = null;
  for (const appointment of appointments) {
    if (appointment.status === "complete") continue;
    if (new Date(appointment.endsAt).getTime() <= now.getTime()) continue;
    if (
      !next ||
      new Date(appointment.startsAt).getTime() <
        new Date(next.startsAt).getTime()
    ) {
      next = appointment;
    }
  }
  return next;
}

export function hackathonNextStep(
  input: NextStepInput,
): HackathonNextStep | null {
  const { now, hackathon, registrationStatus } = input;
  const base = `/hackathons/${hackathonPathSegment(hackathon.name, hackathon.id)}`;
  const tab = (name: string) => `${base}?tab=${name}`;

  if (!registrationStatus) {
    const deadline = hackathon.registrationDeadline
      ? new Date(hackathon.registrationDeadline)
      : null;
    if (hackathon.status !== "open" || (deadline && now > deadline)) {
      return null;
    }
    return {
      step: "register",
      label: "Register",
      detail: deadline
        ? `Applications close ${deadlineFmt.format(deadline)}.`
        : "Applications are reviewed as they arrive.",
      href: tab("INFO"),
    };
  }

  if (hackathon.status === "cancelled") {
    return {
      step: "status",
      label: "Cancelled",
      detail: "This hackathon was cancelled.",
      href: tab("INFO"),
    };
  }

  const over = isOver(hackathon, now);

  if (registrationStatus === "rejected") {
    return {
      step: "status",
      label: "Not accepted",
      detail: "Your registration wasn't accepted this time.",
      href: tab("INFO"),
    };
  }
  if (registrationStatus === "pending" || registrationStatus === "waitlisted") {
    if (over) {
      return { step: "status", label: "Event ended", href: tab("INFO") };
    }
    return registrationStatus === "pending"
      ? {
          step: "review",
          label: "Waiting on a decision",
          detail: "An organiser is reviewing your application.",
          href: tab("INFO"),
        }
      : {
          step: "status",
          label: "Waitlisted",
          detail: "An organiser may offer you a spot if one opens. Watch your email.",
          href: tab("INFO"),
        };
  }
  if (!ADMITTED.has(registrationStatus)) return null;

  // Admitted from here on.
  if (input.resultsPublished) {
    return {
      step: "results",
      label: "Results are out",
      detail: "See how the projects placed.",
      href: tab("RESULTS"),
    };
  }

  const waitingOnResults: HackathonNextStep = {
    step: "results",
    label: "Waiting on results",
    detail: "Organisers publish them on the Results tab.",
    href: tab("RESULTS"),
  };
  if (over) {
    return registrationStatus === "checked_in"
      ? waitingOnResults
      : { step: "status", label: "Event ended", href: tab("INFO") };
  }

  if (registrationStatus === "approved") {
    return {
      step: "pass",
      label: "Show your pass at check-in",
      detail:
        startOfDay(hackathon.startDate).getTime() > startOfDay(now).getTime()
          ? `The event starts ${eventDay(new Date(hackathon.startDate))}.`
          : "Have it scanned at the door.",
      href: tab("SCHEDULE"),
    };
  }

  // Checked in.
  const window = input.submissionWindow;
  const opensAt = window ? new Date(window.opensAt) : null;
  const closesAt = window ? new Date(window.closesAt) : null;
  const appointments = input.itinerary?.appointments ?? [];
  // A place in judging means a project is filed, however it got there.
  const hasEntry = input.submitted === true || !!input.itinerary?.entry;

  // Nobody has to have a team: a solo entry is valid, so the team step lasts
  // only until submissions open.
  if (!input.hasTeam && !hasEntry && !(opensAt && now >= opensAt)) {
    return {
      step: "team",
      label: "Find a team",
      detail: "Or submit on your own once submissions open.",
      href: tab("TEAMS"),
    };
  }

  if (!hasEntry) {
    if (closesAt && now > closesAt) {
      return {
        step: "status",
        label: "Submissions closed",
        detail:
          "Nothing was filed here for you or your team. Entered on Devpost? Claim it on the Judging tab.",
        href: tab("JUDGING"),
      };
    }
    return {
      step: "submit",
      label: closesAt
        ? `Submit by ${deadlineFmt.format(closesAt)}`
        : "Submit your project",
      detail:
        opensAt && now < opensAt
          ? `Submissions open ${deadlineFmt.format(opensAt)}.`
          : undefined,
      href: `/submit?id=${hackathon.id}`,
    };
  }

  const slot = upcomingSlot(appointments, now);
  if (slot) {
    const startsAt = new Date(slot.startsAt);
    const place = [slot.room, slot.building].filter(Boolean).join(", ");
    return {
      step: "judging",
      label:
        startsAt <= now
          ? "Your judging slot is on now"
          : `Judging ${eventMoment(startsAt)}`,
      detail: place || "Room to be announced.",
      href: tab("JUDGING"),
    };
  }
  // Every slot is behind them; only the placings are left.
  if (appointments.length > 0) return waitingOnResults;

  return {
    step: "judging",
    label: "Wait for your judging time",
    detail: "It shows on the Judging tab once organisers publish the schedule.",
    href: tab("JUDGING"),
  };
}
