"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GraduationCap, Check } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { trpc } from "@/lib/trpc";

/** `2026-fall` is how it is stored; nobody should have to read it that way. */
function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export default function AdminBootcampPage() {
  const { data: session, status } = useSession();
  const [term, setTerm] = useState<string | undefined>(undefined);

  const attendance = trpc.bootcamp.attendance.useQuery(
    { term },
    { enabled: !!session },
  );

  if (status === "loading" || attendance.isPending) {
    return <LoadingScreen message="Loading bootcamp…" />;
  }

  if (attendance.error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-sm text-red-300">
          {attendance.error.message}
        </p>
      </div>
    );
  }

  const data = attendance.data;
  const { sessions, members, stats } = data;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20 text-[var(--text-muted)]">
      <main className="mx-auto max-w-7xl px-6 pt-12 md:pt-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-6 w-6 text-accent" />
              <h1 className="text-3xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
                Bootcamp
              </h1>
            </div>
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--text-subtle)]">
              {termLabel(data.term)} · who is enrolled and who turned up
            </p>
          </div>

          {/* Attendance outlives its semester, so past terms stay reachable. */}
          {data.terms.length > 1 && (
            <div>
              <label
                htmlFor="bootcamp-term"
                className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
              >
                Term
              </label>
              <select
                id="bootcamp-term"
                value={data.term}
                onChange={(event) => setTerm(event.target.value)}
                className="mt-2 border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2 font-mono text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
              >
                {data.terms.map((option) => (
                  <option key={option} value={option}>
                    {termLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Enrolled" value={stats.enrolled} />
          <Stat
            label="Sessions held"
            value={`${stats.sessionsHeld}/${stats.sessionsPlanned}`}
          />
          <Stat label="Average attendance" value={stats.averageAttendance} />
          <Stat
            label="Turnout"
            value={
              stats.enrolled && stats.sessionsHeld
                ? `${Math.round((stats.averageAttendance / stats.enrolled) * 100)}%`
                : "—"
            }
          />
        </div>

        {sessions.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-8">
            <p className="font-bold text-[var(--text-primary)]">
              No sessions scheduled for {termLabel(data.term)}.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              A bootcamp session is an ordinary event with a bootcamp week set
              on it, so it takes attendance through the same QR and the same
              check-in desk. Create one from the{" "}
              <Link
                href="/admin"
                className="font-bold text-accent hover:underline"
              >
                Club Hub
              </Link>
              .
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-8">
            <p className="font-bold text-[var(--text-primary)]">
              Nobody has bought into this bootcamp yet.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Members enrol by adding the bootcamp to their membership payment.
              They appear here the moment that clears.
            </p>
          </div>
        ) : (
          /* Twelve weeks will not fit a phone; scrolling beats squeezing. */
          <div className="overflow-x-auto border border-[var(--border-subtle)]">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Bootcamp attendance for {termLabel(data.term)}: one row per
                enrolled member, one column per session.
              </caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-white/5">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
                    Member
                  </th>
                  {sessions.map((row) => (
                    <th
                      key={row.id}
                      scope="col"
                      title={`${row.title} · ${row.attendance} checked in`}
                      className="px-3 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                    >
                      W{row.week}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const attended = new Set(member.attendedEventIds);
                  return (
                    <tr
                      key={member.userId}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-normal"
                      >
                        <span className="block font-bold text-[var(--text-primary)]">
                          {member.name}
                        </span>
                        <span className="block text-xs text-[var(--text-subtle)]">
                          {member.email}
                        </span>
                      </th>

                      {sessions.map((row) => (
                        <td key={row.id} className="px-3 py-3 text-center">
                          {attended.has(row.id) ? (
                            <>
                              <Check
                                aria-hidden="true"
                                className="mx-auto h-4 w-4 text-emerald-400"
                              />
                              <span className="sr-only">
                                Attended week {row.week}
                              </span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true" className="text-[var(--text-subtle)]">
                                ·
                              </span>
                              <span className="sr-only">
                                {row.past ? "Missed" : "Not held yet"} week{" "}
                                {row.week}
                              </span>
                            </>
                          )}
                        </td>
                      ))}

                      <td className="px-4 py-3 text-right font-mono font-bold text-[var(--text-primary)]">
                        {member.attendedCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-subtle)] bg-white/5">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
                    Checked in
                  </th>
                  {sessions.map((row) => (
                    <td
                      key={row.id}
                      className="px-3 py-3 text-center font-mono text-xs text-[var(--text-muted)]"
                    >
                      {row.attendance}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {sessions.length > 0 && (
          <p className="mt-4 text-xs text-[var(--text-subtle)]">
            A session counts anyone who scanned in, member of this bootcamp or
            not, so a per-session total can run ahead of the rows above. Fix a
            wrong check-in from the event&rsquo;s attendance list on the Club
            Hub.
          </p>
        )}
      </main>
    </div>
  );
}
