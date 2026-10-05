import type { Metadata } from "next";
import { Instrument_Sans, Silkscreen } from "next/font/google";
import { db, hackathons, inArray, eq, and, asc } from "@query/db";

// The Hacklytics site's own faces (sites/hacklytics2027): Silkscreen for
// headings, Instrument Sans for text. Scoped to this route by .hl-theme.
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-hl-pixel",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-hl-sans",
  display: "swap",
});

const SITE = "https://datasciencegt.org";
const URL = `${SITE}/hacklytics`;

/** Same funnel statuses the page itself renders from. */
const PUBLIC_FUNNEL_STATUSES = ["announced", "open", "closed", "in_progress"] as const;

/**
 * The edition this page is about, read on the server so the title, the link
 * preview and the structured data below all describe the real row rather than
 * a copy that goes stale the moment an organiser edits it.
 */
async function currentEdition() {
  if (!db) return null;
  return db.query.hackathons.findFirst({
    where: and(
      inArray(hackathons.status, [...PUBLIC_FUNNEL_STATUSES]),
      eq(hackathons.isPublic, true),
    ),
    orderBy: asc(hackathons.startDate),
    columns: {
      name: true,
      description: true,
      location: true,
      startDate: true,
      endDate: true,
      status: true,
      registrationDeadline: true,
    },
  });
}

// Read in Atlanta, not the server's UTC, or an evening start lands on the next
// day in the title and link preview.
const eastern = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { year: part("year"), month: part("month"), day: part("day") };
};

const formatRange = (start: Date, end: Date) => {
  const from = eastern(start);
  const to = eastern(end);
  // "Feb 26–28, 2027" rather than "Feb 26–Feb 28, 2027" within one month.
  const toLabel =
    from.month === to.month && from.year === to.year
      ? to.day
      : `${to.month} ${to.day}`;
  return `${from.month} ${from.day}–${toLabel}, ${to.year}`;
};

export async function generateMetadata(): Promise<Metadata> {
  const edition = await currentEdition();

  if (!edition) {
    return {
      // The root layout's template appends the organisation.
      title: "Hacklytics",
      description:
        "Georgia Tech's data science hackathon, run by Data Science @ Georgia Tech.",
      alternates: { canonical: URL },
    };
  }

  const dates = formatRange(edition.startDate, edition.endDate);
  const description =
    edition.description ??
    "Georgia Tech's data science hackathon, open to students nationwide.";
  const title = `${edition.name} | ${dates}`;

  return {
    title,
    description,
    alternates: { canonical: URL },
    openGraph: {
      type: "website",
      url: URL,
      siteName: "Data Science @ Georgia Tech",
      title: edition.name,
      description,
      images: [{ url: "/logo512.png", width: 512, height: 512 }],
    },
    twitter: {
      card: "summary",
      title: edition.name,
      description,
      images: ["/logo512.png"],
    },
  };
}

/**
 * Street addresses for the campus buildings the event runs in, matched against
 * the free-text location.
 *
 * Keyed rather than hardcoded so moving the venue drops back to campus-level
 * detail instead of publishing the old building's address — a wrong street
 * address puts the wrong pin on the map and is grounds for dropping the rich
 * result, where a missing one only makes it less precise.
 */
const VENUE_STREETS: { match: string; streetAddress: string; postalCode: string }[] = [
  {
    match: "klaus",
    streetAddress: "266 Ferst Dr NW",
    postalCode: "30332",
  },
];

const streetFor = (location: string) => {
  const lower = location.toLowerCase();
  const venue = VENUE_STREETS.find((entry) => lower.includes(entry.match));
  return venue
    ? { streetAddress: venue.streetAddress, postalCode: venue.postalCode }
    : {};
};

/**
 * schema.org/Event, which is what lets a crawler show this as an event —
 * name, dates and registration state — instead of one more blue link. Emitted
 * from the same row as the metadata above, so it cannot contradict the page.
 */
async function EventJsonLd() {
  const edition = await currentEdition();
  if (!edition) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: edition.name,
    startDate: edition.startDate.toISOString(),
    endDate: edition.endDate.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description:
      edition.description ??
      "Georgia Tech's data science hackathon, open to students nationwide.",
    url: URL,
    image: [`${SITE}/logo512.png`],
    organizer: {
      "@type": "Organization",
      name: "Data Science @ Georgia Tech",
      url: SITE,
    },
    // Only claimed when it is known: a placeholder address is worse than none,
    // and Google treats a wrong one as a reason to drop the rich result.
    ...(edition.location
      ? {
          location: {
            "@type": "Place",
            name: edition.location,
            address: {
              "@type": "PostalAddress",
              ...streetFor(edition.location),
              addressLocality: "Atlanta",
              addressRegion: "GA",
              addressCountry: "US",
            },
          },
        }
      : {}),
    ...(edition.status === "open"
      ? {
          offers: {
            "@type": "Offer",
            url: URL,
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            ...(edition.registrationDeadline
              ? { validThrough: edition.registrationDeadline.toISOString() }
              : {}),
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      // The name, description and location are admin-edited free text, so a
      // "</script>" in one would end this tag early. Escaping "<" keeps the
      // JSON identical to a parser and inert to the HTML one.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default function HacklyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`hl-theme ${silkscreen.variable} ${instrumentSans.variable}`}
    >
      <EventJsonLd />
      {children}
    </div>
  );
}
