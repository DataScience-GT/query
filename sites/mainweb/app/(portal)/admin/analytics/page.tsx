"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import {
  Users,
  Trophy,
  Calendar,
  TrendingUp,
  QrCode,
  GraduationCap,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
    <div className="h-full w-full animate-pulse bg-white/[0.03]" aria-hidden />
  );
}

/**
 * Two hues, checked against the surface they sit on rather than picked by eye:
 * teal against violet clears the colour-blind separation floor in both themes,
 * and each theme's teal is the one that stays a colour instead of reading grey.
 */
const PALETTE = {
  dark: { members: "#00a8a8", bootcamp: "#8b5cf6" },
  light: { members: "#008b80", bootcamp: "#7c3aed" },
};

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

interface StatCardProps {
  icon: LucideIcon;
  title: string;
  value: string | number;
  subtitle?: string;
}

function StatCard({ icon: Icon, title, value, subtitle }: StatCardProps) {
  return (
    <LiquidGlass className="p-6 relative overflow-hidden group hover:border-white/20 transition-ui duration-300">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-accent/[0.02] via-transparent to-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-accent/5 rounded-sm blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex items-center gap-4">
        {/* Icon container with gradient */}
        <div className="group/icon relative flex h-14 w-14 items-center justify-center rounded-none bg-gradient-to-br from-accent/20 to-accent/10 text-[var(--text-primary)] border border-[var(--border-subtle)] group-hover/icon:scale-110 transition-transform duration-300">
          <div className="absolute inset-0 pointer-events-none rounded-none bg-gradient-to-br from-accent/30 to-accent/20 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300" />
          <Icon className="h-7 w-7 relative z-10 group-hover/icon:text-[var(--text-primary)] transition-colors" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-muted font-medium">{title}</p>
          <p className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
            {value}
          </p>
          {subtitle && (
            <span className="text-xs text-text-muted font-mono">{subtitle}</span>
          )}
          {/* Decorative accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>
    </LiquidGlass>
  );
}

function CardSkeleton() {
  return (
    <LiquidGlass className="p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-14 w-14 rounded-none bg-white/5" />
        <div className="h-4 w-24 bg-white/5 rounded" />
        <div className="h-8 w-16 bg-white/5 rounded" />
      </div>
    </LiquidGlass>
  );
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [chartsReady, setChartsReady] = useState(false);
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

  // Canvas cannot read a CSS variable, so the theme is resolved here instead.
  const light = resolvedTheme === "light";
  const colors = PALETTE[light ? "light" : "dark"];
  const ink = light ? "#71717a" : "#707070";
  const grid = light ? "#e4e4e7" : "#1f1f1f";

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        // The legend is rendered as HTML above the chart, where it can carry a
        // shape as well as a colour.
        legend: { display: false },
        tooltip: {
          backgroundColor: light ? "#ffffff" : "#121212",
          borderColor: grid,
          borderWidth: 1,
          titleColor: light ? "#09090b" : "#ededed",
          bodyColor: ink,
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: grid },
          ticks: { color: ink, font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: ink, font: { size: 11 }, precision: 0 },
        },
      },
    }),
    [light, grid, ink],
  );

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const months = growth.data?.months ?? [];
  const terms = growth.data?.terms ?? [];
  const totals = growth.data?.totals;
  const ready = chartsReady && !growth.isPending;

  const growthData = {
    labels: months.map((row) => monthLabel(row.month)),
    datasets: [
      {
        label: "Members",
        data: months.map((row) => row.members),
        borderColor: colors.members,
        backgroundColor: colors.members,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointStyle: "circle" as const,
        tension: 0.25,
      },
      {
        label: "Bootcamp members",
        data: months.map((row) => row.bootcampMembers),
        borderColor: colors.bootcamp,
        backgroundColor: colors.bootcamp,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        // Marker shape, not colour alone, separates the two lines.
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
        backgroundColor: colors.members,
        borderRadius: 4,
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
        backgroundColor: colors.bootcamp,
        borderRadius: 4,
        borderSkipped: "bottom" as const,
      },
    ],
  };

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Ambient Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-emerald-900/12 to-purple-900/10 blur-[350px] rounded-sm" />
          <div className="absolute bottom-[-12%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-emerald-900/10 to-indigo-900/10 blur-[300px] rounded-sm" />
        </div>

        {/* Page Header - Enhanced */}
        <div className="relative mb-8 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/8 via-emerald-900/10 to-transparent rounded-none overflow-hidden group hover:border-accent/40 transition-ui duration-500">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <QrCode className="w-3 h-3" /> Operations
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-emerald-100 to-gray-400 transition-ui duration-500">
            Analytics <span className="text-accent italic">Dashboard</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            Membership growth, bootcamp enrolment, and turnout across every
            event and hackathon.
          </p>
        </div>

        {/* Membership */}
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-subtle)]">
          Membership
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {growth.isPending ? (
            [1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={Users}
                title="Members"
                value={totals?.members ?? 0}
                subtitle="all time"
              />
              <StatCard
                icon={UserCheck}
                title="Active Now"
                value={totals?.activeMembers ?? 0}
                subtitle="memberships not ended"
              />
              <StatCard
                icon={GraduationCap}
                title="Bootcamp This Term"
                value={totals?.bootcampThisTerm ?? 0}
                subtitle={totals ? termLabel(totals.currentTerm) : undefined}
              />
              <StatCard
                icon={TrendingUp}
                title="Bootcamp All Time"
                value={totals?.bootcampAllTime ?? 0}
                subtitle={
                  totals?.members
                    ? `${Math.round((totals.bootcampAllTime / totals.members) * 100)}% of members`
                    : undefined
                }
              />
            </>
          )}
        </div>

        {/* Growth */}
        <LiquidGlass className="p-6 mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Members and bootcamp, running total
            </h2>
            {/* Identity never rests on colour alone. */}
            <ul className="flex items-center gap-4">
              <li className="flex items-center gap-2 font-mono text-xs text-[var(--text-muted)]">
                <span
                  aria-hidden
                  className="h-2 w-4"
                  style={{ backgroundColor: colors.members }}
                />
                Members
              </li>
              <li className="flex items-center gap-2 font-mono text-xs text-[var(--text-muted)]">
                <span
                  aria-hidden
                  className="h-2 w-4 rotate-45"
                  style={{ backgroundColor: colors.bootcamp }}
                />
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
          <p className="mt-3 text-xs text-[var(--text-subtle)]">
            A bootcamp member counts from the month they joined the club, not
            the month they bought the add-on — only the term they bought is
            recorded.
          </p>
        </LiquidGlass>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <LiquidGlass className="p-6">
            <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              New members per month
            </h2>
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
          </LiquidGlass>

          <LiquidGlass className="p-6">
            <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Bootcamp enrolment per term
            </h2>
            <div className="h-64">
              {!ready ? (
                <ChartSkeleton />
              ) : terms.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  Nobody has enrolled in a bootcamp yet.
                </p>
              ) : (
                <Bar
                  data={termData}
                  options={options}
                  aria-label="Bootcamp enrolment, by term"
                />
              )}
            </div>
          </LiquidGlass>
        </div>

        <div className="mb-10">
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="border border-[var(--border-subtle)] bg-white/5 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-white/10"
          >
            {showTable ? "Hide the numbers" : "Show the numbers"}
          </button>

          {showTable && (
            <div className="mt-4 overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  The same twelve months as the charts above, as numbers.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-white/5 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                    <th scope="col" className="px-4 py-3">
                      Month
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Joined
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Members
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Bootcamp members
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row) => (
                    <tr
                      key={row.month}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 text-left font-normal text-[var(--text-primary)]"
                      >
                        {monthLabel(row.month)}
                      </th>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.joined}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.members}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.bootcampMembers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Events and hackathons */}
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-subtle)]">
          Events and hackathons
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={Users}
                title="Total Participants"
                value={stats?.totalParticipants || 0}
                subtitle="registered across all events"
              />
              <StatCard
                icon={Trophy}
                title="Events Hosted"
                value={stats?.totalEvents || 0}
                subtitle="competitions and gatherings"
              />
              <StatCard
                icon={Calendar}
                title="Hackathons"
                value={stats?.totalHackathons || 0}
                subtitle="active and upcoming"
              />
              <StatCard
                icon={QrCode}
                title="Check-ins Today"
                value={stats?.checkinsToday || 0}
                subtitle="scanned via QR codes"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
