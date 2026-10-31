import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { db, events } from "@query/db";
import { currentTerm } from "@query/db/services/membership";
import { eq } from "drizzle-orm";
import { startOfEasternDay } from "@query/api/eastern-time";
import { BOOTCAMP_ADDON_CENTS, formatCents } from "@query/api/pricing";
import Link from "next/link";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_MEETING_TIME,
  BOOTCAMP_ROOM,
  BOOTCAMP_START_DATE,
} from "@/lib/bootcamp-schedule";
import {
  bootcampSummary,
  eventDateParts,
  eventWhenWhere,
  sessionTitle,
  splitByDay,
  termLabel,
} from "@/lib/public-events";

/**
 * The current term's bootcamp: where and when it meets, the sessions the
 * officers have scheduled, and how to join.
 *
 * Read on the server like /events, since this page's audience is people who
 * are not signed in and the tRPC provider only exists inside the portal.
 */
export const revalidate = 300;

// qrCode is deliberately absent: publishing it would let anyone check
// themselves in without being in the room.
const listedColumns = {
  id: true,
  title: true,
  location: true,
  eventDate: true,
  bootcampWeek: true,
} as const;

async function loadSessions(term: string) {
  if (!db) return [];

  // Same as /events: an unreachable database renders the empty state instead
  // of failing the build or the revalidation.
  try {
    return await db.query.events.findMany({
      where: eq(events.bootcampTerm, term),
      orderBy: (event, { asc }) => [asc(event.eventDate)],
      limit: 30,
      columns: listedColumns,
    });
  } catch (error) {
    console.error("Failed to load bootcamp sessions", error);
    return [];
  }
}

type Session = Awaited<ReturnType<typeof loadSessions>>[number];

function SessionRow({ session, past }: { session: Session; past?: boolean }) {
  const { month, day } = eventDateParts(session.eventDate);

  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-5 py-5 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_1fr] sm:gap-x-8">
      <div className={past ? "text-gray-500" : "text-[#00A8A8]"}>
        <p className="font-mono text-xs uppercase tracking-[0.2em]">{month}</p>
        <p className="text-3xl font-bold leading-none tabular-nums">{day}</p>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
          {session.bootcampWeek ? `Week ${session.bootcampWeek}` : "Session"}
        </p>
        <h3
          className={`mt-1 text-lg font-semibold ${past ? "text-gray-300" : "text-white"}`}
        >
          {sessionTitle(session.title)}
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          {eventWhenWhere(session.eventDate, session.location)}
        </p>
      </div>
    </li>
  );
}

export default async function BootcampPage() {
  const term = currentTerm();
  const sessions = await loadSessions(term);
  // oxlint-disable-next-line react/purity
  const { upcoming, past } = splitByDay(sessions, startOfEasternDay(new Date()));
  const facts = bootcampSummary(
    { upcoming, past },
    {
      startDate: BOOTCAMP_START_DATE,
      time: BOOTCAMP_MEETING_TIME,
      room: BOOTCAMP_ROOM,
    },
  );

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="bootcamp" />
      <main className="pt-20">
        <Section className="py-24 sm:py-32">
          <div className="max-w-4xl mx-auto px-6">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#00A8A8]">
              {termLabel(term)}
            </p>
            <h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
              Python data science bootcamp
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-300">
              Nine weeks, in person, from data wrangling to deep learning. The
              last three weeks go to a project of your own.
            </p>

            <dl className="mt-12 grid grid-cols-1 gap-x-10 gap-y-6 border-y border-white/10 py-8 sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
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
                  Dates for {termLabel(term)} have not been posted yet. They
                  appear here once the officers schedule them
                  {BOOTCAMP_START_DATE
                    ? `; the first session is planned for ${BOOTCAMP_START_DATE}`
                    : ""}
                  .
                </p>
              ) : (
                <div className="mt-8 space-y-14">
                  {upcoming.length > 0 && (
                    <div>
                      <h3 className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-gray-300">
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
                      <h3 className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-gray-400">
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
                      <span className="w-6 shrink-0 font-mono text-sm tabular-nums text-[#00A8A8]">
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
                The bootcamp is a {formatCents(BOOTCAMP_ADDON_CENTS)} add-on to
                a DSGT membership and covers one semester. Sign in to the
                portal to add it, or become a member first.
              </p>
              <Link
                href="/club/bootcamp"
                className="mt-8 inline-flex min-h-11 items-center rounded-sm bg-[#00A8A8] px-6 text-sm font-semibold text-black transition-colors hover:bg-white"
              >
                Join in the portal
              </Link>
            </section>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
