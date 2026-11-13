import Link from "next/link";
import { headers } from "next/headers";
import { appRouter, createContext, resolveClientIp } from "@query/api";
import type { RouterOutputs } from "@query/api";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { VENUE_TZ } from "@/lib/venue-time";
import { InterestForm } from "@/components/hackathon/InterestForm";
import type { KnownSession } from "@/components/hackathon/InterestForm";
import {
  body,
  btnPrimary,
  btnSecondary,
  kicker,
  label,
  mastRule,
  meta,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@query/ui/classes";
import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { nextStepReads } from "@/lib/next-step-reads.server";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import { MyRegistration } from "./MyRegistration";
import { RetryButton } from "./RetryButton";
import { hlSectionTitle } from "./styles";

/**
 * The public landing page for an edition that has been announced but is not yet
 * taking registrations, plus the interest form.
 *
 * Lives inside the (portal) route group so it inherits the tRPC and session
 * providers, which are mounted only there — but it is NOT an authenticated
 * page. A signed-out stranger is the entire audience, so everything above the
 * form renders on the server without a session and the sidebar is suppressed
 * for it in PortalWrapper. Only the interest form and, for a signed-in
 * visitor, their registration status run in the browser.
 *
 * The form writes against this edition's id (from getUpcoming), not a
 * singleton. The same component is mounted on the edition page so joining
 * from either place lands on the same row.
 */

/**
 * Dates are rendered from a fixed locale and an explicit time zone rather than
 * the viewer's. The event happens in Atlanta; showing somebody in Singapore
 * their own local rendering of the start date is how a hackathon appears to
 * begin on the wrong day.
 */
const rangeFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: VENUE_TZ,
});
const formatRange = (start: Date, end: Date) =>
  rangeFormat.formatRange(start, end);

/** Same fixed time zone, and the time as well — a deadline is a moment. */
const formatDeadline = (deadline: Date) =>
  deadline.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: VENUE_TZ,
  });

/**
 * The sidebar is suppressed here, so the page carries its own masthead: the
 * Hacklytics wordmark (linking to the event site) and who runs it.
 */
