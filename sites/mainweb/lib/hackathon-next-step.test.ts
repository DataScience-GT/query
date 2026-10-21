import { describe, expect, it } from "vitest";
import {
  hackathonNextStep,
  isWithinEditionDates,
  nextStepQueries,
  projectSubmitted,
} from "./hackathon-next-step";
import type { NextStepInput } from "./hackathon-next-step";

// A made-up edition. Times are UTC; 15:00Z is 10:00 AM in Atlanta in February.
const HACKATHON = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example Hack: Spring",
  status: "in_progress",
  startDate: new Date("2027-02-26T14:00:00Z"),
  endDate: new Date("2027-02-28T17:00:00Z"),
  registrationDeadline: new Date("2027-02-22T04:59:00Z"),
};
const BASE = "/hackathons/example-hack-spring";

const WINDOW = {
  opensAt: new Date("2027-02-27T03:00:00Z"),
  closesAt: new Date("2027-02-28T15:00:00Z"),
};

const BEFORE = new Date("2027-02-20T18:00:00Z");
const DURING = new Date("2027-02-27T18:00:00Z");
const LATE = new Date("2027-02-28T16:00:00Z");
const AFTER = new Date("2027-03-05T18:00:00Z");

const ROOM = { room: "Room 204", building: "Klaus", status: "future" };
// The place in judging an itinerary is read for.
const ENTRY = { id: "22222222-2222-4222-8222-222222222222" };

// The venue's clock can print a narrow no-break space before AM/PM.
const plain = (text: string | undefined) => text?.replace(/\s+/g, " ");

function step(overrides: Partial<NextStepInput>) {
  return hackathonNextStep({
    now: DURING,
    hackathon: HACKATHON,
    registrationStatus: "checked_in",
    hasTeam: true,
    ...overrides,
  });
}

describe("hackathonNextStep before registering", () => {
  const open = { ...HACKATHON, status: "open" };

  it("offers Register while registration is open, with the deadline in the venue's time", () => {
    const next = hackathonNextStep({
      now: BEFORE,
      hackathon: open,
      registrationStatus: null,
      hasTeam: false,
    });
    expect(next?.step).toBe("register");
    expect(next?.label).toBe("Register");
    expect(plain(next?.detail)).toBe("Applications close Sun, Feb 21, 11:59 PM EST.");
    expect(next?.href).toBe(`${BASE}?tab=INFO`);
  });

  it("says nothing without a deadline to quote, or once registration shuts", () => {
    expect(
      hackathonNextStep({
        now: BEFORE,
        hackathon: { ...open, registrationDeadline: null },
        registrationStatus: undefined,
        hasTeam: false,
      })?.detail,
    ).toBe("Applications are reviewed as they arrive.");

    for (const hackathon of [
      { ...open, status: "closed" },
      { ...open, status: "announced" },
      { ...open, registrationDeadline: new Date("2027-02-01T00:00:00Z") },
    ]) {
      expect(
        hackathonNextStep({
          now: BEFORE,
          hackathon,
          registrationStatus: null,
          hasTeam: false,
        }),
      ).toBeNull();
    }
  });
});

describe("hackathonNextStep for an application not yet admitted", () => {
  it("waits on a decision while pending", () => {
    const next = step({ registrationStatus: "pending", hasTeam: false });
    expect(next?.step).toBe("review");
    expect(next?.label).toBe("Waiting on a decision");
  });

  it("shows waitlisted and rejected as a status, not an action", () => {
    const waitlisted = step({ registrationStatus: "waitlisted", hasTeam: false });
    expect(waitlisted).toMatchObject({ step: "status", label: "Waitlisted" });

    const rejected = step({ registrationStatus: "rejected", hasTeam: false });
    expect(rejected).toMatchObject({ step: "status", label: "Not accepted" });

    // Neither points at a team, a submission or a pass.
    for (const next of [waitlisted, rejected]) {
      expect(next?.href).toBe(`${BASE}?tab=INFO`);
    }
  });

  it("ignores progress that only an admitted hacker can have", () => {
    for (const registrationStatus of ["pending", "waitlisted", "rejected"]) {
      const next = step({
        registrationStatus,
        submitted: true,
        resultsPublished: true,
        itinerary: {
          entry: ENTRY,
          appointments: [{ startsAt: DURING, endsAt: LATE, ...ROOM }],
        },
      });
      expect(next?.step).not.toBe("results");
      expect(next?.step).not.toBe("judging");
    }
  });

  it("calls an application on a finished event over rather than pending", () => {
    for (const registrationStatus of ["pending", "waitlisted"]) {
      expect(step({ now: AFTER, registrationStatus })).toMatchObject({
        step: "status",
        label: "Event ended",
      });
    }
    // A rejection stays a rejection.
    expect(step({ now: AFTER, registrationStatus: "rejected" })?.label).toBe(
      "Not accepted",
    );
  });

  it("returns nothing for a status it does not know", () => {
    expect(step({ registrationStatus: "mystery" })).toBeNull();
  });
});

