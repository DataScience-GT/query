"use client";

import { trpc } from "@/lib/trpc";
import { body } from "@/components/portal/ui";
import { clockTime, deskMeta, deskStatus } from "./desk";

/**
 * Messages from organisers: the edition-wide one and the judge's room's.
 * Urgent ones lead and read louder. While a judge is scoring, only the urgent
 * ones show, so the rubric keeps the screen.
 */
export function DeskAnnouncements({
  hackathonId,
  urgentOnly = false,
}: {
  hackathonId: string;
  urgentOnly?: boolean;
}) {
  const { data } = trpc.judging.desk.announcements.useQuery(
    { hackathonId },
    { refetchInterval: 30_000 },
  );

  const shown = (data ?? [])
    .filter((a) => !urgentOnly || a.isUrgent)
    .sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent));
  if (shown.length === 0) return null;

  return (
    <section
      aria-label="Announcements from organisers"
      aria-live="polite"
      className={urgentOnly ? "mb-6 space-y-4" : "mt-6 space-y-5"}
    >
      {shown.map((a) => (
        <div
          key={a.id}
          className={`border-l-2 pl-5 ${a.isUrgent ? "border-[var(--danger)]" : "border-[var(--border-medium)]"}`}
        >
          {a.isUrgent && <p className={deskStatus("danger")}>Urgent</p>}
          <p
            className={`whitespace-pre-line break-words ${a.isUrgent ? "mt-1 text-[17px] font-semibold leading-snug text-[var(--text-primary)]" : body}`}
          >
            {a.message}
          </p>
          <p className={`mt-1 ${deskMeta}`}>
            {a.roomName ? `For ${a.roomName}` : "For every judge"} ·{" "}
            {clockTime(a.createdAt)}
          </p>
        </div>
      ))}
    </section>
  );
}
