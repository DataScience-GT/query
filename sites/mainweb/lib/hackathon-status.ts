import type { Tone } from "@/components/portal/ui";

/**
 * A hackathon's lifecycle status as members read it. The list and detail
 * pages each kept their own copy of these labels; this is the one place they
 * live now. Render with `status(tone)` from the portal primitives.
 */
const HACKATHON_STATUSES: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Not published", tone: "neutral" },
  announced: { label: "Opens soon", tone: "neutral" },
  open: { label: "Registration open", tone: "accent" },
  in_progress: { label: "Live", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
  closed: { label: "Registration closed", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function hackathonStatus(s: string): { label: string; tone: Tone } {
  return (
    HACKATHON_STATUSES[s] ?? { label: s.replace(/_/g, " "), tone: "neutral" }
  );
}
