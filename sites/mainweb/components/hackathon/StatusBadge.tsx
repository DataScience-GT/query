import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";

const STATUSES: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  approved: {
    label: "Accepted",
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  checked_in: {
    label: "Checked in",
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  waitlisted: {
    label: "Waitlisted",
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
  pending: {
    label: "Under review",
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
  rejected: {
    label: "Not accepted",
    color:
      "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-medium)]",
    icon: <XCircle className="w-3 h-3" />,
  },
};

/**
 * A registration status as people read it. Every page that showed one used to
 * print the raw enum ("checked_in") or its own wording; this is the one place
 * the labels live.
 */
export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUSES[status] ?? {
    label: status.replace(/_/g, " "),
    color:
      "text-[var(--text-subtle)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    icon: <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${cfg.color}`}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}