describe("hackathonNextStep for an admitted hacker", () => {
  it("asks an accepted hacker to show their pass, saying when the event starts", () => {
    const early = step({ now: BEFORE, registrationStatus: "approved" });
    expect(early).toMatchObject({
      step: "pass",
      label: "Show your pass at check-in",
      href: `${BASE}?tab=SCHEDULE`,
    });
    expect(early?.detail).toBe("The event starts Fri, Feb 26.");

    const onTheDay = step({ now: DURING, registrationStatus: "approved" });
    expect(onTheDay?.detail).toBe("Have it scanned at the door.");
  });

  it("puts the pass ahead of the team for someone not yet checked in", () => {
    const next = step({ registrationStatus: "approved", hasTeam: false });
    expect(next?.step).toBe("pass");
  });

  it("sends a checked-in hacker with no team to find one", () => {
    const next = step({
      now: BEFORE,
      hasTeam: false,
      submissionWindow: WINDOW,
    });
    expect(next).toMatchObject({
      step: "team",
      label: "Find a team",
      href: `${BASE}?tab=TEAMS`,
    });
  });

  it("does not insist on a team once submissions open: a solo entry is valid", () => {
    const next = step({ now: DURING, hasTeam: false, submissionWindow: WINDOW });
    expect(next?.step).toBe("submit");
  });

  it("still suggests a team when the submission window is not known yet", () => {
    expect(step({ hasTeam: false, submissionWindow: undefined })?.step).toBe(
      "team",
    );
  });

  it("names the submission deadline in the venue's time", () => {
    const next = step({ now: DURING, submissionWindow: WINDOW });
    expect(next?.step).toBe("submit");
    expect(plain(next?.label)).toBe("Submit by Sun, Feb 28, 10:00 AM EST");
    expect(next?.detail).toBeUndefined();
    expect(next?.href).toBe(`/submit?id=${HACKATHON.id}`);
  });

  it("says when submissions open if a team gets there first", () => {
    const next = step({ now: BEFORE, submissionWindow: WINDOW });
    expect(next?.step).toBe("submit");
    expect(plain(next?.detail)).toBe("Submissions open Fri, Feb 26, 10:00 PM EST.");
  });

  it("falls back to a plain submit prompt without a window", () => {
    const next = step({ submissionWindow: undefined });
    expect(next).toMatchObject({
      step: "submit",
      label: "Submit your project",
    });
  });

  it("reports closed submissions as a status when nothing was filed", () => {
    const next = step({ now: new Date("2027-02-28T15:30:00Z"), submissionWindow: WINDOW });
    // Pointed at the Judging tab, where a team that entered on Devpost claims.
    expect(next).toMatchObject({
      step: "status",
      label: "Submissions closed",
      href: `${BASE}?tab=JUDGING`,
    });

    // A solo hacker past the deadline is told the same, not to find a team.
    expect(
      step({
        now: new Date("2027-02-28T15:30:00Z"),
        hasTeam: false,
        submissionWindow: WINDOW,
      })?.label,
    ).toBe("Submissions closed");
  });

  it("moves on to judging once a project is in", () => {
    const next = step({ submitted: true, submissionWindow: WINDOW });
    expect(next).toMatchObject({
      step: "judging",
      label: "Wait for your judging time",
      href: `${BASE}?tab=JUDGING`,
    });
  });

  it("shows the next judging slot with its time and place", () => {
    const next = step({
      submitted: true,
      submissionWindow: WINDOW,
      itinerary: {
        entry: ENTRY,
        appointments: [
          // Already judged, over, and a later slot: only the later one counts.
          {
            startsAt: new Date("2027-02-27T14:00:00Z"),
            endsAt: new Date("2027-02-27T14:10:00Z"),
            room: "Room 1",
            building: null,
            status: "complete",
          },
          {
            startsAt: new Date("2027-02-28T18:30:00Z"),
            endsAt: new Date("2027-02-28T18:40:00Z"),
            room: "Room 9",
            building: null,
            status: "future",
          },
          {
            startsAt: new Date("2027-02-28T15:10:00Z"),
            endsAt: new Date("2027-02-28T15:20:00Z"),
            ...ROOM,
          },
        ],
      },
    });
    expect(next?.step).toBe("judging");
    expect(plain(next?.label)).toBe("Judging Sun, Feb 28, 10:10 AM");
    expect(next?.detail).toBe("Room 204, Klaus");
    expect(next?.href).toBe(`${BASE}?tab=JUDGING`);
  });

  it("counts a claimed place in judging as an entry, as a Devpost team files nothing here", () => {
    const next = step({
      submitted: false,
      submissionWindow: WINDOW,
      // Past the portal deadline: without the claim this reads "Submissions closed".
      now: new Date("2027-02-28T15:05:00Z"),
      itinerary: {
        entry: ENTRY,
        appointments: [
          {
            startsAt: new Date("2027-02-28T15:10:00Z"),
            endsAt: new Date("2027-02-28T15:20:00Z"),
            room: null,
            building: null,
            status: "future",
          },
        ],
      },
    });
    expect(next?.step).toBe("judging");
    expect(next?.detail).toBe("Room to be announced.");
  });

  it("waits for a time while a filed project has no place in judging yet", () => {
    const next = step({
      submitted: true,
      itinerary: { entry: null, appointments: [] },
    });
    expect(next).toMatchObject({
      step: "judging",
      label: "Wait for your judging time",
    });
  });

  it("says so when the slot is happening now, even once a judge has started scoring", () => {
    for (const status of ["pending", "incomplete"]) {
      const next = step({
        now: new Date("2027-02-28T15:15:00Z"),
        submitted: true,
        itinerary: {
          entry: ENTRY,
          appointments: [
            {
              startsAt: new Date("2027-02-28T15:10:00Z"),
              endsAt: new Date("2027-02-28T15:20:00Z"),
              status,
              room: "Room 204",
              building: null,
            },
          ],
        },
      });
      expect(next).toMatchObject({
        step: "judging",
        label: "Your judging slot is on now",
        detail: "Room 204",
      });
    }
  });

  it("waits on results once every slot is behind them", () => {
    const next = step({
      now: LATE,
      submitted: true,
      itinerary: {
        entry: ENTRY,
        appointments: [
          {
            startsAt: new Date("2027-02-28T15:10:00Z"),
            endsAt: new Date("2027-02-28T15:20:00Z"),
            status: "missed",
            room: "Room 204",
            building: null,
          },
        ],
      },
    });
    expect(next).toMatchObject({
      step: "results",
      label: "Waiting on results",
      href: `${BASE}?tab=RESULTS`,
    });
  });

  it("points at published results ahead of every earlier step", () => {
    for (const registrationStatus of ["approved", "checked_in"]) {
      expect(
        step({ registrationStatus, hasTeam: false, resultsPublished: true }),
      ).toMatchObject({
        step: "results",
        label: "Results are out",
        href: `${BASE}?tab=RESULTS`,
      });
    }
  });
});

