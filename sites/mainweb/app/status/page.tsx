import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import {
  DayTable,
  HoursTable,
  LatencyChart,
  RequestsChart,
  RequestsLegend,
  UptimeLegend,
  UptimeStrip,
} from "@/components/status/charts";
import { BUCKET_MS, uptimePercent  } from "@/lib/status";
import type {Level} from "@/lib/status";
import {
  externalState,
  foldProbe,
  probeDays,
  uptimeWindows,
} from "@/lib/uptime";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import AutoRefresh from "./AutoRefresh";
import { loadStatus } from "./load";
import { loadUptime } from "./uptime";

/**
 * Uptime and latency from real traffic.
 *
 * Read on the server, straight from Postgres, like /events: the tRPC provider
 * is mounted only inside the (portal) route group. A database that is asleep
 * renders a Down headline and empty charts instead of failing the page.
 * Aggregates only; nothing here is about a person.
 */
export const revalidate = 300;

const LEVELS: Record<
  Level,
  { label: string; color: string; Icon: typeof CircleCheck }
> = {
  operational: { label: "Operational", color: "#00a8a8", Icon: CircleCheck },
  degraded: { label: "Degraded", color: "#e0a030", Icon: TriangleAlert },
  down: { label: "Down", color: "#e5484d", Icon: CircleX },
};

const pct = (value: number | null) =>
  value === null ? "No data" : `${value.toFixed(value >= 99.995 ? 0 : 2)}%`;

const SHORT_SHA = 7;

const deployedAt = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t)
    ? "at an unknown time"
    : new Date(t).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      });
};

const ROLLOUT_TEXT: Record<string, string> = {
  success: "rollout succeeded",
  failure: "rollout failed",
  cancelled: "rollout cancelled",
  timed_out: "rollout timed out",
  in_progress: "rollout in progress",
  queued: "rollout queued",
  none: "no rollout result",
};

const checkedAt = (t: number) =>
  new Date(t).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

