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
import { BUCKET_MS, uptimePercent } from "@/lib/status";
import type { Level } from "@/lib/status";
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
            <h1 className="mb-3 text-lg font-semibold text-gray-300">Status</h1>

            <div
              className="flex items-center gap-4 sm:gap-6"
              aria-live="polite"
            >
              <Icon
                strokeWidth={2.25}
                color={color}
                className="size-12 shrink-0 sm:size-20"
                aria-hidden
              />
              <p
                className="text-5xl font-black tracking-tighter sm:text-8xl"
                style={{ color }}
              >
                {label}
              </p>
            </div>
            {level !== "operational" && (
              <p className="mt-3 text-gray-300">{reason}</p>
            )}

            <section className="mt-20" aria-labelledby="uptime-heading">
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
              <div className="mt-2 flex justify-between text-xs text-gray-400">
                <span>90 days ago</span>
                <span>Today</span>
              </div>
              <div className="mt-4">
                <UptimeLegend />
              </div>
              <DayTable days={data.days} />
            </section>

            {uptime && windows && (
              <section className="mt-20" aria-labelledby="outside-heading">
                <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 mb-5">
                  <h2 id="outside-heading" className="text-xl font-bold">
                    Outside check, last 90 days
                  </h2>
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
                <UptimeStrip days={probeDays(uptime, data.generatedAt)} probe />
                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>90 days ago</span>
                  <span>Today</span>
                </div>
              </section>
            )}

            <section className="mt-20" aria-labelledby="latency-heading">
              <h2 id="latency-heading" className="mb-4 text-xl font-bold">
                Response time, last 24 hours
              </h2>
              <LatencyChart hours={data.hours} lastT={lastT} />
            </section>

            <section className="mt-20" aria-labelledby="traffic-heading">
              <h2 id="traffic-heading" className="mb-4 text-xl font-bold">
                Requests and errors, last 24 hours
              </h2>
              <RequestsChart hours={data.hours} lastT={lastT} />
              <div className="mt-3">
                <RequestsLegend />
              </div>
              <HoursTable hours={data.hours} lastT={lastT} />
            </section>

            {!data.historyOk && (
              <p className="mt-14 max-w-2xl border-t border-white/5 pt-6 text-sm text-gray-500 leading-relaxed">
                The history could not be read just now, so the charts are empty.
                This is a limit of the status page and says nothing about
                earlier uptime.
              </p>
            )}
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
