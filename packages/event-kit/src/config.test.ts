import { describe, expect, it } from "vitest";
import { defineEvent } from "./config";
import type { EventContent, EventCore, EventInput } from "./config";

const core: EventCore = {
  brand: "Hacklytics",
  year: 2027,
  timeZone: "America/New_York",
  theme: {
    name: "Digital Bloom",
    storageKey: "hl-theme",
    ground: { light: "#f1f4f6", dark: "#0e0f13" },
  },
  start: "2027-02-26T17:00:00-05:00",
  end: "2027-02-28T16:00:00-05:00",
  hacking: {
    start: "2027-02-26T21:00:00-05:00",
    end: "2027-02-28T09:00:00-05:00",
  },
  venue: {
    name: "Klaus",
    address: {
      street: "266 Ferst Dr NW",
      locality: "Atlanta",
      region: "GA",
      postalCode: "30332",
      country: "US",
    },
  },
  organizer: { name: "Data Science @ GT" },
  contactEmail: "hello@hacklytics.io",
  links: {
    portal: "https://datasciencegt.org",
    portalPath: "/hacklytics",
    mlh: "https://mlh.io/na",
    social: [],
  },
  registration: {
    url: "https://example.com/interest",
    label: "Notify me",
    availability: "PreOrder",
    validFrom: "2026-08-01T00:00:00-04:00",
    price: "0",
    currency: "USD",
  },
};

const content: EventContent = {
  seo: {
    tagline: "Hackathon",
    description: "d",
    shareDescription: "s",
    summary: "t",
    eventDescription: "e",
    keywords: ["hackathon"],
    url: "https://hacklytics.io",
    image: "/og-image.jpg",
    twitter: "@dsgt",
  },
  about: { heading: "About", body: ["Body"] },
  tracks: [{ title: "Finance", description: "Markets" }],
  prizes: { intro: "Soon", items: [{ label: "Best", detail: "Top project" }] },
  speakers: [],
  schedule: {
    intro: "Key times",
    board: [
      { when: "Fri 5:00 PM", event: "Check-in" },
      { when: "Sat, all day", event: "Build" },
    ],
  },
  judges: { body: ["Judge"], people: [] },
  sponsors: { body: ["Sponsor"], tiers: [] },
  faqs: [{ q: "Free?", a: "Yes" }],
  footer: { headline: "Soon" },
};

const build = (
  coreOverrides: Partial<EventCore> = {},
  contentOverrides: Partial<EventContent> = {},
) =>
  defineEvent({
    ...core,
    ...coreOverrides,
    content: () => ({ ...content, ...contentOverrides }),
  } satisfies EventInput);

