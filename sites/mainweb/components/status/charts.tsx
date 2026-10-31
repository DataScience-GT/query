"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { uptimePercent } from "@/lib/status";
import type { Bucket, Day } from "@/lib/status";

// Hand-built SVG. The chart width is measured, not scaled from a viewBox, so
// axis text stays 11px on a 390px phone instead of shrinking with the plot.

export const COLORS = {
  accent: "#00a8a8",
  good: "#00a8a8",
  warn: "#e0a030",
  bad: "#e5484d",
  none: "#2b2f33",
  surface: "#050505",
  grid: "rgba(255,255,255,0.08)",
  text: "#9ca3af",
} as const;

const TIME_ZONE = "America/New_York";

const hourLabel = (t: number) =>
  new Date(t).toLocaleString("en-US", {
    hour: "numeric",
    timeZone: TIME_ZONE,
  });

const stampLabel = (t: number) =>
  new Date(t).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const compact = (n: number) =>
  n >= 1000 ? `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

/** Round a maximum up to 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * pow) return step * pow;
  }
  return 10 * pow;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Tip = { x: number; rows: ReactNode; title: string } | null;

function Tooltip({
  tip,
  width,
  above = false,
}: {
  tip: Tip;
  width: number;
  above?: boolean;
}) {
  if (!tip) return null;
  const flip = tip.x > width / 2;
  return (
    <div
      role="status"
      className={`pointer-events-none absolute z-10 w-[170px] ${above ? "bottom-full mb-2" : "top-0"} rounded-md border border-white/10 bg-[#0e0e0e] px-3 py-2 text-xs shadow-lg`}
      style={{
        left: flip
          ? Math.max(0, tip.x - 178)
          : Math.min(width - 170, tip.x + 8),
      }}
    >
      <div className="mb-1 text-gray-400">{tip.title}</div>
      {tip.rows}
    </div>
  );
}

function TipRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 tabular-nums">
      <span className="flex items-center gap-1.5 text-gray-400">
        {color && (
          <span
            className="inline-block h-0.5 w-3"
            style={{ background: color, height: 3 }}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const dayColor = (day: Day) => {
  const pct = uptimePercent([day]);
  if (pct === null) return COLORS.none;
  if (pct >= 99) return COLORS.good;
  if (pct >= 95) return COLORS.warn;
  return COLORS.bad;
};

const pctText = (pct: number | null) =>
  pct === null ? "No data" : `${pct.toFixed(pct >= 99.995 ? 0 : 2)}%`;

/**
 * 90 bars, one per day, coloured by that day's uptime. With `probe`, the days
 * come from the outside check, where requests are probes and errors are failed
 * probes, and the tooltip says so.
 */
export function UptimeStrip({
  days,
  probe = false,
}: {
  days: Day[];
  probe?: boolean;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 64;
  const slot = width / days.length;
  const gap = slot >= 6 ? 2 : 1;
  const barW = Math.min(24, slot - gap);

  const day = active === null ? null : (days[active] ?? null);
  const pct = day ? uptimePercent([day]) : null;
  const tip: Tip =
    day && active !== null
      ? {
          x: active * slot + slot / 2,
          title: dayLabel(day.day),
          rows:
            pct === null ? (
              <div className="text-gray-300">
                {probe
                  ? "No data. The outside check had no results this day."
                  : "No data. Nobody used the site, or it was not sampled."}
              </div>
            ) : probe ? (
              <>
                <TipRow label="Uptime" value={pctText(pct)} />
                <TipRow
                  label="Checks"
                  value={day.requests.toLocaleString("en-US")}
                />
                <TipRow
                  label="Failed"
                  value={day.errors.toLocaleString("en-US")}
                />
                <TipRow label="Slowest" value={`${day.worstP95Ms} ms`} />
              </>
            ) : (
              <>
                <TipRow label="Uptime" value={pctText(pct)} />
                <TipRow
                  label="Requests"
                  value={day.requests.toLocaleString("en-US")}
                />
                <TipRow
                  label="Server errors"
                  value={day.errors.toLocaleString("en-US")}
                />
                <TipRow label="Worst p95" value={`${day.worstP95Ms} ms`} />
                <TipRow
                  label="Database down"
                  value={`${day.minutesDbDown} min`}
                />
              </>
            ),
        }
      : null;

  return (
    <div
      ref={ref}
      className="relative"
      tabIndex={0}
      role="group"
      aria-label={`${probe ? "Daily outside-check uptime" : "Daily uptime"} for the last 90 days. Use the left and right arrow keys to read each day.`}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setActive((i) => Math.max(0, (i ?? days.length) - 1));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setActive((i) => Math.min(days.length - 1, (i ?? -1) + 1));
        }
      }}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
    >
      <Tooltip tip={tip} width={width} above />
      <svg width={width} height={height} className="block" aria-hidden>
        {days.map((d, i) => (
          <g key={d.day}>
            <rect
              x={i * slot + (slot - barW) / 2}
              y={0}
              width={barW}
              height={height}
              rx={Math.min(2, barW / 2)}
              fill={dayColor(d)}
              opacity={active === null || active === i ? 1 : 0.55}
            />
            <rect
              x={i * slot}
              y={0}
              width={slot}
              height={height}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** The same data as the strip, for anyone who cannot use colour or a pointer. */
export function DayTable({ days }: { days: Day[] }) {
  const shown = days.filter((d) => d.minutesWithData > 0).reverse();
  return (
    <details className="mt-4 text-sm text-gray-400">
      <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">
        View the days as a table
      </summary>
      <div className="mt-3 max-h-72 overflow-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="sticky top-0 bg-[#050505] text-gray-400">
            <tr>
              <th className="py-1 pr-3 font-medium">Day (UTC)</th>
              <th className="py-1 pr-3 font-medium">Uptime</th>
              <th className="py-1 pr-3 font-medium">Requests</th>
              <th className="py-1 pr-3 font-medium">Errors</th>
              <th className="py-1 font-medium">Worst p95</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2">
                  No days with data yet.
                </td>
              </tr>
            )}
            {shown.map((d) => (
              <tr key={d.day} className="border-t border-white/5">
                <td className="py-1 pr-3">{d.day}</td>
                <td className="py-1 pr-3">{pctText(uptimePercent([d]))}</td>
                <td className="py-1 pr-3">
                  {d.requests.toLocaleString("en-US")}
                </td>
                <td className="py-1 pr-3">
                  {d.errors.toLocaleString("en-US")}
                </td>
                <td className="py-1">{d.worstP95Ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function UptimeLegend() {
  return (
    <Legend
      items={[
        { label: "99% or better", color: COLORS.good },
        { label: "95 to 99%", color: COLORS.warn },
        { label: "Under 95%", color: COLORS.bad },
        { label: "No data", color: COLORS.none },
      ]}
    />
  );
}

const MARGIN = { l: 52, r: 6, t: 8, b: 22 };
const HOUR_MS = 60 * 60 * 1000;
// The last 24 hours plus the one in progress, on clock hours.
const SLOTS = 25;

type Hour = { t: number; requests: number; errors: number; p95Ms: number };

const slotStart = (lastT: number, i: number) =>
  lastT - (lastT % HOUR_MS) - (SLOTS - 1 - i) * HOUR_MS;

const slotCenter = (i: number, plotW: number) =>
  MARGIN.l + ((i + 0.5) / SLOTS) * plotW;

/** The 5 minute buckets rolled up by hour, oldest first; null is a quiet hour. */
function byHour(buckets: (Bucket | null)[], lastT: number): (Hour | null)[] {
  return Array.from({ length: SLOTS }, (_, i) => {
    const t = slotStart(lastT, i);
    const data = buckets.filter(
      (b): b is Bucket => !!b && b.t >= t && b.t < t + HOUR_MS,
    );
    if (data.length === 0) return null;
    return {
      t,
      requests: data.reduce((s, b) => s + b.requests, 0),
      errors: data.reduce((s, b) => s + b.errors, 0),
      p95Ms: Math.max(...data.map((b) => b.p95Ms)),
    };
  });
}

function useCrosshair(width: number) {
  const [index, setIndex] = useState<number | null>(null);
  const plotW = width - MARGIN.l - MARGIN.r;
  const move = (clientX: number, left: number) => {
    const x = clientX - left - MARGIN.l;
    setIndex(Math.min(SLOTS - 1, Math.max(0, Math.floor((x / plotW) * SLOTS))));
  };
  return { index, setIndex, move, plotW };
}

function XAxis({
  lastT,
  width,
  height,
  plotW,
}: {
  lastT: number;
  width: number;
  height: number;
  plotW: number;
}) {
  // A label every six hours, wherever an Eastern hour divisible by six lands.
  const ticks: { i: number; label: string }[] = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const t = slotStart(lastT, i);
    const hour = Number(
      new Date(t).toLocaleString("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: TIME_ZONE,
      }),
    );
    if (hour % 6 === 0) ticks.push({ i, label: hourLabel(t) });
  }
  return (
    <g>
      <line
        x1={MARGIN.l}
        x2={width - MARGIN.r}
        y1={height - MARGIN.b}
        y2={height - MARGIN.b}
        stroke={COLORS.grid}
      />
      {ticks.map((tick) => (
        <text
          key={tick.i}
          x={slotCenter(tick.i, plotW)}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          fill={COLORS.text}
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

function YAxis({
  max,
  width,
  height,
  format,
}: {
  max: number;
  width: number;
  height: number;
  format: (n: number) => string;
}) {
  const plotH = height - MARGIN.t - MARGIN.b;
  return (
    <g>
      {[0, 0.5, 1].map((f) => {
        const y = MARGIN.t + plotH - f * plotH;
        return (
          <g key={f}>
            {f > 0 && (
              <line
                x1={MARGIN.l}
                x2={width - MARGIN.r}
                y1={y}
                y2={y}
                stroke={COLORS.grid}
              />
            )}
            <text
              x={MARGIN.l - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill={COLORS.text}
            >
              {format(max * f)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function LatencyChart({
  hours,
  lastT,
}: {
  hours: (Bucket | null)[];
  lastT: number;
}) {
  const [ref, width] = useWidth();
  const { index, setIndex, move, plotW } = useCrosshair(width);
  const height = 220;
  const plotH = height - MARGIN.t - MARGIN.b;
  const slots = byHour(hours, lastT);
  const max = niceMax(Math.max(0, ...slots.map((h) => h?.p95Ms ?? 0)));
  const x = (i: number) => slotCenter(i, plotW);
  const y = (v: number) => MARGIN.t + plotH - (v / max) * plotH;
  const points = slots.flatMap((h, i) => (h ? [{ i, v: h.p95Ms }] : []));
  const first = points[0];
  const last = points[points.length - 1];
  const line = points.map((pt) => `${x(pt.i)},${y(pt.v)}`).join(" ");
  const base = y(0);
  const hit = index === null ? null : slots[index];

  const tip: Tip =
    index === null
      ? null
      : {
          x: x(index),
          title: stampLabel(slotStart(lastT, index)),
          rows: hit ? (
            <>
              <TipRow
                label="Worst p95"
                value={`${hit.p95Ms} ms`}
                color={COLORS.accent}
              />
              <TipRow
                label="Requests"
                value={hit.requests.toLocaleString("en-US")}
              />
            </>
          ) : (
            <div className="text-gray-300">No data</div>
          ),
        };

  return (
    <div ref={ref} className="relative">
      <Tooltip tip={tip} width={width} />
      <svg
        width={width}
        height={height}
        className="block touch-pan-y"
        role="img"
        aria-label="Line chart of the slowest 95th percentile response time in milliseconds for each hour of the last 24 hours."
        onPointerMove={(e) =>
          move(e.clientX, e.currentTarget.getBoundingClientRect().left)
        }
        onPointerLeave={() => setIndex(null)}
      >
        <YAxis
          max={max}
          width={width}
          height={height}
          format={(n) => `${Math.round(n)} ms`}
        />
        <XAxis lastT={lastT} width={width} height={height} plotW={plotW} />
        {first && last && (
          <g>
            <polygon
              points={`${x(first.i)},${base} ${line} ${x(last.i)},${base}`}
              fill={COLORS.accent}
              opacity={0.1}
            />
            <polyline
              points={line}
              fill="none"
              stroke={COLORS.accent}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        )}
        {points.map((pt) => (
          <circle
            key={pt.i}
            cx={x(pt.i)}
            cy={y(pt.v)}
            r={4}
            fill={COLORS.accent}
            stroke={COLORS.surface}
            strokeWidth={2}
          />
        ))}
        {index !== null && (
          <line
            x1={x(index)}
            x2={x(index)}
            y1={MARGIN.t}
            y2={height - MARGIN.b}
            stroke="rgba(255,255,255,0.35)"
          />
        )}
        {points.length === 0 && (
          <text
            x={MARGIN.l + plotW / 2}
            y={MARGIN.t + plotH / 2}
            textAnchor="middle"
            fontSize={13}
            fill={COLORS.text}
          >
            No traffic sampled in the last 24 hours
          </text>
        )}
      </svg>
    </div>
  );
}

export function RequestsChart({
  hours,
  lastT,
}: {
  hours: (Bucket | null)[];
  lastT: number;
}) {
  const [ref, width] = useWidth();
  const { index, setIndex, move, plotW } = useCrosshair(width);
  const height = 220;
  const plotH = height - MARGIN.t - MARGIN.b;
  const slots = byHour(hours, lastT);
  const max = niceMax(Math.max(0, ...slots.map((h) => h?.requests ?? 0)));
  const slot = plotW / SLOTS;
  const barW = Math.min(24, Math.max(1, slot - 2));
  const center = (i: number) => slotCenter(i, plotW);
  const x = (i: number) => center(i) - barW / 2;
  const h = (v: number) => (v / max) * plotH;
  const hit = index === null ? null : slots[index];
  const empty = slots.every((b) => !b);

  const tip: Tip =
    index === null
      ? null
      : {
          x: center(index),
          title: stampLabel(slotStart(lastT, index)),
          rows: hit ? (
            <>
              <TipRow
                label="Requests"
                value={hit.requests.toLocaleString("en-US")}
                color={COLORS.accent}
              />
              <TipRow
                label="Server errors"
                value={hit.errors.toLocaleString("en-US")}
                color={COLORS.bad}
              />
            </>
          ) : (
            <div className="text-gray-300">No data</div>
          ),
        };

  return (
    <div ref={ref} className="relative">
      <Tooltip tip={tip} width={width} />
      <svg
        width={width}
        height={height}
        className="block touch-pan-y"
        role="img"
        aria-label="Column chart of requests and server errors for each hour of the last 24 hours."
        onPointerMove={(e) =>
          move(e.clientX, e.currentTarget.getBoundingClientRect().left)
        }
        onPointerLeave={() => setIndex(null)}
      >
        <YAxis
          max={max}
          width={width}
          height={height}
          format={(n) => compact(Math.round(n))}
        />
        <XAxis lastT={lastT} width={width} height={height} plotW={plotW} />
        {slots.map((b, i) => {
          if (!b) return null;
          const base = MARGIN.t + plotH;
          const reqH = Math.max(1, h(b.requests));
          const errH = b.errors > 0 ? Math.max(3, h(b.errors)) : 0;
          return (
            <g key={b.t} opacity={index === null || index === i ? 1 : 0.6}>
              <rect
                x={x(i)}
                y={base - reqH}
                width={barW}
                height={reqH}
                rx={Math.min(2, barW / 2)}
                fill={COLORS.accent}
              />
              {errH > 0 && (
                <rect
                  x={x(i)}
                  y={base - errH}
                  width={barW}
                  height={errH}
                  rx={Math.min(2, barW / 2)}
                  fill={COLORS.bad}
                />
              )}
            </g>
          );
        })}
        {index !== null && (
          <line
            x1={center(index)}
            x2={center(index)}
            y1={MARGIN.t}
            y2={height - MARGIN.b}
            stroke="rgba(255,255,255,0.35)"
          />
        )}
        {empty && (
          <text
            x={MARGIN.l + plotW / 2}
            y={MARGIN.t + plotH / 2}
            textAnchor="middle"
            fontSize={13}
            fill={COLORS.text}
          >
            No traffic sampled in the last 24 hours
          </text>
        )}
      </svg>
    </div>
  );
}

export function RequestsLegend() {
  return (
    <Legend
      items={[
        { label: "Requests", color: COLORS.accent },
        { label: "Server errors", color: COLORS.bad },
      ]}
    />
  );
}

/** Hourly roll-up of the 24 hour data, for anyone who cannot use the charts. */
export function HoursTable({
  hours,
  lastT,
}: {
  hours: (Bucket | null)[];
  lastT: number;
}) {
  const rows = byHour(hours, lastT)
    .filter((r): r is Hour => !!r)
    .reverse();

  return (
    <details className="mt-4 text-sm text-gray-400">
      <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">
        View the last 24 hours as a table
      </summary>
      <div className="mt-3 max-h-72 overflow-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="sticky top-0 bg-[#050505] text-gray-400">
            <tr>
              <th className="py-1 pr-3 font-medium">Hour (ET)</th>
              <th className="py-1 pr-3 font-medium">Requests</th>
              <th className="py-1 pr-3 font-medium">Errors</th>
              <th className="py-1 font-medium">Worst p95</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2">
                  No traffic sampled in the last 24 hours.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.t} className="border-t border-white/5">
                <td className="py-1 pr-3">{stampLabel(r.t)}</td>
                <td className="py-1 pr-3">
                  {r.requests.toLocaleString("en-US")}
                </td>
                <td className="py-1 pr-3">
                  {r.errors.toLocaleString("en-US")}
                </td>
                <td className="py-1">{r.p95Ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
