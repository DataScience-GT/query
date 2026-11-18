/**
 * The data shape of one Hacklytics edition. A site writes one `defineEvent`
 * call; every kit component reads the result, so the page copy, the JSON-LD
 * Event, the countdown and the schedule cannot disagree about when the
 * weekend is. Dates are written once, as ISO strings, and every label is
 * computed from them in the time zone the edition names.
 *
 * `defineEvent` throws on an edition that cannot be rendered correctly (end
 * before start, a schedule row on a day the event does not run, ...), and the
 * site build runs it, so a bad config fails the build instead of the page.
 */
import {
  describeDates,
  describeRail,
  isTimeZone,
  parseInstant,
  yearInZone,
} from "./dates";
import type { EventDates, ScheduleRail } from "./dates";

export type { EventDates, EventDay, ScheduleRail } from "./dates";

type NonEmpty<T> = readonly [T, ...T[]];

export interface Link {
  text: string;
  href: string;
  /** Opens in a new tab with `rel="noopener noreferrer"`. */
  external?: boolean;
}

/** Copy with inline links: a plain string, or strings and links in reading order. */
export type Rich = string | readonly (string | Link)[];

export interface Track {
  title: string;
  description: string;
}

export interface Prize {
  label: string;
  detail: string;
}

export interface Person {
  name: string;
  title?: string;
  company?: string;
}

export interface BoardRow {
  /** Starts with the three-letter weekday of an event day: "Fri 5:00 PM", "Sat, all day". */
  when: string;
  event: string;
  /** Set in medium weight: the times the weekend turns on. */
  accent?: boolean;
}

export interface Sponsor {
  name: string;
  url?: string;
  /** Path under the site's `public/`. Without one the name is shown as text. */
  logo?: string;
}

export interface SponsorTier {
  name: string;
  sponsors: NonEmpty<Sponsor>;
}

export interface Faq {
  q: string;
  a: Rich;
}

export interface Venue {
  name: string;
  address: {
    street: string;
    locality: string;
    region: string;
    postalCode: string;
    country: string;
  };
}

export interface Theme {
  /** "Digital Bloom" */
  name: string;
  /**
   * The page background per scheme, as hex: the browser bar's `theme-color`.
   * Must equal `--ground` in the site's theme CSS, which this cannot read.
   */
  ground: { light: string; dark: string };
  /**
   * localStorage key for a saved light or dark choice. Give every edition on
   * an origin the same key so a returning visitor keeps their pick. Letters,
   * digits and `_ . : -`, since it is written into an inline script.
   */
  storageKey: string;
}

export type Availability = "PreOrder" | "InStock" | "SoldOut";

export interface Registration {
  /** Where every sign-up button goes: an interest form now, the portal once registration opens. */
  url: string;
  /** The button label, such as "Notify me". */
  label: string;
  /** Spoken label for buttons that open another site. Defaults to `label`. */
  ariaLabel?: string;
  /**
   * The Event offer's availability in search results. PreOrder, not InStock,
   * while the link behind the offer joins an interest list rather than
   * securing a place: results that promise "register now" against a page that
   * cannot are the kind of thing that gets rich results pulled.
   */
  availability: Availability;
  /** When the offer became available, as ISO with offset. */
  validFrom: string;
  /** The offer's price as a decimal string, "0" for a free event. */
  price: string;
  /** The offer's ISO 4217 currency code, such as "USD". */
  currency: string;
}

export interface EventLinks {
  /** The portal origin, without a trailing slash. */
  portal: string;
  /** The edition's page on the portal: a leading slash, no trailing one. */
  portalPath: string;
  /**
   * A local portal's origin. When the page is served from a loopback host
   * the judge-interest form posts here instead of to `portal`, so trying the
   * form in dev never touches the real list. Without it the form posts to
   * `portal` everywhere.
   */
  devPortal?: string;
  /** MLH's trust badge link, with the season's tracking parameters. */
  mlh: string;
  /** The submission site, shown in the footer when set. */
  devpost?: string;
  /** The code of conduct, shown in the footer when set. `label` is the link text. */
  codeOfConduct?: { label: string; href: string };
  /** Footer social links, in the order shown. */
  social: readonly { label: string; href: string }[];
}

