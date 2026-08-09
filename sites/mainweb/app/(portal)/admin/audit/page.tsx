"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { ScrollText } from "lucide-react";

/**
 * The audit log.
 *
 * `audit.list` has existed with no screen calling it, while retention prunes
 * routine rows at 90 days — so the evidence expired before anyone could look at
 * it. This is the reader.
 */

const PAGE = 50;

const SEVERITIES = [
  { id: undefined, label: "All" },
  { id: "critical" as const, label: "Critical" },
  { id: "warn" as const, label: "Warnings" },
  { id: "info" as const, label: "Info" },
];

const severityClass = (severity: string) =>
  severity === "critical"
    ? "text-red-400 border-red-500/30 bg-red-500/10"
    : severity === "warn"
      ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
      : "text-[var(--text-muted)] border-[var(--border-subtle)] bg-white/[0.02]";

export default function AuditPage() {
  const [severity, setSeverity] = useState<
    "info" | "warn" | "critical" | undefined
  >(undefined);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = trpc.audit.list.useQuery({
    limit: PAGE,
    offset,
    severity,
  });

  return (
    <div className="max-w-5xl mx-auto py-16 px-6 space-y-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-accent" />
          Audit log
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] font-mono">
          Destructive and forced admin actions. Routine entries are pruned after
          90 days; critical ones are kept for a year.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SEVERITIES.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => {
              setSeverity(option.id);
              setOffset(0);
            }}
            aria-pressed={severity === option.id}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border rounded-none transition-colors ${
              severity === option.id
                ? "bg-accent/10 border-accent/40 text-accent"
                : "bg-[var(--bg-primary)]/40 border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-accent/20"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <LiquidGlass className="p-6 border-[var(--border-subtle)]">
        {isLoading ? (
          <p className="text-xs font-mono text-[var(--text-subtle)]">
            Loading...
          </p>
        ) : (data?.logs.length ?? 0) === 0 ? (
          <p className="text-xs font-mono text-[var(--text-subtle)]">
            Nothing recorded in this range.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {data?.logs.map((log) => (
              <div key={log.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest border ${severityClass(log.severity)}`}
                  >
                    {log.severity}
                  </span>
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    {log.action}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-subtle)]">
                    {log.createdAt.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[var(--text-subtle)] break-all">
                  by {log.userId ?? "system"}
                  {log.resourceId ? ` · on ${log.resourceId}` : ""}
                </p>
                {log.metadata != null &&
                  Object.keys(log.metadata as object).length > 0 && (
                    <pre className="text-[10px] font-mono text-[var(--text-muted)] overflow-x-auto bg-[var(--bg-primary)]/40 p-2">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[11px] font-mono text-[var(--text-subtle)]">
            {data
              ? `${offset + 1}–${Math.min(offset + PAGE, data.pagination.total)} of ${data.pagination.total}`
              : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
              disabled={offset === 0}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-none hover:bg-white/5 transition-colors disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE)}
              disabled={!data?.pagination.hasMore}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-none hover:bg-white/5 transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </LiquidGlass>
    </div>
  );
}
