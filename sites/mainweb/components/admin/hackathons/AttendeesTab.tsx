"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  input,
  meta,
  sectionRule,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
/**
 * Recipients per request, shared with the server so the chunk size and the
 * procedure's cap cannot drift — a chunk larger than the cap fails every send
 * on input validation.
 */
import { MASS_EMAIL_BATCH } from "@query/api/email-limits";

/** Rows per page. The expanded detail view needs every column, so the roster
 *  is kept small by row count rather than by narrowing what each row carries. */
const PAGE_SIZE = 50;

/** Delays a fast-changing value so it can drive a query without firing one per
 *  keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
import { RegistrationControls } from "./RegistrationControls";
import { AcceptanceWaves } from "./AcceptanceWaves";
import { AttendeeStats } from "./AttendeeStats";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import type { RegistrationStatus } from "./attendee-status";
import type { HackathonStatus } from "./constants";

export function AttendeesTab({
  hackathonId,
  hackathonName,
  status,
}: {
  hackathonId: string;
  hackathonName: string;
  status: HackathonStatus;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RegistrationStatus>(
    "all",
  );

  // Typing straight into the query would fire a request per keystroke against
  // a table this size. 300ms is below the point where the list feels detached
  // from the box.
  const debouncedSearch = useDebounced(searchQuery, 300);

  const query = {
    hackathonId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  };

  const { data, isLoading, isFetching, isError, error, refetch } =
    trpc.hackathon.adminGetAttendees.useQuery(query, {
      // Keeps the current page on screen while the next one loads, instead of
      // dropping back to the skeleton on every page turn or filter change.
      placeholderData: (previous) => previous,
    });

  // Stat tiles come from the aggregate, not from counting the rows on screen.
  // Counting a page would report "12 pending" when 400 are.
  const { data: analytics } = trpc.hackathon.analytics.useQuery({ hackathonId });
  // Parent already fetched getById with the route slug; this UUID query
  // misses that cache. Until it returns, fall back to the status the
  // dashboard already has so announced editions don't flash the empty queue.
  const { data: hackathon } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });
  const announced = (hackathon?.status ?? status) === "announced";
  const { data: interestRows, isLoading: interestLoading } =
    trpc.hackathon.listInterest.useQuery(
      { hackathonId },
      { enabled: announced },
    );

  const attendees = data?.attendees;

  const updateStatus = trpc.hackathon.updateParticipantStatus.useMutation({
    onSuccess: (_result, variables) => {
      // Patch the row that changed rather than refetching the page. An
      // organiser working through a queue of applications triggers this on
      // every click.
      utils.hackathon.adminGetAttendees.setData(query, (previous) =>
        previous
          ? {
              ...previous,
              attendees: previous.attendees.map((a) =>
                a.id === variables.participantId
                  ? { ...a, registrationStatus: variables.status }
                  : a,
              ),
            }
          : previous,
      );
      utils.hackathon.analytics.invalidate({ hackathonId });
      utils.hackathon.getById.invalidate({ id: hackathonId });
      utils.hackathon.listAll.invalidate();
      utils.hackathon.waveStatus.invalidate({ hackathonId });
    },
    // Same reasoning as the batch mutation below. This is the action an
    // organiser repeats 2000 times; a rate-limit or NOT_FOUND leaves the badge
    // on "pending", which looks exactly like a missed click — so those
    // applicants are never approved and never emailed.
    onError: (error) => setBulkError(error.message),
  });

  const batchUpdateStatus =
    trpc.hackathon.batchUpdateParticipantStatus.useMutation({
      onSuccess: () => {
        // A bulk action can move rows out of the current filter, so unlike the
        // single-row path this genuinely has to refetch the page.
        utils.hackathon.adminGetAttendees.invalidate();
        utils.hackathon.analytics.invalidate({ hackathonId });
        utils.hackathon.getById.invalidate({ id: hackathonId });
        utils.hackathon.listAll.invalidate();
        utils.hackathon.waveStatus.invalidate({ hackathonId });
        setSelectedIds(new Set());
        setBulkError(null);
      },
      // Without this a rejected batch looks identical to a successful one: the
      // selection stays highlighted and nothing on screen changes. An organiser
      // working through 2000 applications has no way to tell.
      onError: (error) => setBulkError(error.message),
    });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [emailProgress, setEmailProgress] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** True once the selection covers every matching row, not just this page. */
  const [selectedAllMatching, setSelectedAllMatching] = useState(false);

  const massAccept = trpc.hackathon.sendMassAcceptanceEmails.useMutation();

  const stats = {
    total: analytics?.totalRegistrations ?? 0,
    pending: analytics?.statusBreakdown.pending ?? 0,
    approved: analytics?.statusBreakdown.approved ?? 0,
    rejected: analytics?.statusBreakdown.rejected ?? 0,
    waitlisted: analytics?.statusBreakdown.waitlisted ?? 0,
    checked_in: analytics?.statusBreakdown.checked_in ?? 0,
  };

  if (isLoading)
    return <p className={`py-16 ${body}`}>Loading registrations…</p>;

  // Without this a failed fetch renders as "No matching registrations.".
  if (isError && !data)
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]">
          Couldn&apos;t load registrations. {error.message}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );

  // Already filtered and paged by the database.
  const filteredAttendees = attendees ?? [];
  const matching = data?.matching ?? 0;
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));

  /**
   * Exports every row matching the current filter, not just the page on
   * screen. Fetched on demand through its own endpoint so the bulk-PII read
   * happens exactly when an organiser asks for it.
   */
  const exportToCSV = async () => {
    setExporting(true);
    let all: Awaited<
      ReturnType<typeof utils.hackathon.exportAttendees.fetch>
    >;
    try {
      all = await utils.hackathon.exportAttendees.fetch({
        hackathonId,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Export failed");
      setExporting(false);
      return;
    }
    setExporting(false);

    if (all.length === 0) return;
    const headers = [
      "Name",
      "Email",
      "Status",
      "Team",
      "School",
      "Major",
      "Grad Year",
      "Why Attend",
      "Shirt Size",
      "Dietary Restrictions",
      "Emergency Contact",
      "Emergency Phone",
      "Registered At",
    ];
    type Attendee = (typeof all)[number];
    const rows = all.map((a: Attendee) => [
      `"${a.firstName || ""} ${a.lastName || ""}"`,
      `"${a.user?.email || "Unknown"}"`,
      `"${a.registrationStatus}"`,
      `"${a.team?.name || "No Team"}"`,
      `"${a.school || ""}"`,
      `"${a.major || ""}"`,
      `"${a.graduationYear || ""}"`,
      `"${(a.whyAttend || "").replace(/"/g, "'")}"`,
      `"${a.shirtSize || "None"}"`,
      `"${(a.dietaryRestrictions || []).join(", ") || "None"}"`,
      `"${a.emergencyContact || ""}"`,
      `"${a.emergencyPhone || ""}"`,
      `"${new Date(a.registeredAt).toISOString()}"`,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r: string[]) => r.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${hackathonName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_attendees.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // The blob is retained until its URL is revoked; without this every export
    // leaks the full attendee CSV for the lifetime of the page.
    URL.revokeObjectURL(url);
  };

  const handleStatusUpdate = (
    participantId: string,
    newStatus: RegistrationStatus,
  ) => {
    // Clear the last failure so a stale "seats left" message does not sit
    // above a row that has since gone through.
    setBulkError(null);
    updateStatus.mutate({ hackathonId, participantId, status: newStatus });
  };

  const handleBulkAction = (newStatus: RegistrationStatus) => {
    setBulkError(null);
    batchUpdateStatus.mutate({
      hackathonId,
      participantIds: Array.from(selectedIds),
      status: newStatus,
    });
  };

  /**
   * Approve the selection and mail each of them, in server-sized batches.
   *
   * Sequential on purpose: this is thousands of SMTP sends against one
   * provider, and firing the batches concurrently is how you get rate-limited
   * halfway through your acceptance list. Progress is reported per batch
   * because the whole run takes minutes.
   */
  const handleMassAccept = async () => {
    const ids = Array.from(selectedIds);
    if (
      !window.confirm(
        `Approve ${ids.length} applicant(s) and send each an acceptance email?\n\nAcceptance emails cannot be unsent.`,
      )
    )
      return;

    setBulkError(null);
    setEmailSending(true);
    let approved = 0;
    let emailed = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i += MASS_EMAIL_BATCH) {
      const chunk = ids.slice(i, i + MASS_EMAIL_BATCH);
      setEmailProgress(
        `Sending ${i + 1}-${i + chunk.length} of ${ids.length}...`,
      );
      try {
        const result = await massAccept.mutateAsync({
          hackathonId,
          participantIds: chunk,
        });
        approved += result.approved;
        emailed += result.emailed;
        failed += result.failedEmails.length;
      } catch (error) {
        // Stop rather than continue: whatever broke this batch — a timeout, a
        // provider limit — will break the next one too, and every extra
        // attempt costs the organiser minutes they do not have.
        setBulkError(
          error instanceof Error ? error.message : "Mass accept failed",
        );
        break;
      }
    }

    setEmailProgress(
      `Approved ${approved}. Emailed ${emailed}.${failed > 0 ? ` ${failed} could not be delivered.` : ""}`,
    );
    setEmailSending(false);
    setSelectedIds(new Set());
    utils.hackathon.adminGetAttendees.invalidate();
    utils.hackathon.analytics.invalidate({ hackathonId });
    utils.hackathon.getById.invalidate({ id: hackathonId });
    utils.hackathon.listAll.invalidate();
    utils.hackathon.waveStatus.invalidate({ hackathonId });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const pageFullySelected =
    filteredAttendees.length > 0 &&
    filteredAttendees.every((a) => selectedIds.has(a.id));

  const selectAllVisible = () => {
    if (pageFullySelected) {
      setSelectedIds(new Set());
      setSelectedAllMatching(false);
    } else {
      setSelectedIds(new Set(filteredAttendees.map((a) => a.id)));
    }
  };

  /**
   * Extends the selection past the current page to everything matching the
   * filter.
   *
   * The ids are fetched rather than inferred: the mutation stays id-based, so
   * the set is fixed at the moment the organiser chose it and cannot quietly
   * grow if somebody registers while they are reading the confirmation.
   */
  const selectAllMatching = async () => {
    setBulkError(null);
    try {
      const ids = await utils.hackathon.adminGetAttendeeIds.fetch({
        hackathonId,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setSelectedIds(new Set(ids));
      setSelectedAllMatching(true);
    } catch (error) {
      setBulkError(
        error instanceof Error ? error.message : "Could not select all",
      );
    }
  };

  // Both of these change which rows match, so the current page number stops
  // meaning anything — landing on page 8 of a 2-page result shows nothing.
  const changeFilter = (next: "all" | RegistrationStatus) => {
    setStatusFilter(next);
    setPage(0);
    setSelectedIds(new Set());
    setSelectedAllMatching(false);
  };

  /**
   * Turning the page drops the selection.
   *
   * Ids from page 1 surviving onto page 2 is how "Reject all" rejects fifty
   * people the organiser is not looking at: the rows on screen render
   * unchecked while the bar still reads "50 selected". A selection that spans
   * the whole roster is made explicitly through the banner instead, which says
   * so in words.
   */
  const goToPage = (next: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
    if (!selectedAllMatching) {
      setSelectedIds(new Set());
    }
  };

  const changeSearch = (next: string) => {
    setSearchQuery(next);
    setPage(0);
    // A selection made under the old filter no longer means what its banner
    // says, so it is dropped rather than silently re-labelled.
    setSelectedIds(new Set());
    setSelectedAllMatching(false);
  };

  const th = "px-3 py-2.5 text-[13px] font-medium text-[var(--text-subtle)]";
  const rowAction =
    "rounded-[var(--radius-sm)] border border-[var(--border-medium)] px-2.5 py-1 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const rowActionDanger =
    "rounded-[var(--radius-sm)] border border-[var(--danger)]/40 px-2.5 py-1 text-[13px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-glow)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const detailLabel = "text-[13px] font-medium text-[var(--text-subtle)] mb-1";
  const detailGroup =
    "border-t border-[var(--border-subtle)] pt-3 text-[13px] font-semibold text-[var(--text-primary)]";

  return (
    <div className="space-y-8">
      <RegistrationControls hackathonId={hackathonId} status={status} />

      {announced ? (
        <section className={sectionRule}>
          <h2 className={sectionTitle}>Interest list</h2>
          <p className={`mt-1 mb-6 max-w-2xl ${body}`}>
            People who asked to be told when{" "}
            <span className="text-[var(--text-primary)]">{hackathonName}</span>{" "}
            opens. This is not an application queue; opening registration lets
            them apply.
          </p>
          {interestLoading ? (
            <p className={body}>Loading this edition&apos;s list…</p>
          ) : (interestRows?.length ?? 0) === 0 ? (
            <p className={body}>
              Nobody has joined this edition yet. The public form writes here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className={`${th} pl-0`}>Name</th>
                    <th className={th}>Email</th>
                    <th className={th}>School</th>
                    <th className={th}>Country</th>
                    <th className={`${th} text-right`}>Grad year</th>
                    <th className={th}>Experience</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-muted)]">
                  {interestRows?.map((row) => (
                    <tr
                      key={row.userId}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <td className="py-2.5 pr-3 text-[var(--text-primary)]">
                        {row.name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">{row.email}</td>
                      <td className="px-3 py-2.5">{row.school ?? "—"}</td>
                      <td className="px-3 py-2.5">{row.country ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.graduationYear ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">{row.experience ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
      <AcceptanceWaves hackathonId={hackathonId} />

      <AttendeeStats
        stats={stats}
        statusFilter={statusFilter}
        onFilterChange={changeFilter}
      />

      {/* Header + Actions */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 ${sectionRule}`}>
        <div>
          <h2 className={sectionTitle}>Applications</h2>
          <p className={`mt-1 tabular-nums ${meta}`}>
            {matching === 0
              ? "No matching registrations."
              : `Showing ${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + filteredAttendees.length} of ${matching}`}
            {isFetching && " · updating…"}
          </p>
        </div>
        <button
          type="button"
          onClick={exportToCSV}
          disabled={exporting}
          className={btnSecondary}
        >
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Bulk actions for the current selection. */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-y border-[var(--border-subtle)] py-3">
          <span className="mr-1 text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleMassAccept}
            disabled={readOnly || emailSending || batchUpdateStatus.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {emailSending ? "Sending…" : "Accept and email"}
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("approved")}
            disabled={readOnly || batchUpdateStatus.isPending}
            title={
              readOnly
                ? READ_ONLY_TITLE
                : "Sets the status only. No email is sent; use Accept and email to notify."
            }
            className={btnSecondary}
          >
            Approve without email
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("waitlisted")}
            disabled={readOnly || batchUpdateStatus.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            Waitlist
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("rejected")}
            disabled={readOnly || batchUpdateStatus.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnDanger}
          >
            Reject
          </button>
        </div>
      )}

      {/* Without this, "select all" silently means "select this page" and a
          bulk approve covers 50 of 2000 while reporting success. */}
      {pageFullySelected && matching > filteredAttendees.length && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
          {selectedAllMatching ? (
            <>
              <span className="tabular-nums">
                All {selectedIds.size} matching applicant(s) are selected.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectedAllMatching(false);
                }}
                className={textLink}
              >
                Clear selection
              </button>
            </>
          ) : (
            <>
              <span className="tabular-nums">
                All {filteredAttendees.length} on this page are selected.
              </span>
              <button
                type="button"
                onClick={selectAllMatching}
                className={textLink}
              >
                Select all {matching} matching
              </button>
            </>
          )}
        </div>
      )}

      {bulkError && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          That action did not go through: {bulkError}
        </p>
      )}

      {emailProgress && (
        <p
          role="status"
          className="border-l-2 border-accent pl-3 text-[15px] tabular-nums text-[var(--text-primary)]"
        >
          {emailProgress}
        </p>
      )}

      {/* Search */}
      <div className="max-w-xl">
        <input
          type="search"
          aria-label="Search attendees"
          placeholder="Search by name, email, school, major or response"
          value={searchQuery}
          onChange={(e) => changeSearch(e.target.value)}
          className={input}
        />
      </div>

      {/* placeholderData keeps the previous rows as `data`, so a failed
          refetch after a filter, page or search change would otherwise show
          them as if they were the new results. */}
      {isError && data && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-[var(--danger)] pl-3"
        >
          <p className="text-[15px] text-[var(--danger)]">
            Couldn&apos;t load these results. The rows below are from before.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className={btnSecondary}
          >
            Try again
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[900px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`${th} w-10`}>
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  // Page-level, not roster-level: size equality would read as
                  // unchecked whenever the selection is the whole roster.
                  checked={pageFullySelected}
                  onChange={selectAllVisible}
                  className="w-4 h-4 rounded-sm accent-[var(--accent)] cursor-pointer align-middle"
                />
              </th>
              <th className={`${th} w-8`}>
                <span className="sr-only">Details</span>
              </th>
              <th className={th}>Applicant</th>
              <th className={th}>Status</th>
              <th className={th}>School and major</th>
              <th className={`${th} text-right`}>Applied</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttendees.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-3 py-12 ${body}`}>
                  No registrations match this search or filter.
                </td>
              </tr>
            ) : (
              filteredAttendees.map((attendee) => (
                <React.Fragment key={attendee.id}>
                  <tr
                    className={`border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
                      selectedIds.has(attendee.id)
                        ? "bg-[var(--accent-dim)]"
                        : "hover:bg-[var(--bg-secondary)]"
                    }`}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(attendee.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(attendee.id)}
                        onChange={() => toggleSelect(attendee.id)}
                        className="w-4 h-4 rounded-sm accent-[var(--accent)] cursor-pointer align-middle"
                      />
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      {expandedRow === attendee.id ? (
                        <ChevronUp
                          size={16}
                          strokeWidth={1.75}
                          className="text-[var(--text-primary)]"
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          strokeWidth={1.75}
                          className="text-[var(--text-subtle)]"
                        />
                      )}
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Image
                          src={
                            attendee.user?.image || "/avatars/default.svg"
                          }
                          alt="Avatar"
                          width={32}
                          height={32}
                          className="rounded-full bg-[var(--bg-secondary)] shrink-0"
                        />
                        <div>
                          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                            {attendee.firstName && attendee.lastName
                              ? `${attendee.firstName} ${attendee.lastName}`
                              : attendee.user?.name || "Unknown user"}
                          </p>
                          <p className={meta}>
                            {attendee.user?.email || "No email"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      <StatusBadge status={attendee.registrationStatus} />
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      <p className="text-[var(--text-primary)] max-w-[200px] truncate">
                        {attendee.school || "N/A"}
                      </p>
                      <p className={`truncate max-w-[200px] ${meta}`}>
                        {attendee.major || "N/A"}
                      </p>
                    </td>
                    <td
                      className="px-3 py-3 text-right tabular-nums text-[var(--text-muted)]"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      {new Date(attendee.registeredAt).toLocaleDateString()}
                    </td>
                    <td
                      className="px-3 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {attendee.registrationStatus !== "approved" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "approved")
                            }
                            disabled={readOnly || updateStatus.isPending}
                            title={
                              readOnly
                                ? READ_ONLY_TITLE
                                : "Approve (no email). Use Accept and email to notify."
                            }
                            aria-label="Approve (no email)"
                            className={rowAction}
                          >
                            Approve
                          </button>
                        )}
                        {attendee.registrationStatus !== "waitlisted" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "waitlisted")
                            }
                            disabled={readOnly || updateStatus.isPending}
                            title={readOnly ? READ_ONLY_TITLE : "Waitlist"}
                            className={rowAction}
                          >
                            Waitlist
                          </button>
                        )}
                        {/* Checking somebody in by hand. The door scan does
                            this on its own, but it needs an event to scan
                            them into — and submitting a project requires the
                            status, so there has to be a path that does not
                            depend on the schedule existing yet. Offered only
                            for people who have been accepted; the server
                            refuses the rest. */}
                        {attendee.registrationStatus === "approved" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "checked_in")
                            }
                            disabled={readOnly || updateStatus.isPending}
                            title={readOnly ? READ_ONLY_TITLE : "Check in"}
                            className={rowAction}
                          >
                            Check in
                          </button>
                        )}
                        {attendee.registrationStatus !== "rejected" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "rejected")
                            }
                            disabled={readOnly || updateStatus.isPending}
                            title={readOnly ? READ_ONLY_TITLE : "Reject"}
                            className={rowActionDanger}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedRow === attendee.id && (
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                      <td colSpan={7} className="p-0">
                        <div className="px-4 py-6 md:px-8 whitespace-normal">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Application Details */}
                            <div className="space-y-4">
                              <h4 className={detailGroup}>
                                Application details
                              </h4>
                              <div>
                                <p className={detailLabel}>Education</p>
                                <p className="text-sm text-[var(--text-primary)]">
                                  {attendee.school} · {attendee.levelOfStudy}
                                </p>
                                <p className="text-sm text-[var(--text-muted)]">
                                  {attendee.major} (class of{" "}
                                  {attendee.graduationYear})
                                </p>
                              </div>
                              <div>
                                <p className={detailLabel}>Personal</p>
                                <p className="text-sm text-[var(--text-primary)]">
                                  {attendee.age} years old ·{" "}
                                  {attendee.gender || "Not specified"}
                                </p>
                                <p className="text-sm text-[var(--text-primary)]">
                                  {attendee.country}
                                </p>
                                <p className="text-sm tabular-nums text-[var(--text-muted)] mt-1">
                                  {attendee.phone}
                                </p>
                              </div>
                            </div>

                            {/* Experience & Logistics */}
                            <div className="space-y-4">
                              <h4 className={detailGroup}>
                                Logistics and links
                              </h4>
                              <div className="flex flex-wrap gap-4">
                                {attendee.resumeUrl && (
                                  <a
                                    href={attendee.resumeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={textLink}
                                  >
                                    Resume
                                    <ExternalLink
                                      size={14}
                                      strokeWidth={1.75}
                                      aria-hidden="true"
                                    />
                                  </a>
                                )}
                                {attendee.githubUrl && (
                                  <a
                                    href={attendee.githubUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={textLink}
                                  >
                                    GitHub
                                    <ExternalLink
                                      size={14}
                                      strokeWidth={1.75}
                                      aria-hidden="true"
                                    />
                                  </a>
                                )}
                                {attendee.linkedinUrl && (
                                  <a
                                    href={attendee.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={textLink}
                                  >
                                    LinkedIn
                                    <ExternalLink
                                      size={14}
                                      strokeWidth={1.75}
                                      aria-hidden="true"
                                    />
                                  </a>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                  <p className={detailLabel}>Shirt size</p>
                                  <p className="text-sm text-[var(--text-primary)]">
                                    {attendee.shirtSize || "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <p className={detailLabel}>Dietary</p>
                                  <p className="text-sm text-[var(--text-primary)]">
                                    {(attendee.dietaryRestrictions || []).join(
                                      ", ",
                                    ) || "None"}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className={detailLabel}>Emergency contact</p>
                                <p className="text-sm text-[var(--text-primary)]">
                                  {attendee.emergencyContact}
                                </p>
                                <p className="text-sm tabular-nums text-[var(--text-muted)]">
                                  {attendee.emergencyPhone}
                                </p>
                              </div>
                            </div>

                            {/* Questionnaire Response */}
                            <div className="space-y-4 lg:col-span-1 md:col-span-2">
                              <h4 className={detailGroup}>Questionnaire</h4>
                              <div>
                                <p className={detailLabel}>
                                  Hackathons attended
                                </p>
                                <p className="text-sm tabular-nums text-[var(--text-primary)]">
                                  {attendee.hackathonsAttended ?? 0}
                                </p>
                              </div>
                              <div>
                                <p className={detailLabel}>
                                  Why do you want to attend?
                                </p>
                                <p className="border-l-2 border-[var(--border-medium)] pl-3 text-sm text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed">
                                  {attendee.whyAttend
                                    ? `"${attendee.whyAttend}"`
                                    : "No answer provided."}
                                </p>
                              </div>

                              {/* Quick action buttons in expanded view */}
                              <div className="pt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)]">
                                <span className="mr-1 text-[13px] font-medium text-[var(--text-subtle)]">
                                  Decision
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(attendee.id, "approved")
                                  }
                                  disabled={
                                    readOnly ||
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "approved"
                                  }
                                  title={
                                    readOnly
                                      ? READ_ONLY_TITLE
                                      : "Sets the status only. No email is sent; use Accept and email to notify."
                                  }
                                  className={rowAction}
                                >
                                  Approve without email
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(
                                      attendee.id,
                                      "waitlisted",
                                    )
                                  }
                                  disabled={
                                    readOnly ||
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "waitlisted"
                                  }
                                  title={readOnly ? READ_ONLY_TITLE : undefined}
                                  className={rowAction}
                                >
                                  Waitlist
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(attendee.id, "rejected")
                                  }
                                  disabled={
                                    readOnly ||
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "rejected"
                                  }
                                  title={readOnly ? READ_ONLY_TITLE : undefined}
                                  className={rowActionDanger}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav
          aria-label="Attendee pages"
          className="flex items-center justify-between gap-4"
        >
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page === 0 || isFetching}
            className={btnSecondary}
          >
            Previous
          </button>
          <span className={`tabular-nums ${meta}`}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount - 1 || isFetching}
            className={btnSecondary}
          >
            Next
          </button>
        </nav>
      )}
        </>
      )}
    </div>
  );
}