/** Links the kit derives from the portal origin. */
export interface PortalLinks {
  /** The portal's interest form, entered through sign-in. */
  portalInterest: string;
  /** The edition's page on the portal, where hackers apply and follow along. */
  hackerPortal: string;
  /** Judge sign-in, landing on the judging dashboard. */
  judgeSignIn: string;
  /** The judge application, entered through sign-in. */
  judgeApply: string;
}

export interface Seo {
  /** Follows "Hacklytics 2027: Digital Bloom · " in the page title. */
  tagline: string;
  /** The meta description. */
  description: string;
  /** og:description. */
  shareDescription: string;
  /** twitter:description. */
  summary: string;
  /** The JSON-LD Event description. */
  eventDescription: string;
  keywords: readonly string[];
  /** The site's public origin, without a trailing slash. */
  url: string;
  /** Path under `public/` of the 1200 by 630 share image. */
  image: string;
  /** The twitter:creator handle. */
  twitter: string;
}

/** What a site decides once per edition. */
export interface EventCore {
  /** The series name: "Hacklytics". */
  brand: string;
  year: number;
  /**
   * The IANA time zone of the venue. Day names, date labels and the schedule
   * rail read the calendar and clock there, whatever zone a timestamp is
   * written in.
   */
  timeZone: string;
  theme: Theme;
  /** ISO 8601 with offset, like 2027-02-26T17:00:00-05:00: when check-in opens. */
  start: string;
  /** ISO 8601 with offset: when the weekend closes. */
  end: string;
  /** The hacking window, which positions the schedule rail. Inside start to end. */
  hacking: { start: string; end: string };
  venue: Venue;
  organizer: { name: string };
  contactEmail: string;
  links: EventLinks;
  registration: Registration;
}

/** What the kit computes before the copy is written, so copy can use it. */
export interface EventDerived {
  /** "Hacklytics 2027" */
  name: string;
  /** "Hacklytics 2027: Digital Bloom" */
  headline: string;
  dates: EventDates;
  /** Length of the hacking window in hours. */
  hackHours: number;
  links: PortalLinks;
}

/** The page copy and lists. */
export interface EventContent {
  seo: Seo;
  about: {
    heading: string;
    /** The first paragraph leads; the rest are secondary. */
    body: NonEmpty<Rich>;
  };
  tracks: NonEmpty<Track>;
  prizes: { intro: string; items: NonEmpty<Prize> };
  /** Shown under the prizes when there are any. */
  speakers: readonly Person[];
  schedule: { intro: string; board: NonEmpty<BoardRow> };
  judges: {
    /** The first paragraph leads; the rest are secondary. */
    body: NonEmpty<Rich>;
    /** Shown under the apply button when there are any. */
    people: readonly Person[];
  };
  sponsors: {
    body: NonEmpty<Rich>;
    /** Logos by tier, shown under the text when there are any. */
    tiers: readonly SponsorTier[];
  };
  faqs: NonEmpty<Faq>;
  footer: {
    /** The closing line above the footer's sign-up button. */
    headline: string;
    note?: string;
  };
}

export interface EventInput extends EventCore {
  /** The copy, written with the derived values (dates, name) in hand. */
  content: (derived: EventDerived) => EventContent;
}

export interface EventConfig
  extends Omit<EventCore, "links">, Omit<EventContent, "schedule"> {
  name: string;
  headline: string;
  startMs: number;
  endMs: number;
  dates: EventDates;
  hackHours: number;
  links: EventLinks & PortalLinks;
  schedule: EventContent["schedule"] & { rail: ScheduleRail };
}

