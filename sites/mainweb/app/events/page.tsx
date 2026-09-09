import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import PublicFrame from "@/components/PublicFrame";
import { db, events } from "@query/db";
import { gte, lt } from "drizzle-orm";
import Link from "next/link";

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

const listedColumns = {
  id: true,
  title: true,
  description: true,
  location: true,
  eventDate: true,
  maxCheckIns: true,
  currentCheckIns: true,
} as const;

function startOfToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return since;
}

async function loadUpcoming() {
  if (!db) return [];

  return await db.query.events.findMany({
    where: gte(events.eventDate, startOfToday()),
    orderBy: (event, { asc }) => [asc(event.eventDate)],
    limit: 20,
    columns: listedColumns,
  });
}

async function loadPast() {
  if (!db) return [];

  return await db.query.events.findMany({
    where: lt(events.eventDate, startOfToday()),
    orderBy: (event, { desc }) => [desc(event.eventDate)],
    limit: 20,
    columns: listedColumns,
  });
}

export default async function EventsPage() {
  const [upcoming, past] = await Promise.all([loadUpcoming(), loadPast()]);

  return (
    <PublicFrame note="after 6:30 ET">
      <div className="relative min-h-screen">
        <Navbar screen_width={1024} page="events" />
        <main className="pt-20">
          <Section className="py-32">
            <div className="max-w-4xl mx-auto px-6">
              <p className="public-kicker mb-4">Club calendar</p>
              <h1 className="public-display text-5xl md:text-6xl mb-6">
                Show up. The room is already mid-project.
              </h1>
              <p className="public-lede mb-12">
                Upcoming DSGT meetings, workshops, and gatherings. Hacklytics
                has its own page.
              </p>
              <div className="public-card p-8">
                <h2 className="public-display text-2xl mb-4">Upcoming</h2>
                {upcoming.length === 0 ? (
                  <p className="text-[var(--muted)]">
                    No upcoming club events scheduled. Check back soon.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--rule)]">
                    {upcoming.map((event) => {
                      const full =
                        !!event.maxCheckIns &&
                        event.currentCheckIns >= event.maxCheckIns;

                      return (
                        <li
                          key={event.id}
                          className="py-5 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-baseline gap-3">
                            <h3 className="public-display text-lg">
                              {event.title}
                            </h3>
                            {full && (
                              <span className="public-chip bg-[var(--buzz)] text-[var(--ink)] border-[var(--buzz)]">
                                Full
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm">
                            {formatWhen(event.eventDate)}
                            {event.location ? ` · ${event.location}` : ""}
                          </p>
                          {event.description && (
                            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
                              {event.description}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {past.length > 0 && (
                <div className="mt-8 public-card p-8">
                  <h2 className="public-display text-2xl mb-4">Past</h2>
                  <ul className="divide-y divide-[var(--rule)]">
                    {past.map((event) => (
                      <li key={event.id} className="py-5 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <h3 className="public-display text-lg">
                            {event.title}
                          </h3>
                          {event.currentCheckIns > 0 && (
                            <span className="public-chip">
                              {event.currentCheckIns} checked in
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {formatWhen(event.eventDate)}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                        {event.description && (
                          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
                            {event.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-8 text-sm">
                Looking for Hacklytics?{" "}
                <Link href="/hacklytics" className="public-link">
                  Go to the hackathon page
                </Link>
                .
              </p>
            </div>
          </Section>
        </main>
        <Footer />
      </div>
    </PublicFrame>
  );
}
