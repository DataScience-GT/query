"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnSecondary,
  chip,
  input,
  label,
  meta,
  sectionTitle,
  status,
  textLink,
} from "./ui";

const Bar = dynamic(() => import("react-chartjs-2").then((m) => m.Bar), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type Range = "term" | "90d" | "all";
type SortKey = "count" | "last";

const RANGES: { value: Range; label: string }[] = [
  { value: "term", label: "This term" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const th = "px-4 py-2.5 text-[13px] font-medium text-[var(--text-subtle)]";
const td = "px-4 py-2.5";
const row =
  "border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--bg-secondary)]";

// Five figures wrap to two rows below lg, so the divider only appears once
// they sit on one line.
const statCell =
  "lg:border-l lg:border-[var(--border-subtle)] lg:pl-6 lg:first:border-l-0 lg:first:pl-0";

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] ${className}`}
      aria-hidden
    />
  );
}

function Stat({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className={statCell}>
      <dt className={label}>{title}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
        {value}
      </dd>
      {subtitle && <dd className={`mt-1.5 ${meta}`}>{subtitle}</dd>}
    </div>
  );
}

/** Canvas cannot read a CSS variable, so the tokens are resolved here. */
interface ChartTokens {
  accent: string;
  ink: string;
  muted: string;
  subtle: string;
  grid: string;
  card: string;
  font: string;
}

function readTokens(element: HTMLElement): ChartTokens {
  const root = getComputedStyle(document.documentElement);
  const read = (name: string) => root.getPropertyValue(name).trim();
  return {
    accent: read("--accent"),
    ink: read("--text-primary"),
    muted: read("--text-muted"),
    subtle: read("--text-subtle"),
    grid: read("--border-subtle"),
    card: read("--bg-card"),
    font: getComputedStyle(element).fontFamily,
  };
}

const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Club meeting attendance: who came, to what, and how often. Club events
 * only; hackathon check-ins are a separate system and are not counted here.
 */
export function ClubAttendanceMetrics({
  onOpenEvent,
  onScan,
}: {
  /** A row in the events table was picked. */
  onOpenEvent: (event: { id: string; title: string }) => void;
  /** The empty state's way to start recording attendance. */
  onScan: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("term");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("count");
  const [chartsReady, setChartsReady] = useState(false);
  const [tokens, setTokens] = useState<ChartTokens | null>(null);

  const metrics = trpc.events.attendanceMetrics.useQuery(
    { range },
    // Matched to the server's cache entry.
    { refetchInterval: 60000 },
  );

  useEffect(() => {
    import("chart.js").then(
      ({ Chart, BarElement, CategoryScale, LinearScale, Tooltip }) => {
        Chart.register(BarElement, CategoryScale, LinearScale, Tooltip);
        setChartsReady(true);
      },
    );
  }, []);

  // next-themes swaps the class on <html> in its own effect, so the tokens are
  // read a frame later when the new theme is live.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (containerRef.current) setTokens(readTokens(containerRef.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  const data = metrics.data;
  // Oldest first on the axis; the table below reads newest first.
  const chronological = useMemo(
    () => [...(data?.events ?? [])].reverse(),
    [data],
  );

  const options = useMemo(() => {
    if (!tokens) return undefined;
    const font = { family: tokens.font, size: 12 };
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tokens.card,
          borderColor: tokens.grid,
          borderWidth: 1,
          cornerRadius: 4,
          titleColor: tokens.ink,
          bodyColor: tokens.muted,
          titleFont: { ...font, weight: 600 },
          bodyFont: font,
          padding: 10,
          callbacks: {
            // Dates fit the axis; the tooltip names the meeting.
            title: (items: { dataIndex: number }[]) =>
              chronological[items[0]?.dataIndex ?? 0]?.title ?? "",
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: tokens.grid },
          ticks: { color: tokens.subtle, font },
        },
        y: {
          beginAtZero: true,
          grid: { color: tokens.grid },
          border: { display: false },
          ticks: { color: tokens.subtle, font, precision: 0 },
        },
      },
    };
  }, [tokens, chronological]);

  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = (data?.people ?? []).filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query),
    );
    const last = (p: (typeof matching)[number]) =>
      p.lastAttended ? new Date(p.lastAttended).getTime() : 0;
    return matching.sort((a, b) =>
      sort === "count"
        ? b.eventsAttended - a.eventsAttended || last(b) - last(a)
        : last(b) - last(a) || b.eventsAttended - a.eventsAttended,
    );
  }, [data, search, sort]);

  const handleExport = () => {
    if (people.length === 0) return;
    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Name", "Email", "Member", "Events attended", "Last attended"],
      ...people.map((p) => [
        p.name,
        p.email,
        p.isMember ? "Yes" : "No",
        p.eventsAttended,
        p.lastAttended ? new Date(p.lastAttended).toISOString() : "",
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `club_attendance_${range}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const loading = metrics.isPending;
  const ready = chartsReady && !!tokens && !!data;

  const chartData = {
    labels: chronological.map((e) => shortDate(new Date(e.eventDate))),
    datasets: [
      {
        label: "Check-ins",
        data: chronological.map((e) => e.checkIns),
        backgroundColor: tokens?.accent,
        borderRadius: 2,
        // A single meeting would otherwise stretch to the whole chart width.
        maxBarThickness: 56,
        borderSkipped: "bottom" as const,
      },
    ],
  };

  const sortHeader = (key: SortKey, text: string) => (
    <th
      scope="col"
      aria-sort={sort === key ? "descending" : "none"}
      className={`${th} text-right`}
    >
      <button
        type="button"
        onClick={() => setSort(key)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--text-primary)] ${
          sort === key ? "font-semibold text-[var(--text-primary)]" : ""
        }`}
      >
        {text}
        {sort === key && <span aria-hidden>↓</span>}
      </button>
    </th>
  );

  return (
    <div ref={containerRef}>
      <div
        role="group"
        aria-label="Date range"
        className="flex flex-wrap items-center gap-2"
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => setRange(r.value)}
            className={chip(range === r.value)}
          >
            {r.label}
          </button>
        ))}
        {data?.from && (
          <span className={`ml-1 ${meta}`}>Since {longDate(new Date(data.from))}</span>
        )}
      </div>

      {metrics.isError ? (
        <div className="mt-8 border-t border-[var(--border-subtle)] pt-6">
          <p className={body}>Attendance could not be loaded.</p>
          <button
            type="button"
            onClick={() => metrics.refetch()}
            className={`${textLink} mt-3`}
          >
            Try again
          </button>
        </div>
      ) : !loading && summary?.eventsHeld === 0 ? (
        <div className="mt-8 border-t border-[var(--border-subtle)] pt-6">
          <p className={body}>No club events were held in this range.</p>
          {range !== "all" && (
            <button
              type="button"
              onClick={() => setRange("all")}
              className={`${textLink} mt-3`}
            >
              Show all time
            </button>
          )}
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5">
            {loading || !summary ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={statCell} aria-hidden>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-8 w-14" />
                </div>
              ))
            ) : (
              <>
                <Stat title="Events held" value={summary.eventsHeld} />
                <Stat title="Check-ins" value={summary.checkIns} />
                <Stat title="Unique attendees" value={summary.uniqueAttendees} />
                <Stat
                  title="Average per event"
                  value={summary.averagePerEvent.toFixed(1)}
                />
                <Stat
                  title="Members who came"
                  value={
                    summary.activeMembers
                      ? `${Math.round((summary.activeMembersAttended / summary.activeMembers) * 100)}%`
                      : "—"
                  }
                  subtitle={
                    summary.activeMembers
                      ? `${summary.activeMembersAttended} of ${summary.activeMembers} active members`
                      : "No active members"
                  }
                />
              </>
            )}
          </dl>

          {/* Per event */}
          <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
            <h2 className={sectionTitle}>Attendance per event</h2>
            <div className="mt-6 h-64">
              {ready ? (
                <Bar
                  data={chartData}
                  options={options}
                  aria-label="Check-ins at each club event, oldest to newest"
                />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </div>

            <div className="mt-8 overflow-x-auto border-y border-[var(--border-subtle)]">
              <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
                <caption className="sr-only">
                  Club events in this range, newest first. Pick one to see its
                  attendance.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th scope="col" className={`${th} pl-0`}>
                      Event
                    </th>
                    <th scope="col" className={th}>
                      Date
                    </th>
                    <th scope="col" className={th}>
                      Location
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Check-ins
                    </th>
                    <th scope="col" className={`${th} pr-0 text-right`}>
                      Of capacity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? [1, 2, 3].map((i) => (
                        <tr key={i} className={row} aria-hidden>
                          <td className={`${td} pl-0`} colSpan={5}>
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))
                    : data?.events.map((event) => (
                        <tr key={event.id} className={row}>
                          <th
                            scope="row"
                            className={`${td} pl-0 text-left font-normal`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                onOpenEvent({ id: event.id, title: event.title })
                              }
                              className="text-left font-semibold text-[var(--text-primary)] underline decoration-transparent decoration-2 underline-offset-[5px] transition-colors hover:decoration-accent"
                            >
                              {event.title}
                            </button>
                            {event.bootcampWeek && (
                              <span className={`block ${meta}`}>
                                Bootcamp week {event.bootcampWeek}
                              </span>
                            )}
                          </th>
                          <td
                            className={`${td} whitespace-nowrap tabular-nums text-[var(--text-muted)]`}
                          >
                            {longDate(new Date(event.eventDate))}
                          </td>
                          <td className={`${td} text-[var(--text-muted)]`}>
                            {event.location || "—"}
                          </td>
                          <td
                            className={`${td} text-right tabular-nums text-[var(--text-primary)]`}
                          >
                            {event.checkIns}
                          </td>
                          <td
                            className={`${td} pr-0 text-right tabular-nums text-[var(--text-muted)]`}
                          >
                            {event.maxCheckIns
                              ? `${Math.round((event.checkIns / event.maxCheckIns) * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* People */}
          <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className={sectionTitle}>People</h2>
              <button
                type="button"
                onClick={handleExport}
                disabled={people.length === 0}
                className={btnSecondary}
              >
                <Download
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="h-4 w-4"
                />
                Export CSV
              </button>
            </div>

            <div className="mt-6 max-w-sm">
              <label htmlFor="attendance-search" className="sr-only">
                Search people
              </label>
              <input
                id="attendance-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className={`min-h-11 ${input}`}
              />
            </div>

            {!loading && (data?.people.length ?? 0) === 0 ? (
              <div className="mt-6">
                <p className={body}>
                  Nobody has checked in to a club event in this range.
                </p>
                <button
                  type="button"
                  onClick={onScan}
                  className={`${textLink} mt-3`}
                >
                  Scan passes
                </button>
              </div>
            ) : !loading && people.length === 0 ? (
              <div className="mt-6">
                <p className={body}>Nobody matches that search.</p>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className={`${textLink} mt-3`}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto border-y border-[var(--border-subtle)]">
                <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
                  <caption className="sr-only">
                    Everyone who checked in to a club event in this range.
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th scope="col" className={`${th} pl-0`}>
                        Name
                      </th>
                      <th scope="col" className={th}>
                        Email
                      </th>
                      <th scope="col" className={th}>
                        Member
                      </th>
                      {sortHeader("count", "Events")}
                      {sortHeader("last", "Last attended")}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? [1, 2, 3, 4].map((i) => (
                          <tr key={i} className={row} aria-hidden>
                            <td className={`${td} pl-0`} colSpan={5}>
                              <Skeleton className="h-5 w-full" />
                            </td>
                          </tr>
                        ))
                      : people.map((person) => (
                          <tr key={person.userId} className={row}>
                            <th
                              scope="row"
                              className={`${td} pl-0 text-left font-semibold text-[var(--text-primary)]`}
                            >
                              {person.name}
                            </th>
                            <td className={`${td} text-[var(--text-muted)]`}>
                              {person.email}
                            </td>
                            <td className={td}>
                              <span
                                className={status(
                                  person.isMember ? "success" : "neutral",
                                )}
                              >
                                {person.isMember ? "Member" : "Not a member"}
                              </span>
                            </td>
                            <td
                              className={`${td} text-right tabular-nums text-[var(--text-primary)]`}
                            >
                              {person.eventsAttended}
                            </td>
                            <td
                              className={`${td} pr-0 text-right whitespace-nowrap tabular-nums text-[var(--text-muted)]`}
                            >
                              {person.lastAttended
                                ? longDate(new Date(person.lastAttended))
                                : "—"}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
