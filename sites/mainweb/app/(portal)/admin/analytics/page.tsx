"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import {
  btnSecondary,
  itemTitle,
  label,
  meta,
  pageDek,
  sectionTitle,
} from "@/components/portal/ui";

const Line = dynamic(() => import("react-chartjs-2").then((m) => m.Line), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const Bar = dynamic(() => import("react-chartjs-2").then((m) => m.Bar), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

function ChartSkeleton() {
  return (
    <div
      className="h-full w-full rounded-[var(--radius-md)] bg-[var(--bg-secondary)]"
      aria-hidden
    />
  );
}

/** Admin pages carry a smaller headline than member pages. */
const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]";

const th = "px-4 py-2.5 text-[13px] font-medium text-[var(--text-subtle)]";

/**
 * Canvas cannot read a CSS variable, so the portal tokens are resolved to
 * literal colours here. Members draw in the accent, bootcamp in ink with a
 * dash, so the two lines differ by more than hue.
 */
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

/** `2026-fall` is how it is stored; nobody should have to read it that way. */
function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

/** `2026-01` becomes `Jan 26`. Twelve of these have to fit one axis. */
function monthLabel(month: string) {
  const [year, index] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(index) - 1, 1));
  const name = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} ${year?.slice(2)}`;
}

const statCell =
  "sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 sm:first:border-l-0 sm:first:pl-0";

interface StatProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

function Stat({ title, value, subtitle }: StatProps) {
  return (
    <div className={statCell}>
      <dt className={label}>{title}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums text-[var(--text-primary)] md:text-[36px]">
        {value}
      </dd>
      {subtitle && <dd className={`mt-1.5 ${meta}`}>{subtitle}</dd>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className={statCell} aria-hidden>
      <div className="h-4 w-24 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]" />
      <div className="mt-2 h-9 w-16 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]" />
    </div>
  );
}

/** A short line in the series colour, dashed for the dashed series. */
function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-5 border-t-2 ${dashed ? "border-dashed" : "border-solid"}`}
      style={{ borderColor: color }}
    />
  );
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartsReady, setChartsReady] = useState(false);
  const [tokens, setTokens] = useState<ChartTokens | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { data: stats, isLoading } = trpc.admin.analyticsOverview.useQuery(
    undefined,
    // Matched to the server's cache entry. Polling faster only produced
    // repeated cache hits and a request per tab per 5s for numbers that move
    // on a much slower clock.
    { enabled: !!session, refetchInterval: 15000 },
  );

  // Growth moves on a monthly clock, so it is fetched once rather than polled.
  const growth = trpc.admin.growth.useQuery(undefined, { enabled: !!session });

  useEffect(() => {
    import("chart.js").then(
      ({
        Chart,
        LineElement,
        PointElement,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
      }) => {
        Chart.register(
          LineElement,
          PointElement,
          BarElement,
          CategoryScale,
          LinearScale,
          Tooltip,
        );
        setChartsReady(true);
      },
    );
  }, []);

  // next-themes swaps the class on <html> in its own effect, which runs after
  // this one, so the tokens are read a frame later when the new theme is live.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (containerRef.current) setTokens(readTokens(containerRef.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  const options = useMemo(() => {
    if (!tokens) return undefined;
    const font = { family: tokens.font, size: 12 };
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        // The legend is rendered as HTML above the chart, where it can carry a
        // line style as well as a colour.
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
  }, [tokens]);

  if (status === "unauthenticated") {
    router.push(loginHref());
    return null;
  }

  const months = growth.data?.months ?? [];
  const terms = growth.data?.terms ?? [];
  const totals = growth.data?.totals;
  const ready = chartsReady && !!tokens && !growth.isPending;

  const growthData = {
    labels: months.map((row) => monthLabel(row.month)),
    datasets: [
      {
        label: "Members",
        data: months.map((row) => row.members),
        borderColor: tokens?.accent,
        backgroundColor: tokens?.accent,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: "circle" as const,
        tension: 0.25,
      },
      {
        label: "Bootcamp members",
        data: months.map((row) => row.bootcampMembers),
        borderColor: tokens?.ink,
        backgroundColor: tokens?.ink,
        borderWidth: 2,
        // Dash and marker shape, not colour alone, separate the two lines.
        borderDash: [6, 4],
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: "rectRot" as const,
        tension: 0.25,
      },
    ],
  };

  const joinedData = {
    labels: months.map((row) => monthLabel(row.month)),
    datasets: [
      {
        label: "Joined",
        data: months.map((row) => row.joined),
        backgroundColor: tokens?.accent,
        borderRadius: 2,
        maxBarThickness: 56,
        borderSkipped: "bottom" as const,
      },
    ],
  };

  const termData = {
    labels: terms.map((row) => termLabel(row.term)),
    datasets: [
      {
        label: "Enrolled",
        data: terms.map((row) => row.enrolled),
        // Muted, not ink: a full-strength ink bar is a near-white slab in
        // the night edition.
        backgroundColor: tokens?.muted,
        borderRadius: 2,
        // One term would otherwise stretch to the whole chart width.
        maxBarThickness: 56,
        borderSkipped: "bottom" as const,
      },
    ],
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 md:px-12 md:py-14"
    >
      <header>
        <h1 className={adminTitle}>Club growth</h1>
        <p className={pageDek}>
          Membership, bootcamp enrolment, and turnout across every event and
          hackathon.
        </p>
      </header>

      {/* Membership */}
      <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={sectionTitle}>Membership</h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {growth.isPending ? (
            [1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <Stat
                title="Members"
                value={totals?.members ?? 0}
                subtitle="All time"
              />
              <Stat
                title="Active now"
                value={totals?.activeMembers ?? 0}
                subtitle="Memberships not ended"
              />
              <Stat
                title="Bootcamp this term"
                value={totals?.bootcampThisTerm ?? 0}
                subtitle={totals ? termLabel(totals.currentTerm) : undefined}
              />
              <Stat
                title="Bootcamp all time"
                value={totals?.bootcampAllTime ?? 0}
                subtitle={
                  totals?.members
                    ? `${Math.round((totals.bootcampAllTime / totals.members) * 100)}% of members`
                    : undefined
                }
              />
            </>
          )}
        </dl>

        {/* Growth */}
        <div className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className={itemTitle}>Members and bootcamp, running total</h3>
            {/* Identity never rests on colour alone. */}
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <li className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <Swatch color="var(--accent)" />
                Members
              </li>
              <li className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <Swatch color="var(--text-primary)" dashed />
                Bootcamp members
              </li>
            </ul>
          </div>
          <div className="h-72">
            {ready ? (
              <Line
                data={growthData}
                options={options}
                aria-label="Running total of members and of bootcamp members, by month"
              />
            ) : (
              <ChartSkeleton />
            )}
          </div>
          <p className={`mt-3 max-w-2xl ${meta}`}>
            A bootcamp member counts from the month they joined the club, not
            the month they bought the add-on. Only the term they bought is
            recorded.
          </p>
        </div>

        <div className="mt-10 grid gap-10 border-t border-[var(--border-subtle)] pt-6 lg:grid-cols-2">
          <div>
            <h3 className={`mb-4 ${itemTitle}`}>New members per month</h3>
            <div className="h-64">
              {ready ? (
                <Bar
                  data={joinedData}
                  options={options}
                  aria-label="Members who joined, by month"
                />
              ) : (
                <ChartSkeleton />
              )}
            </div>
          </div>

          <div>
            <h3 className={`mb-4 ${itemTitle}`}>Bootcamp enrolment per term</h3>
            <div className="h-64">
              {!ready ? (
                <ChartSkeleton />
              ) : terms.length === 0 ? (
                <p className="flex h-full items-center justify-center text-[15px] text-[var(--text-muted)]">
                  Enrolment per term appears here once someone joins a bootcamp.
                </p>
              ) : (
                <Bar
                  data={termData}
                  options={options}
                  aria-label="Bootcamp enrolment, by term"
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className={btnSecondary}
          >
            {showTable ? "Hide the numbers" : "Show the numbers"}
          </button>

          {showTable && (
            <div className="mt-4 overflow-x-auto border-y border-[var(--border-subtle)]">
              <table className="w-full border-collapse text-[15px]">
                <caption className="sr-only">
                  The same twelve months as the charts above, as numbers.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left">
                    <th scope="col" className={`${th} pl-0`}>
                      Month
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Joined
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Members
                    </th>
                    <th scope="col" className={`${th} pr-0 text-right`}>
                      Bootcamp members
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row) => (
                    <tr
                      key={row.month}
                      className="border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--bg-secondary)]"
                    >
                      <th
                        scope="row"
                        className="py-2.5 pr-4 text-left font-normal text-[var(--text-primary)]"
                      >
                        {monthLabel(row.month)}
                      </th>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                        {row.joined}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                        {row.members}
                      </td>
                      <td className="py-2.5 pl-4 text-right tabular-nums text-[var(--text-primary)]">
                        {row.bootcampMembers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Events and hackathons */}
      <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={sectionTitle}>Events and hackathons</h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <Stat
                title="Participants"
                value={stats?.totalParticipants || 0}
                subtitle="Registered across all events"
              />
              <Stat
                title="Events hosted"
                value={stats?.totalEvents || 0}
                subtitle="Competitions and gatherings"
              />
              <Stat
                title="Hackathons"
                value={stats?.totalHackathons || 0}
                subtitle="Active and upcoming"
              />
              <Stat
                title="Check-ins today"
                value={stats?.checkinsToday || 0}
                subtitle="Scanned by QR code"
              />
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
