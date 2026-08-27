"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  X,
  Clock,
  Mail,
  QrCode,
} from "lucide-react";
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
import { statusColors, statusIcon } from "./attendee-status";
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

  const { data, isLoading, isFetching } =
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
    return (
      <div className="text-[var(--text-subtle)] font-mono text-center py-20 animate-pulse">
        Loading Registry...
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
    > = [];
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
   * Ids from page 1 surviving onto page 2 is how "Reject All" rejects fifty
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      <RegistrationControls hackathonId={hackathonId} status={status} />

      {announced ? (
        <LiquidGlass className="p-6 border-[var(--border-subtle)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Interest list
          </h2>
          <p className="text-sm font-mono text-[var(--text-subtle)] mt-1 mb-6">
            People who asked to be told when{" "}
            <span className="text-[var(--text-primary)]">{hackathonName}</span>{" "}
            opens. This is not an application queue — opening registration lets
            them apply.
          </p>
          {interestLoading ? (
            <p className="text-xs font-mono text-[var(--text-subtle)]">
              Loading this edition&apos;s list…
            </p>
          ) : (interestRows?.length ?? 0) === 0 ? (
            <p className="text-xs font-mono text-[var(--text-subtle)]">
              Nobody has joined this edition yet. The public form writes here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="text-[var(--text-subtle)] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Country</th>
                    <th className="py-2 pr-4">Grad</th>
                    <th className="py-2 pr-4">Experience</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-muted)]">
                  {interestRows?.map((row) => (
                    <tr
                      key={row.userId}
                      className="border-t border-[var(--border-subtle)]"
                    >
                      <td className="py-2 pr-4 text-[var(--text-primary)]">
                        {row.name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.school ?? "—"}</td>
                      <td className="py-2 pr-4">{row.country ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {row.graduationYear ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{row.experience ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LiquidGlass>
      ) : (
        <>
      <AcceptanceWaves hackathonId={hackathonId} />

      <AttendeeStats
        stats={stats}
        statusFilter={statusFilter}
        onFilterChange={changeFilter}
      />

      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Applications
          </h2>
          <p className="text-sm font-mono text-[var(--text-subtle)]">
            {matching === 0
              ? "No matching registrations"
              : `Showing ${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + filteredAttendees.length} of ${matching}`}
            {isFetching && " • updating…"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in duration-200">
              <span className="text-xs font-mono text-accent font-bold">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => handleBulkAction("approved")}
                disabled={batchUpdateStatus.isPending}
                className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" /> Approve All
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction("rejected")}
                disabled={batchUpdateStatus.isPending}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-3 h-3" /> Reject All
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction("waitlisted")}
                disabled={batchUpdateStatus.isPending}
                className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Clock className="w-3 h-3" /> Waitlist All
              </button>
              <button
                type="button"
                onClick={handleMassAccept}
                disabled={emailSending || batchUpdateStatus.isPending}
                className="px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-none text-xs font-bold uppercase tracking-wider hover:bg-accent/20 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mail className="w-3 h-3" />{" "}
                {emailSending ? "Sending…" : "Accept + Email"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={exportToCSV}
            disabled={exporting}
            className="px-4 py-2 bg-white/5 border border-[var(--border-subtle)] hover:bg-white/10 transition-colors rounded-none font-mono text-xs uppercase tracking-wider font-bold text-[var(--text-primary)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Without this, "select all" silently means "select this page" and a
          bulk approve covers 50 of 2000 while reporting success. */}
      {pageFullySelected && matching > filteredAttendees.length && (
        <div className="border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-mono text-accent flex flex-wrap items-center justify-between gap-3">
          {selectedAllMatching ? (
            <>
              <span>
                All {selectedIds.size} matching applicant(s) are selected.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectedAllMatching(false);
                }}
                className="underline underline-offset-4 hover:no-underline"
              >
                Clear selection
              </button>
            </>
          ) : (
            <>
              <span>
                All {filteredAttendees.length} on this page are selected.
              </span>
              <button
                type="button"
                onClick={selectAllMatching}
                className="font-bold underline underline-offset-4 hover:no-underline"
              >
                Select all {matching} matching
              </button>
            </>
          )}
        </div>
      )}

      {bulkError && (
        <div
          role="alert"
          className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300"
        >
          Bulk action failed: {bulkError}
        </div>
      )}

      {emailProgress && (
        <div
          role="status"
          className="border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-mono text-accent"
        >
          {emailProgress}
        </div>
      )}

      {/* Search */}
      <div className="flex-1">
        <input
          type="search"
          aria-label="Search attendees"
          placeholder="Search by name, email, school, major, or response…"
          value={searchQuery}
          onChange={(e) => changeSearch(e.target.value)}
          className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] placeholder:text-gray-600 focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {/* Table */}
      <LiquidGlass className="p-0 overflow-x-auto border-[var(--border-subtle)] relative z-10">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[900px]">
          <thead className="bg-[var(--bg-primary)]/40 border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-4 font-semibold w-10">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  // Page-level, not roster-level: size equality would read as
                  // unchecked whenever the selection is the whole roster.
                  checked={pageFullySelected}
                  onChange={selectAllVisible}
                  className="w-4 h-4 rounded border-white/20 bg-transparent accent-[var(--accent)] cursor-pointer"
                />
              </th>
              <th className="px-4 py-4 font-semibold w-8"></th>
              <th className="px-4 py-4 font-semibold">Applicant</th>
              <th className="px-4 py-4 font-semibold">Status</th>
              <th className="px-4 py-4 font-semibold">School & Major</th>
              <th className="px-4 py-4 font-semibold">Applied</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredAttendees.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-[var(--text-subtle)] font-mono italic"
                >
                  No registrations found.
                </td>
              </tr>
            ) : (
              filteredAttendees.map((attendee) => (
                <React.Fragment key={attendee.id}>
                  <tr
                    className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${selectedIds.has(attendee.id) ? "bg-accent/[0.03]" : ""}`}
                  >
                    <td
                      className="px-4 py-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(attendee.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(attendee.id)}
                        onChange={() => toggleSelect(attendee.id)}
                        className="w-4 h-4 rounded border-white/20 bg-transparent accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    <td
                      className="px-4 py-5"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      {expandedRow === attendee.id ? (
                        <ChevronUp className="w-5 h-5 text-accent" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-[var(--text-subtle)]" />
                      )}
                    </td>
                    <td
                      className="px-4 py-5"
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
                          width={40}
                          height={40}
                          className="rounded-sm bg-[var(--bg-primary)] shrink-0"
                        />
                        <div>
                          <p className="text-[var(--text-primary)] font-bold text-base">
                            {attendee.firstName && attendee.lastName
                              ? `${attendee.firstName} ${attendee.lastName}`
                              : attendee.user?.name || "Unknown User"}
                          </p>
                          <p className="text-[var(--text-subtle)] text-sm font-mono">
                            {attendee.user?.email || "No email"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td
                      className="px-4 py-5"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono font-bold uppercase tracking-wider ${statusColors(attendee.registrationStatus)}`}
                      >
                        {statusIcon(attendee.registrationStatus)}
                        {attendee.registrationStatus === "checked_in"
                          ? "Checked In"
                          : attendee.registrationStatus}
                      </span>
                    </td>
                    <td
                      className="px-4 py-5"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      <p className="text-gray-300 text-sm max-w-[200px] truncate">
                        {attendee.school || "N/A"}
                      </p>
                      <p className="text-[var(--text-muted)] text-xs truncate max-w-[200px] mt-0.5">
                        {attendee.major || "N/A"}
                      </p>
                    </td>
                    <td
                      className="px-4 py-5 text-sm font-mono text-[var(--text-muted)]"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === attendee.id ? null : attendee.id,
                        )
                      }
                    >
                      {new Date(attendee.registeredAt).toLocaleDateString()}
                    </td>
                    <td
                      className="px-4 py-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {attendee.registrationStatus !== "approved" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "approved")
                            }
                            disabled={updateStatus.isPending}
                            title="Approve"
                            className="p-2 rounded-none bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-ui disabled:opacity-50 hover:scale-110"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {attendee.registrationStatus !== "rejected" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "rejected")
                            }
                            disabled={updateStatus.isPending}
                            title="Reject"
                            className="p-2 rounded-none bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-ui disabled:opacity-50 hover:scale-110"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {attendee.registrationStatus !== "waitlisted" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(attendee.id, "waitlisted")
                            }
                            disabled={updateStatus.isPending}
                            title="Waitlist"
                            className="p-2 rounded-none bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-ui disabled:opacity-50 hover:scale-110"
                          >
                            <Clock className="w-3.5 h-3.5" />
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
                            disabled={updateStatus.isPending}
                            title="Check in"
                            className="p-2 rounded-none bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-ui disabled:opacity-50 hover:scale-110"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedRow === attendee.id && (
                    <tr className="bg-[var(--bg-primary)]/30">
                      <td colSpan={7} className="p-0">
                        <div className="p-6 md:p-8 animate-in fade-in duration-300 whitespace-normal">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Application Details */}
                            <div className="space-y-4">
                              <h4 className="text-xs uppercase font-bold tracking-widest text-accent border-b border-emerald-500/20 pb-2 mb-3">
                                Application Details
                              </h4>
                              <div>
                                <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                  Education
                                </p>
                                <p className="text-sm text-gray-200">
                                  {attendee.school} • {attendee.levelOfStudy}
                                </p>
                                <p className="text-sm text-[var(--text-muted)]">
                                  {attendee.major} (Class of{" "}
                                  {attendee.graduationYear})
                                </p>
                              </div>
                              <div>
                                <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                  Personal
                                </p>
                                <p className="text-sm text-gray-200">
                                  {attendee.age} years old •{" "}
                                  {attendee.gender || "Not specified"}
                                </p>
                                <p className="text-sm text-gray-200">
                                  {attendee.country}
                                </p>
                                <p className="text-sm text-[var(--text-muted)] mt-1">
                                  {attendee.phone}
                                </p>
                              </div>
                            </div>

                            {/* Experience & Logistics */}
                            <div className="space-y-4">
                              <h4 className="text-xs uppercase font-bold tracking-widest text-accent border-b border-emerald-500/20 pb-2 mb-3">
                                Logistics & Links
                              </h4>
                              <div className="flex gap-4">
                                {attendee.resumeUrl && (
                                  <a
                                    href={attendee.resumeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm font-bold text-accent hover:text-emerald-300 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />{" "}
                                    Resume
                                  </a>
                                )}
                                {attendee.githubUrl && (
                                  <a
                                    href={attendee.githubUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm font-bold text-accent hover:text-emerald-300 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />{" "}
                                    GitHub
                                  </a>
                                )}
                                {attendee.linkedinUrl && (
                                  <a
                                    href={attendee.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm font-bold text-accent hover:text-emerald-300 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />{" "}
                                    LinkedIn
                                  </a>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                  <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                    Shirt Size
                                  </p>
                                  <p className="text-sm text-gray-200 font-bold">
                                    {attendee.shirtSize || "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                    Dietary
                                  </p>
                                  <p className="text-sm text-gray-200">
                                    {(attendee.dietaryRestrictions || []).join(
                                      ", ",
                                    ) || "None"}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                  Emergency
                                </p>
                                <p className="text-sm text-gray-200">
                                  {attendee.emergencyContact}
                                </p>
                                <p className="text-sm text-[var(--text-muted)]">
                                  {attendee.emergencyPhone}
                                </p>
                              </div>
                            </div>

                            {/* Questionnaire Response */}
                            <div className="space-y-4 lg:col-span-1 md:col-span-2">
                              <h4 className="text-xs uppercase font-bold tracking-widest text-accent border-b border-emerald-500/20 pb-2 mb-3">
                                Questionnaire Response
                              </h4>
                              <div>
                                <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-1">
                                  Hackathons Attended
                                </p>
                                <p className="text-sm text-gray-200 font-mono bg-white/5 w-fit px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                                  {attendee.hackathonsAttended ?? 0}
                                </p>
                              </div>
                              <div>
                                <p className="text-[var(--text-subtle)] text-xs uppercase tracking-wider mb-2">
                                  Why do you want to attend?
                                </p>
                                <div className="bg-white/5 border border-[var(--border-subtle)] p-4 rounded-none">
                                  <p className="text-sm text-gray-300 italic whitespace-pre-wrap leading-relaxed">
                                    {attendee.whyAttend
                                      ? `"${attendee.whyAttend}"`
                                      : "No answer provided."}
                                  </p>
                                </div>
                              </div>

                              {/* Quick action buttons in expanded view */}
                              <div className="pt-4 flex items-center gap-3 border-t border-[var(--border-subtle)]">
                                <span className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                                  Quick Decision:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(attendee.id, "approved")
                                  }
                                  disabled={
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "approved"
                                  }
                                  className="px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                >
                                  <Check className="w-3 h-3" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(attendee.id, "rejected")
                                  }
                                  disabled={
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "rejected"
                                  }
                                  className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                >
                                  <X className="w-3 h-3" /> Reject
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
                                    updateStatus.isPending ||
                                    attendee.registrationStatus === "waitlisted"
                                  }
                                  className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                >
                                  <Clock className="w-3 h-3" /> Waitlist
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
      </LiquidGlass>

      {pageCount > 1 && (
        <nav
          aria-label="Attendee pages"
          className="flex items-center justify-between gap-4"
        >
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page === 0 || isFetching}
            className="px-4 py-2 bg-white/5 border border-[var(--border-subtle)] rounded-none font-mono text-xs uppercase tracking-wider font-bold text-[var(--text-primary)] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-widest">
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount - 1 || isFetching}
            className="px-4 py-2 bg-white/5 border border-[var(--border-subtle)] rounded-none font-mono text-xs uppercase tracking-wider font-bold text-[var(--text-primary)] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
