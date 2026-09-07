import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { db, events } from "@query/db";
import { gte } from "drizzle-orm";
import Link from "next/link";

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
/**
 * Rendered every five minutes, not on every request, matching /projects.
 *
 * force-dynamic bought freshness nobody could observe: proxy.ts already serves
 * this path as `public, max-age=3600, stale-while-revalidate=86400`, so a
 * visitor's browser holds the page for an hour regardless. What it did cost was
 * a query and a full render on every uncached hit — including the first request
 * to a cold instance, which is where the tail lives.
 */
export const revalidate = 300;

const formatWhen = (date: Date) =>
  date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

async function loadUpcoming() {
  if (!db) return [];

  // From the start of today, so an event running this afternoon does not
  // disappear from the list at lunchtime.
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  return await db.query.events.findMany({
    where: gte(events.eventDate, since),
    orderBy: (event, { asc }) => [asc(event.eventDate)],
    limit: 20,
    // qrCode is deliberately absent: publishing it would let anyone check
    // themselves in without being in the room.
    columns: {
      id: true,
      title: true,
      description: true,
      location: true,
      eventDate: true,
      maxCheckIns: true,
      currentCheckIns: true,
    },
  });
}

export default async function EventsPage() {
  const upcoming = await loadUpcoming();

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="events" />
      <main className="pt-20">
        <Section className="py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-black uppercase tracking-tight mb-8">
              Club Events
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-12 italic">
              Upcoming DSGT meetings, workshops, and community gatherings.
              Hacklytics has its own page.
            </p>
            <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-2xl p-8">
              <h2 className="text-xl font-bold uppercase mb-4">
                Upcoming Club Events
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-gray-500 italic">
                  No upcoming club events scheduled. Check back soon!
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {upcoming.map((event) => {
                    const full =
                      !!event.maxCheckIns &&
                      event.currentCheckIns >= event.maxCheckIns;

                    return (
                      <li key={event.id} className="py-5 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <h3 className="text-lg font-bold">{event.title}</h3>
                          {full && (
                            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5">
                              Full
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-400">
                          {formatWhen(event.eventDate)}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                        {event.description && (
                          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                            {event.description}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mt-8 text-sm text-gray-500">
              Looking for Hacklytics?{" "}
              <Link
                href="/hacklytics"
                className="text-[#00A8A8] hover:underline underline-offset-4"
              >
                Go to the hackathon page
              </Link>
              .
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