describe("defineEvent derived values", () => {
  const event = build();

  it("names the edition", () => {
    expect(event.name).toBe("Hacklytics 2027");
    expect(event.headline).toBe("Hacklytics 2027: Digital Bloom");
  });

  it("labels the dates in New York time", () => {
    expect(event.dates.short).toBe("Feb 26–28, 2027");
    expect(event.dates.long).toBe("February 26–28, 2027");
    expect(event.dates.startLabel).toBe("Feb 26");
    expect(event.dates.endLabel).toBe("Feb 28");
    expect(event.dates.days).toEqual([
      { key: "Fri", name: "Friday", label: "Feb 26" },
      { key: "Sat", name: "Saturday", label: "Feb 27" },
      { key: "Sun", name: "Sunday", label: "Feb 28" },
    ]);
  });

  it("measures the hacking window and the schedule rail", () => {
    expect(event.hackHours).toBe(36);
    expect(event.schedule.rail).toEqual({ span: 72, from: 21, to: 57 });
  });

  it("keeps the instants it was given", () => {
    expect(event.start).toBe("2027-02-26T17:00:00-05:00");
    expect(event.startMs).toBe(Date.parse("2027-02-26T17:00:00-05:00"));
    expect(event.endMs).toBe(Date.parse("2027-02-28T16:00:00-05:00"));
  });

  it("derives the portal links from the origin", () => {
    expect(event.links.hackerPortal).toBe("https://datasciencegt.org/hacklytics");
    expect(event.links.judgeSignIn).toBe(
      "https://datasciencegt.org/login?callbackUrl=%2Fjudge",
    );
    expect(event.links.judgeApply).toBe(
      "https://datasciencegt.org/login?callbackUrl=%2Fjudge%2Fregister",
    );
    expect(event.links.portalInterest).toBe(
      "https://datasciencegt.org/login?callbackUrl=%2Fhacklytics",
    );
  });

  it("puts the edition's page where the config says", () => {
    const event = build({ links: { ...core.links, portalPath: "/hacklytics/2028" } });
    expect(event.links.hackerPortal).toBe("https://datasciencegt.org/hacklytics/2028");
    expect(event.links.portalInterest).toBe(
      "https://datasciencegt.org/login?callbackUrl=%2Fhacklytics%2F2028",
    );
  });

  it("hands the derived values to the copy", () => {
    let seen: string[] = [];
    defineEvent({
      ...core,
      content: ({ name, dates, links }) => {
        seen = [name, dates.long, links.judgeApply];
        return content;
      },
    });
    expect(seen[0]).toBe("Hacklytics 2027");
    expect(seen[1]).toBe("February 26–28, 2027");
    expect(seen[2]).toContain("callbackUrl=%2Fjudge%2Fregister");
  });
});

describe("defineEvent dates in the event's time zone", () => {
  it("reads a UTC timestamp as the New York day it falls on", () => {
    // 03:00 UTC on the 27th is 10:00 PM on the 26th in New York.
    const event = build({
      start: "2027-02-27T03:00:00Z",
      end: "2027-03-01T21:00:00Z",
      hacking: { start: "2027-02-27T04:00:00Z", end: "2027-03-01T14:00:00Z" },
    });
    expect(event.dates.startLabel).toBe("Feb 26");
    expect(event.dates.endLabel).toBe("Mar 1");
    expect(event.dates.short).toBe("Feb 26–Mar 1, 2027");
    expect(event.dates.long).toBe("February 26–March 1, 2027");
    expect(event.dates.days.map((d) => d.key)).toEqual(["Fri", "Sat", "Sun", "Mon"]);
    expect(event.schedule.rail.span).toBe(96);
  });

  it("measures the hacking window in elapsed time and the rail in clock time across a clock change", () => {
    // New York springs forward at 2:00 AM on Sunday, March 14, 2027.
    const event = build(
      {
        start: "2027-03-12T17:00:00-05:00",
        end: "2027-03-14T16:00:00-04:00",
        hacking: {
          start: "2027-03-12T21:00:00-05:00",
          end: "2027-03-14T09:00:00-04:00",
        },
      },
      {
        schedule: {
          intro: "",
          board: [{ when: "Fri 5:00 PM", event: "Check-in" }],
        },
      },
    );
    expect(event.hackHours).toBe(35);
    expect(event.schedule.rail).toEqual({ span: 72, from: 21, to: 57 });
  });

  it("labels the same instants by the calendar and clock of another zone", () => {
    // 5 PM Friday to 4 PM Sunday in New York is Saturday 7 AM to Monday 6 AM in Tokyo.
    const event = build(
      {
        timeZone: "Asia/Tokyo",
        start: "2027-02-26T22:00:00Z",
        end: "2027-02-28T21:00:00Z",
        hacking: { start: "2027-02-27T02:00:00Z", end: "2027-02-28T14:00:00Z" },
      },
      {
        schedule: {
          intro: "",
          board: [{ when: "Sat 7:00 AM", event: "Check-in" }],
        },
      },
    );
    expect(event.dates.short).toBe("Feb 27–Mar 1, 2027");
    expect(event.dates.days).toEqual([
      { key: "Sat", name: "Saturday", label: "Feb 27" },
      { key: "Sun", name: "Sunday", label: "Feb 28" },
      { key: "Mon", name: "Monday", label: "Mar 1" },
    ]);
    expect(event.hackHours).toBe(36);
    expect(event.schedule.rail).toEqual({ span: 72, from: 11, to: 47 });
  });

  it("takes the year of the start in the event's zone", () => {
    // 20:00 UTC on New Year's Eve is already January 1 in Tokyo, still December 31 in New York.
    const nye = {
      start: "2026-12-31T20:00:00Z",
      end: "2027-01-01T08:00:00Z",
      hacking: { start: "2026-12-31T21:00:00Z", end: "2027-01-01T07:00:00Z" },
    };
    const schedule = { intro: "", board: [{ when: "Fri 5:00 AM", event: "Go" }] } as const;
    expect(build({ ...nye, timeZone: "Asia/Tokyo" }, { schedule }).dates.short).toBe("Jan 1, 2027");
    expect(() => build(nye)).toThrow(/not in 2027/);
  });

  it("labels a one-day event as a single date", () => {
    const event = build(
      {
        start: "2027-02-26T09:00:00-05:00",
        end: "2027-02-26T21:00:00-05:00",
        hacking: {
          start: "2027-02-26T10:00:00-05:00",
          end: "2027-02-26T20:00:00-05:00",
        },
      },
      { schedule: { intro: "", board: [{ when: "Fri 9:00 AM", event: "Go" }] } },
    );
    expect(event.dates.short).toBe("Feb 26, 2027");
    expect(event.dates.days).toHaveLength(1);
  });
});