describe("hackathonNextStep once the event is over", () => {
  it("has a checked-in hacker wait on results, or read them", () => {
    expect(step({ now: AFTER })?.step).toBe("results");
    expect(step({ now: AFTER })?.label).toBe("Waiting on results");
    expect(step({ now: AFTER, resultsPublished: true })?.label).toBe(
      "Results are out",
    );
  });

  it("treats a completed status as over even on the event's dates", () => {
    const next = step({
      now: DURING,
      hackathon: { ...HACKATHON, status: "completed" },
    });
    expect(next?.label).toBe("Waiting on results");
  });

  it("does not ask an accepted hacker who never checked in to show a pass", () => {
    expect(step({ now: AFTER, registrationStatus: "approved" })).toMatchObject({
      step: "status",
      label: "Event ended",
    });
  });

  it("shows a cancelled event as a status for everyone registered", () => {
    for (const registrationStatus of [
      "pending",
      "approved",
      "checked_in",
      "waitlisted",
    ]) {
      expect(
        step({
          registrationStatus,
          hackathon: { ...HACKATHON, status: "cancelled" },
        }),
      ).toMatchObject({ step: "status", label: "Cancelled" });
    }
  });
});

describe("hackathonNextStep ordering", () => {
  it("walks register, review, pass, team, submit, judging, results in order", () => {
    const open = { ...HACKATHON, status: "open" };
    const slot = {
      startsAt: new Date("2027-02-28T15:10:00Z"),
      endsAt: new Date("2027-02-28T15:20:00Z"),
      ...ROOM,
    };
    const journey: Partial<NextStepInput>[] = [
      { now: BEFORE, hackathon: open, registrationStatus: null },
      { now: BEFORE, registrationStatus: "pending" },
      { now: BEFORE, registrationStatus: "approved" },
      { now: DURING, hasTeam: false, submissionWindow: { ...WINDOW, opensAt: LATE } },
      { now: DURING, hasTeam: true, submissionWindow: WINDOW },
      { now: DURING, submitted: true, submissionWindow: WINDOW },
      {
        now: DURING,
        submitted: true,
        itinerary: { entry: ENTRY, appointments: [slot] },
      },
      { now: AFTER, submitted: true, resultsPublished: true },
    ];
    expect(journey.map((input) => step(input)?.step)).toEqual([
      "register",
      "review",
      "pass",
      "team",
      "submit",
      "judging",
      "judging",
      "results",
    ]);
  });

  it("deep-links with the id when the name has nothing to slug", () => {
    const next = step({
      registrationStatus: "approved",
      hackathon: { ...HACKATHON, name: "!!!" },
    });
    expect(next?.href).toBe(`/hackathons/${HACKATHON.id}?tab=SCHEDULE`);
  });

  it("accepts dates that arrived as strings", () => {
    const next = step({
      now: BEFORE,
      registrationStatus: "approved",
      hackathon: {
        ...HACKATHON,
        startDate: "2027-02-26T14:00:00.000Z",
        endDate: "2027-02-28T17:00:00.000Z",
      },
    });
    expect(next?.detail).toBe("The event starts Fri, Feb 26.");
  });
});