const HEX = /^#[0-9a-f]{6}$/i;
const STORAGE_KEY = /^[\w.:-]+$/;
const PRICE = /^\d+(\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;

const fail = (message: string): never => {
  throw new Error(`defineEvent: ${message}`);
};

function requireUnique(what: string, values: readonly string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${what} "${value}"`);
    seen.add(value);
  }
}

function requireOrigin(what: string, url: string) {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return fail(`${what} must be an absolute URL (got "${url}")`);
  }
  if (origin !== url) {
    fail(`${what} must be an origin with no path or trailing slash (got "${url}")`);
  }
}

function requireAbsolute(what: string, url: string) {
  try {
    new URL(url);
  } catch {
    fail(`${what} must be an absolute URL (got "${url}")`);
  }
}

export function defineEvent(input: EventInput): EventConfig {
  const { content, ...core } = input;
  const label = (what: string, iso: string) => {
    try {
      return parseInstant(what, iso);
    } catch (error) {
      return fail((error as Error).message);
    }
  };

  if (!isTimeZone(core.timeZone)) {
    fail(`timeZone must be an IANA time zone name (got "${core.timeZone}")`);
  }

  const startMs = label("start", core.start);
  const endMs = label("end", core.end);
  if (endMs <= startMs) fail(`end (${core.end}) must be after start (${core.start})`);
  if (yearInZone(core.timeZone, startMs) !== core.year) {
    fail(`start (${core.start}) is not in ${core.year}`);
  }

  const hackStartMs = label("hacking.start", core.hacking.start);
  const hackEndMs = label("hacking.end", core.hacking.end);
  if (hackEndMs <= hackStartMs) {
    fail(`hacking.end (${core.hacking.end}) must be after hacking.start`);
  }
  if (hackStartMs < startMs || hackEndMs > endMs) {
    fail("the hacking window must sit inside start to end");
  }
  label("registration.validFrom", core.registration.validFrom);
  if (!PRICE.test(core.registration.price)) {
    fail(`registration.price must be a decimal like "0" or "25.00" (got "${core.registration.price}")`);
  }
  if (!CURRENCY.test(core.registration.currency)) {
    fail(`registration.currency must be a three-letter ISO 4217 code (got "${core.registration.currency}")`);
  }

  for (const mode of ["light", "dark"] as const) {
    if (!HEX.test(core.theme.ground[mode])) {
      fail(`theme.ground.${mode} must be a #rrggbb color (got "${core.theme.ground[mode]}")`);
    }
  }
  if (!STORAGE_KEY.test(core.theme.storageKey)) {
    fail(`theme.storageKey must be letters, digits and _ . : - (got "${core.theme.storageKey}")`);
  }
  if (!core.contactEmail.includes("@")) {
    fail(`contactEmail must be an email address (got "${core.contactEmail}")`);
  }
  requireOrigin("links.portal", core.links.portal);
  if (core.links.devPortal) requireOrigin("links.devPortal", core.links.devPortal);
  if (!core.links.portalPath.startsWith("/") || core.links.portalPath.endsWith("/")) {
    fail(`links.portalPath must start with a slash and not end with one (got "${core.links.portalPath}")`);
  }
  requireAbsolute("links.mlh", core.links.mlh);
  if (core.links.codeOfConduct) {
    requireAbsolute("links.codeOfConduct.href", core.links.codeOfConduct.href);
  }
  requireAbsolute("registration.url", core.registration.url);

  const dates = describeDates(core.timeZone, startMs, endMs);
  const hackHours = (hackEndMs - hackStartMs) / 36e5;
  const name = `${core.brand} ${core.year}`;
  const callback = (path: string) =>
    `${core.links.portal}/login?callbackUrl=${encodeURIComponent(path)}`;
  const portalLinks: PortalLinks = {
    portalInterest: callback(core.links.portalPath),
    hackerPortal: `${core.links.portal}${core.links.portalPath}`,
    judgeSignIn: callback("/judge"),
    judgeApply: callback("/judge/register"),
  };
  const headline = `${name}: ${core.theme.name}`;

  const copy = content({ name, headline, dates, hackHours, links: portalLinks });
  requireOrigin("seo.url", copy.seo.url);

  const dayKeys = new Set(dates.days.map((d) => d.key));
  for (const row of copy.schedule.board) {
    if (!dayKeys.has(row.when.slice(0, 3))) {
      fail(
        `schedule row "${row.when}" must start with one of ${[...dayKeys].join(", ")}, the days the event runs`,
      );
    }
  }
  requireUnique("track", copy.tracks.map((t) => t.title));
  requireUnique("prize", copy.prizes.items.map((p) => p.label));
  requireUnique("faq question", copy.faqs.map((f) => f.q));

  return {
    ...core,
    ...copy,
    name,
    headline,
    startMs,
    endMs,
    dates,
    hackHours,
    links: { ...core.links, ...portalLinks },
    schedule: {
      ...copy.schedule,
      rail: describeRail(core.timeZone, startMs, endMs, hackStartMs, hackEndMs),
    },
  };
}