describe("defineEvent rejects editions that cannot render correctly", () => {
  it("needs an end after the start", () => {
    expect(() => build({ end: "2027-02-26T17:00:00-05:00" })).toThrow(/after start/);
    expect(() => build({ end: "2027-02-25T17:00:00-05:00" })).toThrow(/after start/);
  });

  it("needs timestamps that carry an offset", () => {
    expect(() => build({ start: "2027-02-26T17:00:00" })).toThrow(/UTC offset/);
    expect(() => build({ start: "February 26" })).toThrow(/UTC offset/);
    expect(() => build({ start: "2027-13-40T17:00:00-05:00" })).toThrow(/UTC offset/);
  });

  it("needs a time zone the runtime knows", () => {
    expect(() => build({ timeZone: "Nowhere/City" })).toThrow(/timeZone/);
    expect(() => build({ timeZone: "" })).toThrow(/timeZone/);
  });

  it("needs the year to match the start", () => {
    expect(() => build({ year: 2028 })).toThrow(/not in 2028/);
  });

  it("keeps the hacking window inside the weekend and in order", () => {
    expect(() =>
      build({ hacking: { start: "2027-02-26T16:00:00-05:00", end: "2027-02-28T09:00:00-05:00" } }),
    ).toThrow(/inside start to end/);
    expect(() =>
      build({ hacking: { start: "2027-02-27T09:00:00-05:00", end: "2027-02-27T09:00:00-05:00" } }),
    ).toThrow(/hacking.end/);
  });

  it("puts every schedule row on a day the event runs", () => {
    expect(() =>
      build({}, { schedule: { intro: "", board: [{ when: "Mon 9:00 AM", event: "Go" }] } }),
    ).toThrow(/Mon 9:00 AM.*Fri, Sat, Sun/);
  });

  it("keeps list keys unique", () => {
    expect(() =>
      build({}, { faqs: [{ q: "Same?", a: "a" }, { q: "Same?", a: "b" }] }),
    ).toThrow(/duplicate faq question "Same\?"/);
    expect(() =>
      build({}, { tracks: [{ title: "A", description: "" }, { title: "A", description: "" }] }),
    ).toThrow(/duplicate track/);
  });

  it("needs a storage key that is safe in the inline theme script", () => {
    for (const storageKey of ["", 'a"b', "a b", "</script>"]) {
      expect(() => build({ theme: { ...core.theme, storageKey } })).toThrow(/theme.storageKey/);
    }
  });

  it("needs a dev portal that is a bare origin", () => {
    expect(() => build({ links: { ...core.links, devPortal: "localhost:3001" } })).toThrow(
      /links.devPortal/,
    );
    expect(() => build({ links: { ...core.links, devPortal: "http://localhost:3001/" } })).toThrow(
      /links.devPortal/,
    );
  });

  it("needs a portal path that starts with a slash and does not end with one", () => {
    for (const portalPath of ["hacklytics", "/hacklytics/", "/", ""]) {
      expect(() => build({ links: { ...core.links, portalPath } })).toThrow(/links.portalPath/);
    }
  });

  it("needs a decimal price and an ISO currency code", () => {
    const registration = core.registration;
    for (const price of ["", "free", "-1", "$5"]) {
      expect(() => build({ registration: { ...registration, price } })).toThrow(
        /registration.price/,
      );
    }
    for (const currency of ["", "usd", "US", "DOLLAR"]) {
      expect(() => build({ registration: { ...registration, currency } })).toThrow(
        /registration.currency/,
      );
    }
    const paid = build({ registration: { ...registration, price: "25.00", currency: "EUR" } });
    expect(paid.registration).toMatchObject({ price: "25.00", currency: "EUR" });
  });

  it("needs an absolute code of conduct link", () => {
    const codeOfConduct = { label: "Code of conduct", href: "/conduct" };
    expect(() => build({ links: { ...core.links, codeOfConduct } })).toThrow(
      /links.codeOfConduct.href/,
    );
  });

  it("needs origins without a path, and hex colors", () => {
    expect(() => build({ links: { ...core.links, portal: "https://datasciencegt.org/" } })).toThrow(
      /links.portal/,
    );
    expect(() =>
      build({ theme: { ...core.theme, ground: { light: "white", dark: "#0e0f13" } } }),
    ).toThrow(/theme.ground.light/);
  });
});

