"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  btnDanger,
  btnSecondary,
  meta,
  sectionTitle,
} from "@/components/portal/ui";
import {
  ErrorLine,
  NoticeLine,
  TypedConfirm,
  plural,
  typedMatches,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Overview } from "@/components/admin/judging/shared";

type ResetId =
  | "dropEvaluations"
  | "resetLaunch"
  | "dropRooms"
  | "resetProjects"
  | "resetSetup"
  | "resetAll";

/** The way back, each reset behind the edition's name typed out. */
export function DangerZone({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [open, setOpen] = useState<ResetId | null>(null);
  const [typed, setTyped] = useState("");
  const [summary, setSummary] = useState<{ id: ResetId; text: string } | null>(
    null,
  );

  const finish = (id: ResetId, text: string) => {
    setOpen(null);
    setTyped("");
    setSummary({ id, text });
    void refresh();
  };

  const mutations = {
    dropEvaluations: trpc.judging.admin.dropEvaluations.useMutation({
      onSuccess: (r) =>
        finish(
          "dropEvaluations",
          `Deleted ${plural(r.evaluations, "evaluation")}, ${plural(r.drafts, "draft")} and ${plural(r.placements, "placing")}.`,
        ),
    }),
    resetLaunch: trpc.judging.admin.resetLaunch.useMutation({
      onSuccess: (r) =>
        finish(
          "resetLaunch",
          `Itinerary hidden, emergency mode off. Deleted ${plural(r.claimLinks, "claim link")} and unlinked ${plural(r.unclaimedMembers, "Devpost team member")}.`,
        ),
    }),
    dropRooms: trpc.judging.admin.dropRooms.useMutation({
      onSuccess: (r) =>
        finish(
          "dropRooms",
          `Deleted ${plural(r.rooms, "room or table", "rooms and tables")} and ${plural(r.announcements, "announcement")}.`,
        ),
    }),
    resetProjects: trpc.judging.admin.resetProjects.useMutation({
      onSuccess: (r) =>
        finish(
          "resetProjects",
          `Deleted ${plural(r.entries, "project")} and ${plural(r.challenges, "challenge")}.`,
        ),
    }),
    resetSetup: trpc.judging.admin.resetSetup.useMutation({
      onSuccess: (r) =>
        finish(
          "resetSetup",
          `Reset ${plural(r.groups, "group")} and deleted ${plural(r.rubricItems, "rubric question")}. Starter groups are back.`,
        ),
    }),
    resetAll: trpc.judging.admin.resetAll.useMutation({
      onSuccess: (r) =>
        finish(
          "resetAll",
          `Deleted ${plural(r.entries, "project")}, ${plural(r.challenges, "challenge")}, ${plural(r.rooms, "room or table", "rooms and tables")}, ${plural(r.judges, "judge record")} and ${plural(r.evaluations, "evaluation")}${r.scheduleDropped ? ", and dropped the schedule" : ""}. Starter groups are back.`,
        ),
    }),
  };

  const { counts, schedule, hackathon } = overview;
  const scored = counts.evaluations.total + counts.evaluations.drafts > 0;
  const hasRooms = counts.rooms.active + counts.rooms.archived > 0;
  // The order the API checks in, so the first blocker shown is the one it
  // would refuse with.
  const needsClearing = schedule
    ? "Drop the saved schedule first."
    : scored
      ? "Drop evaluations first."
      : hasRooms
        ? "Drop rooms first."
        : null;

  const resets: {
    id: ResetId;
    title: string;
    what: string;
    blocked: string | null;
  }[] = [
    {
      id: "dropEvaluations",
      title: "Drop evaluations",
      what: "Deletes every evaluation, draft and computed placing. The schedule and rubric stay.",
      blocked: null,
    },
    {
      id: "resetLaunch",
      title: "Reset launch",
      what: "Hides the itinerary, turns emergency mode off and clears Devpost claims and claim links, so claiming starts over. Portal projects stay linked.",
      blocked: null,
    },
    {
      id: "dropRooms",
      title: "Drop rooms",
      what: "Deletes every room and table, their QR links and every announcement. Buildings stay.",
      blocked: schedule ? "Drop the saved schedule first." : null,
    },
    {
      id: "resetProjects",
      title: "Reset projects",
      what: "Deletes every project, from Devpost and the portal, and the challenges they brought. Groups stay, and the project list unlocks.",
      blocked: needsClearing,
    },
    {
      id: "resetSetup",
      title: "Reset setup",
      what: "Deletes the groups and the rubric, moves every challenge to the top level as scheduled, and creates the starter groups again. Projects stay.",
      blocked: needsClearing,
    },
    {
      id: "resetAll",
      title: "Reset everything",
      what: "Deletes everything judging holds for this edition: projects, challenges, rooms, tables, buildings, the schedule, evaluations, the rubric and judges' judging records. Judge accounts and the edition stay.",
      blocked: null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className={sectionTitle}>Danger zone</h2>
        <p className={`mt-1 max-w-2xl ${meta}`}>
          None of these can be undone. Each one asks for the edition&apos;s
          name, {hackathon.name}, typed out.
        </p>
      </div>

      <ul className="border-t border-[var(--border-subtle)]">
        {resets.map((reset) => {
          const mutation = mutations[reset.id];
          const isOpen = open === reset.id;
          return (
            <li
              key={reset.id}
              className="border-b border-[var(--border-subtle)] py-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0 max-w-2xl">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {reset.title}
                  </p>
                  <p className={`mt-0.5 ${meta}`}>{reset.what}</p>
                  {reset.blocked && (
                    <p className="mt-1 text-[13px] text-[var(--warning)]">
                      {reset.blocked}
                    </p>
                  )}
                </div>
                {!isOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      mutation.reset();
                      setTyped("");
                      setSummary(null);
                      setOpen(reset.id);
                    }}
                    disabled={readOnly || !!reset.blocked}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={`${btnDanger} shrink-0`}
                  >
                    {reset.title}
                  </button>
                )}
              </div>

              {isOpen && (
                <form
                  className="mt-4 space-y-4 border-l-2 border-[var(--danger)] pl-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!typedMatches(typed, hackathon.name)) return;
                    mutation.mutate({ hackathonId, confirmation: typed.trim() });
                  }}
                >
                  <TypedConfirm
                    id={`reset-${reset.id}`}
                    expected={hackathon.name}
                    value={typed}
                    onChange={setTyped}
                    what={`${reset.title} runs as soon as you confirm.`}
                  />
                  {mutation.error && (
                    <ErrorLine>
                      {trpcErrorMessage(mutation.error, "The reset did not run.")}
                    </ErrorLine>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={
                        readOnly ||
                        mutation.isPending ||
                        !typedMatches(typed, hackathon.name)
                      }
                      className={btnDanger}
                    >
                      {mutation.isPending ? "Working…" : `Confirm: ${reset.title.toLowerCase()}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(null)}
                      className={btnSecondary}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {summary?.id === reset.id && (
                <div className="mt-4">
                  <NoticeLine>{summary.text}</NoticeLine>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