describe("nextStepQueries", () => {
  const ask = (
    registrationStatus: string | null,
    now: Date,
    extra: { status?: string } = {},
  ) =>
    nextStepQueries({
      now,
      hackathon: { ...HACKATHON, status: extra.status ?? HACKATHON.status },
      registrationStatus,
    });

  it("asks nothing of someone who never registered", () => {
    expect(ask(null, DURING)).toEqual({
      submission: false,
      judging: false,
      results: false,
    });
  });

  it("reads the submission only for a checked-in hacker on a live event", () => {
    expect(ask("checked_in", DURING).submission).toBe(true);
    expect(ask("approved", DURING).submission).toBe(false);
    expect(ask("pending", DURING).submission).toBe(false);
    expect(ask("checked_in", AFTER).submission).toBe(false);
    expect(ask("checked_in", DURING, { status: "cancelled" }).submission).toBe(
      false,
    );
  });

  it("allows the itinerary only to a checked-in hacker on a live event", () => {
    expect(ask("checked_in", DURING).judging).toBe(true);
    expect(ask("approved", DURING).judging).toBe(false);
    expect(ask("checked_in", AFTER).judging).toBe(false);
  });

  it("reads results for an admitted hacker once the event has begun", () => {
    expect(ask("checked_in", DURING).results).toBe(true);
    expect(ask("approved", AFTER).results).toBe(true);
    expect(ask("approved", BEFORE, { status: "open" }).results).toBe(false);
    expect(ask("waitlisted", AFTER).results).toBe(false);
  });
});

describe("isWithinEditionDates", () => {
  it("counts every day of the event, the last one all day", () => {
    expect(isWithinEditionDates(HACKATHON, DURING)).toBe(true);
    expect(isWithinEditionDates(HACKATHON, new Date("2027-02-28T12:00:00Z"))).toBe(
      true,
    );
    expect(isWithinEditionDates(HACKATHON, AFTER)).toBe(false);
    expect(isWithinEditionDates(HACKATHON, BEFORE)).toBe(false);
  });

  it("widens the start by the lead days", () => {
    const threeDaysOut = new Date("2027-02-23T12:00:00Z");
    expect(isWithinEditionDates(HACKATHON, threeDaysOut, 2)).toBe(false);
    expect(isWithinEditionDates(HACKATHON, threeDaysOut, 3)).toBe(true);
    // The lead never extends past the end.
    expect(isWithinEditionDates(HACKATHON, AFTER, 2)).toBe(false);
  });
});

describe("projectSubmitted", () => {
  it("counts a filed project but not a draft or nothing", () => {
    expect(projectSubmitted({ status: "submitted" })).toBe(true);
    expect(projectSubmitted({ status: "judging" })).toBe(true);
    expect(projectSubmitted({ status: "draft" })).toBe(false);
    expect(projectSubmitted(null)).toBe(false);
    expect(projectSubmitted(undefined)).toBe(false);
  });
});
