import { status as statusClass } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

const STATUSES: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Accepted", tone: "success" },
  checked_in: { label: "Checked in", tone: "success" },
  waitlisted: { label: "Waitlisted", tone: "warning" },
  pending: { label: "Under review", tone: "warning" },
  rejected: { label: "Not accepted", tone: "neutral" },
};

/**
 * A registration status as people read it. Every page that showed one used to
 * print the raw enum ("checked_in") or its own wording; this is the one place
 * the labels live.
 */
export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUSES[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "neutral" as const,
  };
  return <span className={statusClass(cfg.tone)}>{cfg.label}</span>;
}
