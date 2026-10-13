"use client";

import { ChevronRight } from "lucide-react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  body,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  OFFICER_POLL_MS,
  SECTIONS,
  plural,
  shortTime,
} from "@/components/admin/judging/shared";
import type { Overview, SectionId } from "@/components/admin/judging/shared";

type ItemKey =
  RouterOutputs["judging"]["admin"]["checklist"]["items"][number]["key"];

const SECTION_FOR: Record<ItemKey, SectionId> = {
  projects: "projects",
  rubric: "rubric",
  rooms: "rooms",
  schedule: "schedule",
  open: "launch",
  claims: "claims",
  itinerary: "launch",
};

/** What is left before launch, and the edition's numbers at a glance. */
export function ChecklistSection({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const checklist = trpc.judging.admin.checklist.useQuery(
    { hackathonId },
    { refetchInterval: OFFICER_POLL_MS },
  );

  // The rubric item covers the starter groups too, and those are made on
  // Challenges.
  const sectionFor = (key: ItemKey): SectionId =>
    key === "rubric" && !overview.config.groupsInitializedAt
      ? "challenges"
      : SECTION_FOR[key];
  const sectionLabel = (id: SectionId) =>
    SECTIONS.find((s) => s.id === id)?.label ?? id;

  const { counts, schedule } = overview;
  const projects = counts.entries.devpost + counts.entries.portal;
  const glance = [
    {
      label: "Projects",
      value: projects,
      detail: `${counts.entries.devpost} Devpost · ${counts.entries.portal} portal${
        counts.entries.removed ? ` · ${counts.entries.removed} removed` : ""
      }`,
    },
    {
      label: "Team members linked",
      value: counts.members.linked,
      detail: `of ${counts.members.total} listed on projects`,
    },
    {
      label: "Challenges",
      value: counts.challenges.total,
      detail: plural(counts.challenges.groups, "group"),
    },
    {
      label: "Rooms",
      value: counts.rooms.active,
      detail: `${counts.rooms.linked} with a QR link${
        counts.rooms.archived ? ` · ${counts.rooms.archived} archived` : ""
      }`,
    },
    {
      label: "Judges in rooms",
      value: counts.judgesSeated,
      detail: "Seen in the last 15 minutes",
    },
    {
      label: "Evaluations",
      value: counts.evaluations.complete,
      detail: `complete of ${counts.evaluations.total} · ${plural(counts.evaluations.drafts, "draft")}`,
    },
  ];

  return (
    <div className="space-y-12">
      <section>
        <h2 className={sectionTitle}>Before launch</h2>
        {checklist.isLoading ? (
          <p className={`mt-4 ${body}`}>Loading the checklist…</p>
        ) : checklist.isError || !checklist.data ? (
          <p className={`mt-4 ${body}`}>
            {trpcErrorMessage(checklist.error, "Could not load the checklist.")}{" "}
            <button
              type="button"
              onClick={() => checklist.refetch()}
              className={textLink}
            >
              Try again
            </button>
          </p>
        ) : (
          <>
            <p className={`mt-1 ${meta}`}>
              {checklist.data.done} of {checklist.data.total} ready. Refreshes
              every 10 seconds.
            </p>
            <ol className="mt-6 border-t border-[var(--border-subtle)]">
              {checklist.data.items.map((item, index) => {
                const next =
                  !item.done &&
                  checklist.data.items.findIndex((i) => !i.done) === index;
                const target = sectionFor(item.key);
                return (
                  <li
                    key={item.key}
                    className="border-b border-[var(--border-subtle)]"
                  >
                    <a
                      href={`#${target}`}
                      className={`flex items-center gap-4 py-4 min-h-11 transition-colors hover:bg-[var(--bg-secondary)] ${
                        next ? "border-l-2 border-accent pl-4" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 font-[family-name:var(--font-display)] text-[22px] font-semibold leading-none tabular-nums text-[var(--text-subtle)]">
                        {index + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </span>
                        <span className={`mt-0.5 block ${meta}`}>
                          {item.hint}
                        </span>
                      </span>
                      <span className="hidden sm:block shrink-0 text-[13px] text-[var(--text-subtle)]">
                        {sectionLabel(target)}
                      </span>
                      <span
                        className={`shrink-0 ${status(
                          item.done ? "success" : next ? "accent" : "neutral",
                        )}`}
                      >
                        {item.done ? "Done" : next ? "Next" : "To do"}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[var(--text-subtle)]"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      <section className={sectionRule}>
        <h2 className={label}>At a glance</h2>
        <dl className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-6">
          {glance.map((item) => (
            <div
              key={item.label}
              className="border-t border-[var(--border-subtle)] py-4"
            >
              <dt className="text-[13px] font-medium text-[var(--text-secondary)]">
                {item.label}
              </dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                {item.value}
              </dd>
              <dd className={`mt-1.5 ${meta}`}>{item.detail}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-4 ${meta}`}>
          {schedule
            ? `Schedule saved: ${plural(schedule.appointments, "presentation")} from ${shortTime(schedule.windowStart)} to ${shortTime(schedule.windowEnd)}.`
            : "No schedule saved yet."}
          {counts.announcements > 0 &&
            ` ${plural(counts.announcements, "announcement")} on judges' screens.`}
        </p>
      </section>
    </div>
  );
}