describe("defineEvent application deadline", () => {
  const registration = core.registration;
  const closes = "2027-01-20T23:59:00-05:00";

  it("has no deadline unless the config gives one", () => {
    const event = build();
    expect(event.closesMs).toBeUndefined();
    let seen: unknown = "unset";
    defineEvent({
      ...core,
      content: ({ closes }) => {
        seen = closes;
        return content;
      },
    });
    expect(seen).toBeUndefined();
  });

  it("keeps the instant and hands the copy its date on the venue's calendar", () => {
    let seen: unknown;
    const event = defineEvent({
      ...core,
      registration: { ...registration, closes },
      content: ({ closes }) => {
        seen = closes;
        return content;
      },
    });
    expect(event.closesMs).toBe(Date.parse(closes));
    expect(seen).toMatchObject({ label: "Jan 20", long: "January 20", year: 2027 });
  });

  it("needs a timestamp with an offset", () => {
    expect(() =>
      build({ registration: { ...registration, closes: "2027-01-20T23:59:00" } }),
    ).toThrow(/registration.closes/);
  });

  describe("the footer once applications have closed", () => {
    const closed = {
      headline: "Applications are closed",
      cta: { text: "See the schedule", href: "/#schedule" },
    };

    it("carries the closed copy through", () => {
      const event = build(
        { registration: { ...registration, closes } },
        { footer: { headline: "Applications are open", closed } },
      );
      expect(event.footer.closed).toEqual(closed);
    });

    it("needs a deadline to close on, or the copy would never show", () => {
      expect(() => build({}, { footer: { headline: "Soon", closed } })).toThrow(
        /footer.closed needs registration.closes/,
      );
    });
  });

  it("closes after it opens and no later than the event starts", () => {
    expect(() =>
      build({ registration: { ...registration, closes: "2026-07-31T00:00:00-04:00" } }),
    ).toThrow(/after registration.validFrom/);
    expect(() =>
      build({ registration: { ...registration, closes: "2027-02-26T17:00:01-05:00" } }),
    ).toThrow(/must not be after start/);
  });
});
