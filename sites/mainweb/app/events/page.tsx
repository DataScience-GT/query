import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { db, events } from "@query/db";
import { and, gte, isNull, lt } from "drizzle-orm";
import { startOfEasternDay } from "@query/api/eastern-time";
import Link from "next/link";
import { eventDateParts, eventWhenWhere } from "@/lib/public-events";

/**
 * The club's upcoming events.
 *
 * This page said "No upcoming events scheduled" no matter what was in the
 * database — `events.list` had no caller anywhere, so club events existed only
 * for whoever was standing in front of the QR code.
 *
 * Read on the server rather than through tRPC: the tRPC provider is mounted
 * only inside the (portal) route group, and this page's whole audience is
 * people who are not signed in.
 */
// Bootcamp sessions share this table and are listed on /bootcamp, which is why
// every query below filters on bootcamp_term being null.
// Every five minutes, not every request, matching /projects. force-dynamic
// bought freshness nobody saw — proxy.ts already serves this max-age=3600.
export const revalidate = 300;

// qrCode is deliberately absent: publishing it would let anyone check
// themselves in without being in the room.
const listedColumns = {
  id: true,
  title: true,
  description: true,
  location: true,
  eventDate: true,
  maxCheckIns: true,
  currentCheckIns: true,
} as const;

// From the start of today, so an event running this afternoon counts as
// upcoming until it is actually over rather than dropping off at lunchtime.
// In Atlanta, not the server's UTC: midnight UTC is 8pm here, which dropped
// an evening event while it was still running.
const startOfToday = () => startOfEasternDay(new Date());

async function loadUpcoming() {
  if (!db) return [];

  // Same as /projects: a database that is asleep or unreachable renders an
  // empty list instead of failing the build or the revalidation.
  try {
    return await db.query.events.findMany({
      where: and(
        isNull(events.bootcampTerm),
        gte(events.eventDate, startOfToday()),
      ),
      orderBy: (event, { asc }) => [asc(event.eventDate)],
      limit: 20,
      columns: listedColumns,
    });
  } catch (error) {
    console.error("Failed to load upcoming events", error);
    return [];
  }
}

/**
 * Past events, most recent first. Leaving the upcoming list used to mean leaving
 * the site, so nothing recorded that an event ran. Attendance stands in for the
 * capacity badge, which means nothing once the room has emptied.
 */
async function loadPast() {
  if (!db) return [];

  try {
    return await db.query.events.findMany({
      where: and(
        isNull(events.bootcampTerm),
        lt(events.eventDate, startOfToday()),
      ),
      orderBy: (event, { desc }) => [desc(event.eventDate)],
      limit: 20,
      columns: listedColumns,
    });
  } catch (error) {
    console.error("Failed to load past events", error);
    return [];
  }
}

type ListedEvent = Awaited<ReturnType<typeof loadUpcoming>>[number];

function EventRow({ event, past }: { event: ListedEvent; past?: boolean }) {
  const { month, day } = eventDateParts(event.eventDate);
  const full =
    !past && !!event.maxCheckIns && event.currentCheckIns >= event.maxCheckIns;

  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-5 py-6 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_1fr] sm:gap-x-8">
      <div className={past ? "text-gray-500" : "text-[#00A8A8]"}>
        <p className="font-mono text-xs uppercase tracking-[0.2em]">{month}</p>
        <p className="text-3xl font-bold leading-none tabular-nums sm:text-4xl">
          {day}
        </p>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3
            className={`text-lg font-semibold ${past ? "text-gray-300" : "text-white"}`}
          >
            {event.title}
          </h3>
          {full && (
            <span className="border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-amber-300">
              Full
            </span>
          )}
          {past && event.currentCheckIns > 0 && (
            <span className="font-mono text-[11px] text-gray-400">
              {event.currentCheckIns} checked in
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-400">
          {eventWhenWhere(event.eventDate, event.location)}
        </p>
        {event.description && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-gray-400">
            {event.description}
          </p>
        )}
      </div>
    </li>
  );
}

export default async function EventsPage() {
  // Two independent reads; the slower one is the whole cost.
  const [upcoming, past] = await Promise.all([loadUpcoming(), loadPast()]);

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="events" />
      <main className="pt-20">
        <Section className="py-24 sm:py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-bold tracking-tighter sm:text-6xl">
              Club events
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-300">
              Meetings, workshops and talks open to DSGT members. The weekly
              bootcamp sessions are on the{" "}
              <Link
                href="/bootcamp"
                className="text-[#00A8A8] underline-offset-4 hover:underline"
              >
                bootcamp page
              </Link>
              , and Hacklytics has its own.
            </p>

            <section className="mt-20" aria-labelledby="upcoming">
              <h2
                id="upcoming"
                className="mb-8 border-b border-white/10 pb-3 font-mono text-xs uppercase tracking-[0.3em] text-gray-300"
              >
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <p className="max-w-xl text-gray-300">
                  Nothing is scheduled right now. The{" "}
                  <Link
                    href="/bootcamp"
                    className="text-[#00A8A8] underline-offset-4 hover:underline"
                  >
                    bootcamp
                  </Link>{" "}
                  meets weekly during the semester.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {upcoming.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </section>

            {past.length > 0 && (
              <section className="mt-24" aria-labelledby="past">
                <h2
                  id="past"
                  className="mb-8 border-b border-white/10 pb-3 font-mono text-xs uppercase tracking-[0.3em] text-gray-400"
                >
                  Past
                </h2>
                <ul className="divide-y divide-white/5">
                  {past.map((event) => (
                    <EventRow key={event.id} event={event} past />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
