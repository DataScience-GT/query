import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { label } from "@/components/portal/ui";
import type { HackathonNextStep } from "@/lib/hackathon-next-step";

/**
 * The one thing a registered hacker does next, as a single link: the event
 * page and the dashboard both lead with it.
 */
export function NextStepStrip({
  step,
  className = "",
}: {
  step: HackathonNextStep;
  className?: string;
}) {
  return (
    <Link
      href={step.href}
      className={`group flex max-w-xl items-center justify-between gap-4 border-l-2 border-accent pl-4 ${className}`}
    >
      <span className="min-w-0">
        <span className={`block ${label}`}>
          {step.step === "status" ? "Your status" : "Next step"}
        </span>
        <span className="mt-0.5 block text-[17px] font-semibold leading-snug text-[var(--text-primary)] group-hover:underline decoration-accent decoration-2 underline-offset-4">
          {step.label}
        </span>
        {step.detail && (
          <span className="mt-1 block text-[15px] leading-snug text-[var(--text-muted)]">
            {step.detail}
          </span>
        )}
      </span>
      <ArrowRight
        className="h-5 w-5 flex-shrink-0 text-[var(--text-primary)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Link>
  );
}
