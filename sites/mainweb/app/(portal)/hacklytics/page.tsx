"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { InterestForm } from "@/components/hackathon/InterestForm";
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
  sectionTitle,
  textLink,
} from "@/components/portal/ui";

/**
 * The public landing page for an edition that has been announced but is not yet
 * taking registrations, plus the interest form.
 *
 * Lives inside the (portal) route group so it inherits the tRPC and session
 * providers, which are mounted only there — but it is NOT an authenticated
 * page. A signed-out stranger is the entire audience, so everything above the
 * form renders without a session and the sidebar is suppressed for it in
 * PortalWrapper.
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
const formatRange = (start: Date, end: Date) => {
  const opts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  };
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startText = start.toLocaleDateString("en-US", opts);
  const endText = end.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return sameYear ? `${startText} – ${endText}` : `${startText} – ${endText}`;
};

/** Same fixed time zone, and the time as well — a deadline is a moment. */
const formatDeadline = (deadline: Date) =>
  deadline.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  });

/**
 * The sidebar is suppressed here, so the page carries its own masthead line:
 * the club's wordmark, linking home.
 */
function Masthead() {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${mastRule}`}>
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.01em] text-[var(--text-primary)]"
      >
        Query<span className="text-accent">.</span>
      </Link>
      <span className={meta}>Data Science @ GT</span>
    </div>
  );
}

export default function HacklyticsPage() {
  const upcoming = trpc.hackathon.getUpcoming.useQuery();

  if (upcoming.isPending) return <LoadingScreen />;

  if (upcoming.isError) {
    return (
      <main className={page}>
        <Masthead />
        <div className="mt-12">
          <p className={body}>
            We could not load the next hackathon just now. Check your
            connection and try again.
          </p>
          <button
            type="button"
            onClick={() => upcoming.refetch()}
            className={`mt-4 ${btnSecondary}`}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  // Nothing announced. Said plainly rather than left as an empty page or a
  // date invented to fill the space.
  if (!upcoming.data) {
    return (
      <main className={page}>
        <Masthead />
        <h1 className={`mt-12 ${pageTitle}`}>Nothing announced yet</h1>
        <p className={pageDek}>
          The next Hacklytics has not been announced. Follow Data Science @ GT
          and it will show up here first.
        </p>
      </main>
    );
  }

  const event = upcoming.data;
  // This page is the only public entrance to the hackathon, so it has to keep
  // working past the moment registration opens — before, it collected the
  // interest list; after, it points at the registration itself.
  const registrationOpen = event.registrationOpen;

  return (
    <main className={page}>
      <Masthead />

      <header className="mt-12">
        <p className={kicker}>
          {registrationOpen
            ? "Registration is open"
            : event.status === "in_progress"
              ? "The hackathon is under way"
              : event.status === "open" || event.status === "closed"
                ? "Registration has closed"
                : "Registration opens soon"}
        </p>

        <h1 className={`mt-1 ${pageTitle}`}>{event.name}</h1>

        {event.description ? (
          <p className={pageDek}>{event.description}</p>
        ) : null}
      </header>

      <dl className="mt-8 grid grid-cols-1 gap-5 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-3">
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

      <section className="mt-12 border-t border-[var(--border-subtle)] pt-8">
        {registrationOpen ? (
          <div className="space-y-4">
            <h2 className={sectionTitle}>Apply for {event.name}</h2>
            <p className={body}>
              {event.registrationDeadline
                ? `Applications close ${formatDeadline(event.registrationDeadline)}.`
                : "Applications are reviewed as they arrive."}
            </p>
            <Link
              href={`/hackathons/${hackathonSlug(event.name)}`}
              className={btnPrimary}
            >
              Register
            </Link>
          </div>
        ) : event.status === "announced" ? (
          <InterestForm hackathonId={event.id} callbackPath="/hacklytics" />
        ) : (
          // The interest list only takes sign-ups before registration opens;
          // offering it afterwards ended in an error on submit.
          <div className="space-y-4">
            <h2 className={sectionTitle}>
              {event.status === "in_progress"
                ? "Happening now"
                : "Registration has closed"}
            </h2>
            <p className={body}>
              {event.status === "in_progress"
                ? "Registered hackers can find their schedule, team and check-in pass on the event page."
                : "If you applied, your status is on the event page."}
            </p>
            <Link
              href={`/hackathons/${hackathonSlug(event.name)}`}
              className={btnSecondary}
            >
              Go to the event page
            </Link>
          </div>
        )}
      </section>

      {event.websiteUrl ? (
        <a href={event.websiteUrl} className={`mt-10 ${textLink}`}>
          More about {event.name}
        </a>
      ) : null}
    </main>
  );
}
