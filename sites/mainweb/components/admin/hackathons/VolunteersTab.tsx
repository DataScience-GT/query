"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronDown, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { useReadOnly } from "@/lib/use-portal-context";
import { volunteerBlockLabel } from "@/lib/volunteer-blocks";
import { volunteerCsv } from "@/lib/volunteer-csv";
import { VolunteerSummary } from "@/components/volunteer/VolunteerSummary";
import {
  VOLUNTEER_BLOCKS,
  VOLUNTEER_ROLES,
  VOLUNTEER_STATUSES,
} from "@query/db/constants";
import type {
  VolunteerBlock,
  VolunteerRole,
  VolunteerStatus,
} from "@query/db/constants";
import { Alert } from "@query/ui/Alert";
import { EmptyState } from "@query/ui/EmptyState";
import {
  body,
  btnInk,
  btnSecondary,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status as statusClass,
  textLink,
} from "@query/ui/classes";
import type { Tone } from "@query/ui/classes";

const STATUS_LABEL: Record<VolunteerStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
const STATUS_TONE: Record<VolunteerStatus, Tone> = {
  pending: "warning",
  approved: "success",
  declined: "neutral",
  withdrawn: "neutral",
};


/** One coverage row: a block or a role, with who could cover it. Pressing it filters the list. */
function CoverageRow({
  label,
  count,
  pressed,
  onPress,
}: {
  label: string;
  count: { approved: number; pending: number } | undefined;
  pressed: boolean;
  onPress: () => void;
}) {
  const approved = count?.approved ?? 0;
  const pending = count?.pending ?? 0;
  return (
    <li className="border-b border-[var(--border-subtle)]">
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onPress}
        className={`flex min-h-11 w-full items-center justify-between gap-4 py-2 text-left text-[15px] transition-colors ${
          pressed
            ? "font-semibold text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="min-w-0">{label}</span>
        <span
          className={`shrink-0 tabular-nums ${approved === 0 ? "text-[var(--warning)]" : ""}`}
        >
          {approved} approved
          {pending > 0 ? `, ${pending} pending` : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * The volunteer roster for one edition: who offered, what they can cover, and
 * the decision. Coverage counts everyone who could still come, so organizers
 * see which blocks and roles are thin. Approving does not grant the
 * check-in scanner tier; that is the Staff page.
 */
export function VolunteersTab({
  hackathonId,
  hackathonName,
  startDate,
}: {
  hackathonId: string;
  hackathonName: string;
  startDate: Date | string;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  const [statusFilter, setStatusFilter] = useState<VolunteerStatus | null>(null);
  const [role, setRole] = useState<VolunteerRole | null>(null);
  const [block, setBlock] = useState<VolunteerBlock | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = {
    hackathonId,
    status: statusFilter ?? undefined,
    role: role ?? undefined,
    block: block ?? undefined,
  };
  const roster = trpc.volunteer.list.useQuery(filter, {
    // The phone numbers are why a bug tester is turned away; do not ask.
    enabled: !readOnly,
    placeholderData: keepPreviousData,
  });

  const decide = trpc.volunteer.decide.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.volunteer.list.invalidate();
    },
    onError: (e) => setError(trpcErrorMessage(e, "That didn't go through.")),
  });

  if (readOnly) {
    return (
      <p className={`py-16 ${body}`}>
        Volunteer applications include phone numbers, so bug testers can&apos;t
        open this tab.
      </p>
    );
  }
  if (roster.isLoading) {
    return <p className={`py-16 ${body}`}>Loading volunteers…</p>;
  }
  if (roster.isError || !roster.data) {
    return (
      <p className={`py-16 ${body}`}>
        {trpcErrorMessage(roster.error, "Could not load the volunteers.")}{" "}
        <button type="button" onClick={() => roster.refetch()} className={textLink}>
          Try again
        </button>
      </p>
    );
  }

  const { applications, coverage } = roster.data;
  const counts = coverage.byStatus;
  const everyone =
    counts.pending + counts.approved + counts.declined + counts.withdrawn;
  const filtered = !!(statusFilter || role || block);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await utils.volunteer.exportApplications.fetch(filter);
      if (rows.length === 0) {
        setError("Nothing to export with these filters.");
        return;
      }
      const blob = new Blob([volunteerCsv(rows, startDate)], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `${hackathonName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_volunteers.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The export didn't go through.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className={sectionTitle}>Volunteers</h2>
          <p className={`mt-2 ${meta}`}>
            {counts.approved} approved · {counts.pending} pending ·{" "}
            {counts.declined} declined · {counts.withdrawn} withdrawn
          </p>
          <p className={`mt-1 max-w-xl ${meta}`}>
            Approving doesn&apos;t give check-in scanner access. Grant that on
            the{" "}
            <Link href="/admin/staff" className={textLink}>
              Staff page
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || everyone === 0}
          className={btnSecondary}
        >
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </section>

      {error && <Alert rule>{error}</Alert>}

      {everyone === 0 ? (
        <EmptyState>
          No volunteer applications yet. The apply link on hacklytics.io goes to
          the volunteer page for this edition.
        </EmptyState>
      ) : (
        <>
          <section className="grid gap-x-12 gap-y-8 md:grid-cols-2">
            <div>
              <h3 className={itemTitle}>Time blocks</h3>
              <p className={`mt-1 ${meta}`}>
                Who could cover each one. Press a row to filter the list.
              </p>
              <ul className="mt-3 border-t border-[var(--border-subtle)]">
                {VOLUNTEER_BLOCKS.map((b) => (
                  <CoverageRow
                    key={b.id}
                    label={volunteerBlockLabel(b.id, startDate)}
                    count={coverage.blocks[b.id]}
                    pressed={block === b.id}
                    onPress={() => setBlock(block === b.id ? null : b.id)}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className={itemTitle}>Roles</h3>
              <p className={`mt-1 ${meta}`}>
                Volunteers who left roles blank are happy anywhere, and are not
                counted here.
              </p>
              <ul className="mt-3 border-t border-[var(--border-subtle)]">
                {VOLUNTEER_ROLES.map((r) => (
                  <CoverageRow
                    key={r.id}
                    label={r.label}
                    count={coverage.roles[r.id]}
                    pressed={role === r.id}
                    onPress={() => setRole(role === r.id ? null : r.id)}
                  />
                ))}
              </ul>
            </div>
          </section>

          <section className={sectionRule}>
            <div
              role="group"
              aria-label="Filter volunteers by status"
              className="mb-4 flex flex-wrap items-center gap-2"
            >
              {([null, ...VOLUNTEER_STATUSES] as const).map((s) => (
                <button
                  key={s ?? "all"}
                  type="button"
                  aria-pressed={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  className={statusFilter === s ? btnInk : btnSecondary}
                >
                  {s ? STATUS_LABEL[s] : "All"}
                </button>
              ))}
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter(null);
                    setRole(null);
                    setBlock(null);
                  }}
                  className={textLink}
                >
                  Clear filters
                </button>
              )}
            </div>
            {(role || block) && (
              <p className={`mb-4 ${meta}`}>
                Showing
                {role
                  ? ` ${VOLUNTEER_ROLES.find((r) => r.id === role)?.label}`
                  : ""}
                {role && block ? " and" : ""}
                {block ? ` ${volunteerBlockLabel(block, startDate)}` : ""}.
              </p>
            )}

            {applications.length === 0 ? (
              <EmptyState>No volunteers match these filters.</EmptyState>
            ) : (
              <ul className="border-t border-[var(--border-subtle)]">
                {applications.map((app) => {
                  const isOpen = openId === app.id;
                  const name =
                    app.user?.name || app.user?.email || "Unnamed volunteer";
                  return (
                    <li
                      key={app.id}
                      className="border-b border-[var(--border-subtle)]"
                    >
                      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Image
                            unoptimized
                            src={app.user?.image || "/avatars/default.svg"}
                            alt=""
                            width={36}
                            height={36}
                            className="shrink-0 rounded-full bg-[var(--bg-secondary)]"
                          />
                          <div className="min-w-0">
                            <p className={`${itemTitle} truncate text-[17px]`}>
                              {name}
                            </p>
                            <p className={`truncate ${meta}`}>
                              {[
                                app.user?.email,
                                `${app.answers.availability.length} of 9 blocks`,
                                app.answers.roles.length
                                  ? `${app.answers.roles.length} ${app.answers.roles.length === 1 ? "role" : "roles"}`
                                  : "any role",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                          <span className={statusClass(STATUS_TONE[app.status])}>
                            {STATUS_LABEL[app.status]}
                          </span>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenId(isOpen ? null : app.id)}
                            className={btnSecondary}
                          >
                            Details
                            <ChevronDown
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden="true"
                              className={isOpen ? "rotate-180" : undefined}
                            />
                          </button>
                          {app.status !== "approved" &&
                            app.status !== "withdrawn" && (
                              <button
                                type="button"
                                disabled={decide.isPending}
                                onClick={() =>
                                  decide.mutate({
                                    applicationId: app.id,
                                    decision: "approved",
                                  })
                                }
                                className={btnInk}
                              >
                                Approve
                              </button>
                            )}
                          {app.status !== "declined" &&
                            app.status !== "withdrawn" && (
                              <button
                                type="button"
                                disabled={decide.isPending}
                                onClick={() =>
                                  decide.mutate({
                                    applicationId: app.id,
                                    decision: "declined",
                                  })
                                }
                                className={btnSecondary}
                              >
                                Decline
                              </button>
                            )}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="pb-4">
                          <VolunteerSummary
                            answers={app.answers}
                            startDate={startDate}
                          />
                          <p className={`mt-3 ${meta}`}>
                            Applied {new Date(app.createdAt).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
