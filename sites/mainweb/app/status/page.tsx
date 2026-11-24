import type { Metadata } from "next";
import PublicPage, { SectionHeading } from "@/components/PublicPage";
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

const DESCRIPTION =
  "Live uptime and response times for the DS@GT website, read from real traffic and an outside check.";

export const metadata: Metadata = {
  title: "Status",
  description: DESCRIPTION,
  openGraph: { title: "Status | DS@GT", description: DESCRIPTION },
};

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
  degraded: { label: "Degraded", color: "#d1d5db", Icon: TriangleAlert },
  down: { label: "Down", color: "#f87171", Icon: CircleX },
};

const pct = (value: number | null) =>
  value === null ? "No data" : `${value.toFixed(value >= 99.995 ? 0 : 2)}%`;

const sinceLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function StatusPage() {
  const [data, uptime] = await Promise.all([loadStatus(), loadUptime()]);
  const outside = uptime ? externalState(uptime, data.generatedAt) : null;
  const { level, reason } = foldProbe(data.summary, outside);
  const { label, color, Icon } = LEVELS[level];
  const lastT = data.generatedAt - (data.generatedAt % BUCKET_MS);
  const uptime90 = uptimePercent(data.days);
  const uptime30 = uptimePercent(data.days.slice(-30));
  const firstDay = data.days.find((d) => d.minutesWithData > 0)?.day;
  const windows = uptime ? uptimeWindows(uptime, data.generatedAt) : null;

  return (
    <PublicPage
      eyebrow="Status"
      title="System status"
      lede="Uptime and response times for this site, read from real traffic."
      action={
        <div aria-live="polite" className="space-y-3">
          <p
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-sm font-semibold"
            style={{ color }}
          >
            <Icon strokeWidth={2.25} className="size-4 shrink-0" aria-hidden />
            {label}
          </p>
          {level !== "operational" && (
            <p className="text-neutral-300">{reason}</p>
          )}
        </div>
      }
    >
      <AutoRefresh />
      <div className="max-w-4xl space-y-24">
        <section aria-labelledby="uptime-heading">
          <SectionHeading id="uptime-heading">
            Uptime, last 90 days
          </SectionHeading>
          <p className="mb-5 flex gap-8 tabular-nums">
            <span>
              <span className="block text-3xl leading-none font-black text-white">
                {pct(uptime90)}
              </span>
              <span className="mt-1 block text-xs text-neutral-400">
                {firstDay ? `90 days, since ${sinceLabel(firstDay)}` : "90 days"}
              </span>
            </span>
            <span>
              <span className="block text-3xl leading-none font-black text-white">
                {pct(uptime30)}
              </span>
              <span className="mt-1 block text-xs text-neutral-400">30 days</span>
            </span>
          </p>
          <UptimeStrip days={data.days} />
          <div className="mt-2 flex justify-between text-xs text-neutral-400">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
          <div className="mt-4">
            <UptimeLegend />
          </div>
          <DayTable days={data.days} />
        </section>

        {uptime && windows && (
          <section aria-labelledby="outside-heading">
            <SectionHeading id="outside-heading">
              Outside check, last 90 days
            </SectionHeading>
            <p className="mb-5 flex gap-8 tabular-nums">
              {(
                [
                  [windows.d90, "90 days"],
                  [windows.d30, "30 days"],
                  [windows.h24, "24 hours"],
                ] as const
              ).map(([value, name]) => (
                <span key={name}>
                  <span className="block text-3xl leading-none font-black text-white">
                    {pct(value)}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-400">
                    {name}
                  </span>
                </span>
              ))}
            </p>
            <UptimeStrip days={probeDays(uptime, data.generatedAt)} probe />
            <div className="mt-2 flex justify-between text-xs text-neutral-400">
              <span>90 days ago</span>
              <span>Today</span>
            </div>
          </section>
        )}

        <section aria-labelledby="latency-heading">
          <SectionHeading id="latency-heading">
            Response time, last 24 hours
          </SectionHeading>
          <LatencyChart hours={data.hours} lastT={lastT} />
        </section>

        <section aria-labelledby="traffic-heading">
          <SectionHeading id="traffic-heading">
            Requests and errors, last 24 hours
          </SectionHeading>
          <RequestsChart hours={data.hours} lastT={lastT} />
          <div className="mt-3">
            <RequestsLegend />
          </div>
          <HoursTable hours={data.hours} lastT={lastT} />
        </section>

        {!data.historyOk && (
          <p className="max-w-2xl border-t border-white/5 pt-6 text-sm leading-relaxed text-neutral-400">
            The history could not be read just now, so the charts are empty.
            This is a limit of the status page and says nothing about earlier
            uptime.
          </p>
        )}
      </div>
    </PublicPage>
  );
}
