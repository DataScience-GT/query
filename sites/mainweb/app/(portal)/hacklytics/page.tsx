"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

/**
 * The public landing page for an edition that has been announced but is not yet
 * taking registrations, plus the interest form.
 *
 * Lives inside the (portal) route group so it inherits the tRPC and session
 * providers, which are mounted only there — but it is NOT an authenticated
 * page. A signed-out stranger is the entire audience, so everything above the
 * form renders without a session and the sidebar is suppressed for it in
 * PortalWrapper.
 */

const EXPERIENCE_OPTIONS = [
  { value: "first", label: "This would be my first" },
  { value: "one_or_two", label: "I've done one or two" },
  { value: "three_plus", label: "I've done three or more" },
] as const;

type Experience = (typeof EXPERIENCE_OPTIONS)[number]["value"];

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block mt-1.5 text-[10px] text-[var(--text-muted)]/70">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full px-4 py-3 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-sm focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-[var(--text-muted)]/50 transition-ui";

export default function HacklyticsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const utils = trpc.useUtils();

  const upcoming = trpc.hackathon.getUpcoming.useQuery();
  const hackathonId = upcoming.data?.id;

  const mine = trpc.hackathon.myInterest.useQuery(
    { hackathonId: hackathonId ?? "" },
    { enabled: !!hackathonId && !!session },
  );

  const [school, setSchool] = useState("");
  const [country, setCountry] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [experience, setExperience] = useState<Experience | "">("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Prefill from an existing entry so "edit" starts from what they told us,
  // rather than making them retype it to change one field.
  useEffect(() => {
    if (!mine.data) return;
    setSchool(mine.data.school ?? "");
    setCountry(mine.data.country ?? "");
    setGraduationYear(
      mine.data.graduationYear ? String(mine.data.graduationYear) : "",
    );
    setExperience((mine.data.experience as Experience) ?? "");
  }, [mine.data]);

  const refresh = async () => {
    if (hackathonId) await utils.hackathon.myInterest.invalidate({ hackathonId });
  };

  const join = trpc.hackathon.registerInterest.useMutation({
    onSuccess: async () => {
      setError("");
      setEditing(false);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });

  const leave = trpc.hackathon.withdrawInterest.useMutation({
    onSuccess: async () => {
      setError("");
      setEditing(false);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });

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
  const onList = !!mine.data;
  const showForm = !onList || editing;
  const busy = join.isPending || leave.isPending;

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
          ) : sessionStatus === "loading" ? (
            <p className="text-sm text-[var(--text-muted)]">Checking sign-in…</p>
          ) : !session ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-primary)]">
                Get told the moment it opens
              </h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                Sign in so we have a verified address to reach you at. Google,
                GitHub, or a code sent to any email — no account needed
                beforehand, and it works wherever you are in the world.
              </p>
              <Link
                href="/login?callbackUrl=/hacklytics"
                className="inline-flex px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-ui"
              >
                Sign in to join the list
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-primary)]">
                  {onList ? "You're on the list" : "Join the interest list"}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
                  {onList
                    ? `We'll email ${session.user?.email} the moment registration opens.`
                    : "Four optional questions. They only shape how we plan the event — none of them affect whether you get in."}
                </p>
              </div>

              {showForm ? (
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!hackathonId) return;
                    const parsedYear = graduationYear.trim()
                      ? Number(graduationYear)
                      : null;
                    if (
                      parsedYear !== null &&
                      (!Number.isInteger(parsedYear) ||
                        parsedYear < 1900 ||
                        parsedYear > 2100)
                    ) {
                      setError("That graduation year does not look right.");
                      return;
                    }
                    join.mutate({
                      hackathonId,
                      school: school.trim() || undefined,
                      country: country.trim() || undefined,
                      graduationYear: parsedYear,
                      experience: experience || undefined,
                    });
                  }}
                >
                  <Field label="School or university">
                    <input
                      className={inputClass}
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Georgia Institute of Technology"
                      maxLength={200}
                    />
                  </Field>

                  <Field
                    label="Country"
                    hint="Hacklytics is open worldwide — this helps us plan travel and timing."
                  >
                    <input
                      className={inputClass}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="United States"
                      maxLength={100}
                    />
                  </Field>

                  <Field label="Graduation year">
                    <input
                      className={inputClass}
                      value={graduationYear}
                      onChange={(e) => setGraduationYear(e.target.value)}
                      placeholder="2029"
                      inputMode="numeric"
                    />
                  </Field>

                  <Field label="Hackathon experience">
                    <select
                      className={inputClass}
                      value={experience}
                      onChange={(e) =>
                        setExperience(e.target.value as Experience | "")
                      }
                    >
                      <option value="">Prefer not to say</option>
                      {EXPERIENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {error ? (
                    <p className="text-rose-400 font-mono text-[11px]">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-ui disabled:opacity-40"
                    >
                      {busy
                        ? "Saving…"
                        : onList
                          ? "Save changes"
                          : "Notify me when it opens"}
                    </button>
                    {onList ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(false);
                          setError("");
                        }}
                        disabled={busy}
                        className="px-6 py-4 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-ui disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="px-6 py-4 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-ui"
                  >
                    Edit my answers
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      hackathonId && leave.mutate({ hackathonId })
                    }
                    disabled={busy}
                    className="px-6 py-4 text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:text-rose-400 transition-ui disabled:opacity-40"
                  >
                    {leave.isPending ? "Leaving…" : "Take me off the list"}
                  </button>
                </div>
              )}

              {error && !showForm ? (
                <p className="text-rose-400 font-mono text-[11px]">{error}</p>
              ) : null}
            </div>
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