export default async function StatusPage() {
  const [data, uptime] = await Promise.all([loadStatus(), loadUptime()]);
  const outside = uptime ? externalState(uptime, data.generatedAt) : null;
  const { level, reason } = foldProbe(data.summary, outside);
  const { label, color, Icon } = LEVELS[level];
  const lastT = data.generatedAt - (data.generatedAt % BUCKET_MS);
  const uptime90 = uptimePercent(data.days);
  const uptime30 = uptimePercent(data.days.slice(-30));
  const windows = uptime ? uptimeWindows(uptime, data.generatedAt) : null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <AutoRefresh />
      <Navbar screen_width={1024} page="status" />
      <main className="pt-20">
        <Section className="py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-bold tracking-tighter sm:text-6xl mb-8">
              Status
            </h1>

            <div className="flex items-center gap-4" aria-live="polite">
              <Icon size={44} strokeWidth={2.25} color={color} aria-hidden />
              <p className="text-4xl sm:text-5xl font-black tracking-tight">
                {label}
              </p>
            </div>
            <p className="mt-3 text-gray-300">{reason}</p>
            <p className="mt-1 text-sm text-gray-500">
              App serving. Checked {checkedAt(data.live.checkedAt)}, this page
              reloads itself every five minutes while open.
            </p>
            {outside && (
              <p className="mt-1 text-sm text-gray-500">
                {outside.kind === "stale"
                  ? outside.last
                    ? `The outside check is stale. Its last result was at ${checkedAt(outside.last.t)}, so it says nothing about the site right now.`
                    : "The outside check has no results yet."
                  : `Checked from outside every 5 minutes. Last check ${checkedAt(outside.last.t)}, ${outside.last.ok ? `answered in ${outside.last.ms} ms` : "no answer"}.`}
              </p>
            )}
            {uptime?.deploy && (
              <p className="mt-1 text-sm text-gray-500">
                Latest deploy{" "}
                <a
                  href={`https://github.com/DataScience-GT/query/commit/${uptime.deploy.sha}`}
                  className="font-mono text-gray-300 hover:text-white"
                >
                  {uptime.deploy.sha.slice(0, SHORT_SHA)}
                </a>
                , committed {deployedAt(uptime.deploy.committedAt)};{" "}
                {ROLLOUT_TEXT[uptime.deploy.rollout] ?? uptime.deploy.rollout}.
              </p>
            )}

            <section className="mt-14" aria-labelledby="uptime-heading">
              <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 mb-5">
                <h2 id="uptime-heading" className="text-xl font-bold">
                  Uptime, last 90 days
                </h2>
                <p className="flex gap-8 tabular-nums">
                  <span>
                    <span className="block text-3xl font-black leading-none">
                      {pct(uptime90)}
                    </span>
                    <span className="mt-1 block text-xs text-gray-400">
                      90 days
                    </span>
                  </span>
                  <span>
                    <span className="block text-3xl font-black leading-none">
                      {pct(uptime30)}
                    </span>
                    <span className="mt-1 block text-xs text-gray-400">
                      30 days
                    </span>
                  </span>
                </p>
              </div>
              <UptimeStrip days={data.days} />
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>90 days ago</span>
                <span>Today</span>
              </div>
              <div className="mt-4">
                <UptimeLegend />
              </div>
              <DayTable days={data.days} />
            </section>

            {uptime && windows && (
              <section className="mt-14" aria-labelledby="outside-heading">
                <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 mb-5">
                  <div>
                    <h2 id="outside-heading" className="text-xl font-bold">
                      Outside check, last 90 days
                    </h2>
                    <p className="mt-1 text-sm text-gray-400">
                      A probe outside our network requests the site every five
                      minutes. It never touches the database.
                    </p>
                  </div>
                  <p className="flex gap-8 tabular-nums">
                    {(
                      [
                        [windows.d90, "90 days"],
                        [windows.d30, "30 days"],
                        [windows.h24, "24 hours"],
                      ] as const
                    ).map(([value, name]) => (
                      <span key={name}>
                        <span className="block text-3xl font-black leading-none">
                          {pct(value)}
                        </span>
                        <span className="mt-1 block text-xs text-gray-400">
                          {name}
                        </span>
                      </span>
                    ))}
                  </p>
                </div>
                <UptimeStrip
                  days={probeDays(uptime, data.generatedAt)}
                  probe
                />
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>90 days ago</span>
                  <span>Today</span>
                </div>
                <div className="mt-4">
                  <UptimeLegend />
                </div>
              </section>
            )}

            <section className="mt-14" aria-labelledby="latency-heading">
              <h2 id="latency-heading" className="text-xl font-bold">
                Response time, last 24 hours
              </h2>
              <p className="mt-1 mb-4 text-sm text-gray-400">
                95th percentile in milliseconds per 5 minutes. When several
                servers were running, the slowest one is shown.
              </p>
              <LatencyChart hours={data.hours} lastT={lastT} />
            </section>

            <section className="mt-14" aria-labelledby="traffic-heading">
              <h2 id="traffic-heading" className="text-xl font-bold">
                Requests and errors, last 24 hours
              </h2>
              <p className="mt-1 mb-4 text-sm text-gray-400">
                API calls per 5 minutes. Errors are server failures only.
              </p>
              <RequestsChart hours={data.hours} lastT={lastT} />
              <div className="mt-3">
                <RequestsLegend />
              </div>
              <HoursTable hours={data.hours} lastT={lastT} />
            </section>

            <p className="mt-14 max-w-2xl border-t border-white/5 pt-6 text-sm text-gray-500 leading-relaxed">
              {data.historyOk
                ? "The charts above come from real visits. A quiet hour shows as no data, not as down. A five-minute window counts as up when the database answered and fewer than 5% of requests failed on our side. Days are UTC; times are Eastern."
                : "The history could not be read just now, so the charts are empty. This is a limit of the status page and says nothing about earlier uptime."}
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
