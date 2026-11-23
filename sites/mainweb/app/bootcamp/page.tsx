import type { BootcampSession } from "@/lib/bootcamp-sessions.server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import hacklyticsLaptops from "@/assets/images/photos/hacklytics-2026-laptops.jpg";
import PublicPage from "@/components/PublicPage";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_MEETING_TIME,
  BOOTCAMP_START_DATE,
} from "@/lib/bootcamp-schedule";
import { loadBootcampSessions } from "@/lib/bootcamp-sessions.server";
import {
  bootcampSummary,
  eventDateParts,
  eventWhenWhere,
  sessionTitle,
  splitByDay,
  termLabel,
} from "@/lib/public-events";

import { startOfEasternDay } from "@query/api/eastern-time";
import { BOOTCAMP_ADDON_CENTS, formatCents } from "@query/api/pricing";
import { currentTerm } from "@query/db/services/membership";

export const metadata: Metadata = {
  title: "Bootcamp",
  description:
    "The DS bootcamp: weekly Python and data science sessions at Georgia Tech, with the schedule and how to join.",
  alternates: { canonical: "/bootcamp" },
  openGraph: {
    title: "Bootcamp | DS@GT",
    description:
      "The DS bootcamp: weekly Python and data science sessions at Georgia Tech, with the schedule and how to join.",
  },
};

/**
 * The current term's bootcamp: where and when it meets, the sessions the
 * officers have scheduled, and how to join.
 *
 * Read on the server like /events, since this page's audience is people who
 * are not signed in and the tRPC provider only exists inside the portal.
 */
export const revalidate = 300;

function SessionRow({
  session,
  past,
}: {
  session: BootcampSession;
  past?: boolean;
}) {
  const { month, day } = eventDateParts(session.eventDate);

  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-5 py-5 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_1fr] sm:gap-x-8">
      <div className={past ? "text-gray-500" : "text-dsgt-teal"}>
        <p className="font-mono text-xs tracking-[0.2em] uppercase">{month}</p>
        <p className="text-3xl leading-none font-bold tabular-nums">{day}</p>
      </div>
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-gray-400 uppercase">
          {session.bootcampWeek ? `Week ${session.bootcampWeek}` : "Session"}
        </p>
        <h3
          className={`mt-1 text-lg font-semibold ${past ? "text-gray-300" : "text-white"}`}
        >
          {sessionTitle(session.title)}
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          {/* No room: the bootcamp is paid, enrolled members see it in the portal. */}
          {eventWhenWhere(session.eventDate, null)}
        </p>
      </div>
    </li>
  );
}

export default async function BootcampPage() {
  const term = currentTerm();
  const sessions = await loadBootcampSessions(term);
  const { upcoming, past } = splitByDay(
    sessions,
    // oxlint-disable-next-line react/purity
    startOfEasternDay(new Date()),
  );
  const facts = bootcampSummary(
    { upcoming, past },
    {
      startDate: BOOTCAMP_START_DATE,
      time: BOOTCAMP_MEETING_TIME,
    },
  );

  return (
    <PublicPage
      eyebrow={termLabel(term)}
      title="Python data science bootcamp"
      lede="Nine weeks, in person, from data wrangling to deep learning. The last three weeks go to a project of your own."
    >
      <Image
        src={hacklyticsLaptops}
        alt="Students working on laptops in a lecture hall at Hacklytics 2026"
        className="mb-16 h-64 w-full rounded-lg object-cover object-[50%_40%] sm:h-80 md:mb-20 lg:h-[28rem]"
        sizes="(min-width: 1280px) 1184px, 100vw"
        quality={90}
        placeholder="blur"
      />
      <div className="max-w-4xl text-white">
        <dl className="grid grid-cols-1 gap-x-10 gap-y-6 border-y border-white/10 py-8 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="font-mono text-[11px] tracking-[0.2em] text-gray-400 uppercase">
                {fact.label}
              </dt>
              <dd className="mt-2 text-xl font-semibold text-white">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="mt-24" aria-labelledby="sessions">
          <h2 id="sessions" className="text-3xl font-bold tracking-tight">
            Sessions
          </h2>
          {sessions.length === 0 ? (
            <p className="mt-6 max-w-xl text-gray-300">
              Dates for {termLabel(term)} have not been posted yet. They appear
              here once the officers schedule them
              {BOOTCAMP_START_DATE
                ? `; the first session is planned for ${BOOTCAMP_START_DATE}`
                : ""}
              .
            </p>
          ) : (
            <div className="mt-8 space-y-14">
              {upcoming.length > 0 && (
                <div>
                  <h3 className="mb-6 font-mono text-xs tracking-[0.3em] text-gray-300 uppercase">
                    Upcoming
                  </h3>
                  <ul className="divide-y divide-white/5">
                    {upcoming.map((session) => (
                      <SessionRow key={session.id} session={session} />
                    ))}
                  </ul>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <h3 className="mb-6 font-mono text-xs tracking-[0.3em] text-gray-400 uppercase">
                    Past
                  </h3>
                  <ul className="divide-y divide-white/5">
                    {past.map((session) => (
                      <SessionRow key={session.id} session={session} past />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {sessions.length === 0 && BOOTCAMP_CURRICULUM.length > 0 && (
          <section className="mt-24" aria-labelledby="syllabus">
            <h2 id="syllabus" className="text-3xl font-bold tracking-tight">
              Syllabus
            </h2>
            <ol className="mt-8 grid gap-x-12 sm:grid-cols-2">
              {BOOTCAMP_CURRICULUM.map((item) => (
                <li
                  key={item.week}
                  className="flex items-baseline gap-4 border-b border-white/5 py-3"
                >
                  <span className="text-dsgt-teal w-6 shrink-0 font-mono text-sm tabular-nums">
                    {item.week}
                  </span>
                  <span className="text-gray-200">{item.title}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section
          className="mt-24 border-t border-white/10 pt-12"
          aria-labelledby="join"
        >
          <h2 id="join" className="text-3xl font-bold tracking-tight">
            Join the bootcamp
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-gray-300">
            The bootcamp is a {formatCents(BOOTCAMP_ADDON_CENTS)} add-on to a
            DS@GT membership and covers one semester. Sign in to the portal to
            add it, or become a member first.
          </p>
          <Link
            href="/club/bootcamp"
            className="bg-dsgt-teal mt-8 inline-flex min-h-11 items-center rounded-sm px-6 text-sm font-semibold text-black transition-colors hover:bg-white"
          >
            Join in the portal
          </Link>
        </section>
      </div>
    </PublicPage>
  );
}