function Masthead() {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${mastRule}`}>
      <a
        href="https://hacklytics.io"
        className="font-[family-name:var(--font-display)] text-[18px] font-bold leading-none text-[var(--text-primary)]"
      >
        Hacklytics
      </a>
      <span className={meta}>by Data Science @ GT</span>
    </div>
  );
}

/**
 * The flower bed from hacklytics.io, still: mostly dormant grey plants with
 * a few in bloom. Pixel maps and colours match sites/hacklytics2027/
 * components/pixel/sprites.ts. Decorative, so hidden from assistive tech.
 */
const DAISY = [
  "....ppp....",
  "...pPPPp...",
  "..pPcccPp..",
  "..pPcYcPp..",
  "..pPcccPp..",
  "...pPPPp...",
  "....ppp....",
  ".....g.....",
  ".....g.....",
  "..GG.g.....",
  ".G..Gg.....",
  ".....g.GG..",
  ".....gG..G.",
  ".....g.....",
  ".....g.....",
  "....ggg....",
];
const TULIP = [
  "..p.p.p..",
  ".pPpPpPp.",
  ".pPPcPPp.",
  ".pPPcPPp.",
  "..pPcPp..",
  "...ppp...",
  "....g....",
  "....g....",
  "..GGg....",
  ".G..g....",
  "....gGG..",
  "....g..G.",
  "....g....",
  "....g....",
  "...ggg...",
];
const STEM = { g: "#2f6b3a", G: "#4c9a55" };
const BLOOM = { ...STEM, p: "#b8285a", P: "#ff4f8b", c: "#ffc2d6", Y: "#ffe9f0" };
const DORMANT = { ...STEM, p: "#3a403c", P: "#5a625c", c: "#8a938c", Y: "#c9cfc9" };

function spriteUri(map: string[], colors: Record<string, string>) {
  let rects = "";
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`;
      }
    }),
  );
  const w = Math.max(...map.map((r) => r.length));
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${map.length}" shape-rendering="crispEdges">${rects}</svg>`,
  )}`;
}

const BED = Array.from({ length: 14 }, (_, i) => ({
  map: i % 3 === 1 ? TULIP : DAISY,
  bloom: i % 4 === 2,
  scale: i % 2 ? 4 : 5,
}));

function FlowerBed() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-16 flex items-end justify-around overflow-x-clip border-b border-[var(--border-subtle)]"
    >
      {BED.map((plant, i) => {
        const width = Math.max(...plant.map.map((r) => r.length)) * plant.scale;
        return (
          <img
            key={i}
            src={spriteUri(plant.map, plant.bloom ? BLOOM : DORMANT)}
            alt=""
            width={width}
            height={plant.map.length * plant.scale}
            className={`${i % 2 || i === 12 ? "hidden sm:block" : "block"} [image-rendering:pixelated]`}
            style={
              plant.bloom
                ? {
                    filter:
                      "drop-shadow(0 0 2px #ff4f8b) drop-shadow(0 0 10px rgba(255,79,139,.45))",
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

type Upcoming = NonNullable<RouterOutputs["hackathon"]["getUpcoming"]>;

/** What a visitor with no registration is offered, by where the edition is. */
function CallToAction({
  event,
  session,
}: {
  event: Upcoming;
  session: KnownSession;
}) {
  // This page is the only public entrance to the hackathon, so it has to keep
  // working past the moment registration opens — before, it collected the
  // interest list; after, it points at the registration itself.
  if (event.registrationOpen) {
    return (
      <div className="space-y-4">
        <h2 className={hlSectionTitle}>Apply for {event.name}</h2>
        <p className={body}>
          {event.registrationDeadline
            ? `Applications close ${formatDeadline(event.registrationDeadline)}.`
            : "Applications are reviewed as they arrive."}
        </p>
        <Link
          href={`/hackathons/${hackathonSlug(event.name)}`}
          className={`w-full sm:w-auto ${btnPrimary}`}
        >
          Register
        </Link>
      </div>
    );
  }

  if (event.status === "announced") {
    return (
      <InterestForm
        hackathonId={event.id}
        callbackPath="/hacklytics"
        serverSession={session}
      />
    );
  }

  // The interest list only takes sign-ups before registration opens;
  // offering it afterwards ended in an error on submit.
  return (
    <div className="space-y-4">
      <h2 className={hlSectionTitle}>
        {event.status === "in_progress"
          ? "Happening now"
          : event.status === "completed"
            ? "This edition has ended"
            : "Registration has closed"}
      </h2>
      <p className={body}>
        {event.status === "in_progress"
          ? "Registered hackers can find their schedule, team and check-in pass on the event page."
          : event.status === "completed"
            ? "The projects and the results, once they are published, are on the event page."
            : "If you applied, your status is on the event page."}
      </p>
      <Link
        href={`/hackathons/${hackathonSlug(event.name)}${event.status === "completed" ? "?tab=RESULTS" : ""}`}
        className={btnSecondary}
      >
        {event.status === "completed"
          ? "See the results"
          : "Go to the event page"}
      </Link>
    </div>
  );
}

export default async function HacklyticsPage() {
  // getUpcoming is public and its rate limit is keyed by address. Without the
  // visitor's own, every page view would draw on one shared "unknown" bucket.
  const ctx = await createContext({
    clientIp: resolveClientIp((await headers()).get("x-forwarded-for")),
  });
  let event: Upcoming | null = null;
  let failed = false;
  try {
    event = await appRouter.createCaller(ctx).hackathon.getUpcoming();
  } catch (error) {
    failed = true;
    console.error("[hacklytics] could not load the next hackathon:", error);
  }

  if (failed) {
    return (
      <main className={page}>
        <Masthead />
        <div className="mt-12">
          <p className={body}>
            We could not load the next hackathon just now. Check your
            connection and try again.
          </p>
          <RetryButton />
        </div>
      </main>
    );
  }

  // Nothing announced. Said plainly rather than left as an empty page or a
  // date invented to fill the space.
  if (!event) {
    return (
      <main className={page}>
        <Masthead />
        <h1 className={`mt-12 ${pageTitle}`}>Nothing announced yet</h1>
        <p className={pageDek}>
          The next Hacklytics has not been announced. Follow Data Science @ GT
          and it will show up here first.
        </p>
        <FlowerBed />
      </main>
    );
  }

  const session = ctx.userId
    ? { user: { email: ctx.session?.user?.email } }
    : null;
  const offer = <CallToAction event={event} session={session} />;

  return (
    <main className={page}>
      <Masthead />

      <header className="mt-12">
        <p className={kicker}>
          {event.registrationOpen
            ? "Registration is open"
            : event.status === "in_progress"
              ? "The hackathon is under way"
              : event.status === "completed"
                ? "The hackathon has ended"
                : event.status === "open" || event.status === "closed"
                  ? "Registration has closed"
                  : "Registration opens soon"}
        </p>

        <h1 className={`mt-1 ${pageTitle}`}>{event.name}</h1>

        {event.description ? (
          <p className={pageDek}>{event.description}</p>
        ) : null}
      </header>

      <section className="mt-8 border-t border-[var(--border-subtle)] pt-6">
        {ctx.userId ? (
          <PrefetchedPage
            reads={async (c) => {
              const myRegs = c.hackathon.myRegistrations();
              const entries: Prefetch[] = [
                ["hackathon.myRegistrations", undefined, myRegs],
              ];
              const reg = (await myRegs.catch(() => [])).find(
                (r) => r.hackathonId === event.id,
              );
              if (!reg) return entries;
              return [
                ...entries,
                ...nextStepReads(c, event, reg.registrationStatus),
              ];
            }}
          >
            <MyRegistration event={event}>{offer}</MyRegistration>
          </PrefetchedPage>
        ) : (
          offer
        )}
      </section>

      <dl className="mt-12 grid grid-cols-1 gap-5 border-t border-[var(--border-subtle)] pt-8 sm:grid-cols-3">
        <div>
          <dt className={label}>When</dt>
          <dd className="mt-1 text-[15px] text-[var(--text-primary)]">
            {formatRange(event.startDate, event.endDate)}
          </dd>
        </div>
        {event.location ? (
          <div>
            <dt className={label}>Where</dt>
            <dd className="mt-1 text-[15px] text-[var(--text-primary)]">
              {event.location}
            </dd>
          </div>
        ) : null}
        {event.theme ? (
          <div>
            <dt className={label}>Theme</dt>
            <dd className="mt-1 text-[15px] text-[var(--text-primary)]">
              {event.theme}
            </dd>
          </div>
        ) : null}
      </dl>

      {event.websiteUrl ? (
        <a href={event.websiteUrl} className={`mt-10 ${textLink}`}>
          More about {event.name}
        </a>
      ) : null}

      <FlowerBed />
    </main>
  );
}
