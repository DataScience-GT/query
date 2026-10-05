"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import {
  body,
  itemTitle,
  label,
  meta,
  sectionRule,
  sectionTitle,
} from "@/components/portal/ui";

const statValue =
  "mt-1 font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tabular-nums text-[var(--text-primary)]";

export function AnalyticsTab({ hackathonId }: { hackathonId: string }) {
  const { data: analytics, isLoading } = trpc.hackathon.analytics.useQuery({
    hackathonId,
  });

  if (isLoading)
    return <p className={`py-20 ${meta}`}>Calculating stats…</p>;
  if (!analytics)
    return (
      <p className={`py-20 ${body}`}>
        No analytics for this edition yet.
      </p>
    );

  const row =
    "flex items-baseline justify-between gap-6 border-b border-[var(--border-subtle)] py-2.5 text-[15px]";

  return (
    <div className="space-y-10">
      <section>
        <h2 className={sectionTitle}>Registration overview</h2>
        <dl className="mt-5 flex flex-wrap gap-y-6">
          <div className="pr-8">
            <dt className={label}>Total registrations</dt>
            <dd className={statValue}>{analytics.totalRegistrations}</dd>
          </div>
          {Object.entries(analytics.statusBreakdown).map(
            ([status, count]: [string, number]) => (
              <div
                key={status}
                className="border-l border-[var(--border-subtle)] px-8"
              >
                <dt className={`truncate first-letter:uppercase ${label}`}>
                  {status.replace(/_/g, " ")}
                </dt>
                <dd className={statValue}>{count}</dd>
              </div>
            ),
          )}
        </dl>
      </section>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-10 ${sectionRule}`}>
        <section>
          <h3 className={itemTitle}>Shirt sizes</h3>
          <ul className="mt-3">
            {Object.entries(analytics.shirtSizes)
              .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
              .map(([size, count]: [string, number]) => (
                <li key={size} className={row}>
                  <span className="text-[var(--text-muted)]">{size}</span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {count}
                  </span>
                </li>
              ))}
          </ul>
        </section>

        <section>
          <h3 className={itemTitle}>Dietary restrictions</h3>
          <ul className="mt-3">
            {Object.entries(analytics.dietaryRestrictions)
              .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
              .map(([res, count]: [string, number]) => (
                <li key={res} className={row}>
                  <span className="inline-block text-[var(--text-muted)] first-letter:uppercase">
                    {res.replace(/_/g, " ")}
                  </span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {count}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
