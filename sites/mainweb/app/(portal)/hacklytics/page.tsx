"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { InterestForm } from "@/components/hackathon/InterestForm";

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

export default function HacklyticsPage() {
  const upcoming = trpc.hackathon.getUpcoming.useQuery();

  if (upcoming.isPending) return <LoadingScreen />;

  if (upcoming.isError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-sm text-[var(--text-muted)]">
            We could not load the next hackathon just now.
          </p>
          <button
            type="button"
            onClick={() => upcoming.refetch()}
            className="mt-4 px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-ui"
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
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Nothing announced yet
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            The next Hacklytics has not been announced. Follow Data Science @ GT
            and it will show up here first.
          </p>
        </div>
      </main>
    );
  }

  const event = upcoming.data;
  // This page is the only public entrance to the hackathon, so it has to keep
  // working past the moment registration opens — before, it collected the
  // interest list; after, it points at the registration itself.
  const registrationOpen = event.registrationOpen;

  return (
    <main className="min-h-screen px-6 py-20 md:py-28">
      <div className="max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-sm bg-accent/5 border border-accent/20 mb-8">
          <span className="w-1.5 h-1.5 rounded-sm bg-accent animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent/80">
            {registrationOpen
              ? "Registration is open"
              : event.status === "in_progress"
                ? "The hackathon is under way"
                : event.status === "open"
                  ? "Registration has closed"
                  : "Registration opens soon"}
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight text-[var(--text-primary)] leading-[0.95]">
          {event.name}
        </h1>

        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <div>
            <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
              When
            </dt>
            <dd className="mt-1 text-[var(--text-primary)]">
              {formatRange(event.startDate, event.endDate)}
            </dd>
          </div>
          {event.location ? (
            <div>
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Where
              </dt>
              <dd className="mt-1 text-[var(--text-primary)]">
                {event.location}
              </dd>
            </div>
          ) : null}
          {event.theme ? (
            <div>
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Theme
              </dt>
              <dd className="mt-1 text-[var(--text-primary)]">{event.theme}</dd>
            </div>
          ) : null}
        </dl>

        {event.description ? (
          <p className="mt-8 text-base text-[var(--text-muted)] leading-relaxed">
            {event.description}
          </p>
        ) : null}

        <div className="mt-12 p-8 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40">
          {registrationOpen ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-primary)]">
                Registration is open
              </h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {event.registrationDeadline
                  ? `Applications close ${formatDeadline(event.registrationDeadline)}. Spots are limited.`
                  : "Spots are limited and applications are reviewed as they arrive."}
              </p>
              <Link
                href={`/hackathons/${hackathonSlug(event.name)}`}
                className="inline-flex px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-ui"
              >
                Register now
              </Link>
            </div>
          ) : (
            <InterestForm
              hackathonId={event.id}
              callbackPath="/hacklytics"
            />
          )}
        </div>

        {event.websiteUrl ? (
          <a
            href={event.websiteUrl}
            className="inline-block mt-8 text-sm text-accent hover:underline underline-offset-4"
          >
            More about {event.name} →
          </a>
        ) : null}
      </div>
    </main>
  );
}
