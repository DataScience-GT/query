"use client";

import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { RegistrationControls } from "./RegistrationControls";
import { AttendeeStats } from "./AttendeeStats";
import { statusColors, statusIcon } from "./attendee-status";
import type { RegistrationStatus } from "./attendee-status";

export function AttendeesTab({
  hackathonId,
  hackathonName,
}: {
  hackathonId: string;
  hackathonName: string;
}) {
  const utils = trpc.useUtils();
  const { data: attendees, isLoading } =
    trpc.hackathon.adminGetAttendees.useQuery({ hackathonId });
  const updateStatus = trpc.hackathon.updateParticipantStatus.useMutation({
    onSuccess: () => {
      utils.hackathon.adminGetAttendees.invalidate({ hackathonId });
      utils.hackathon.getById.invalidate({ id: hackathonId });
      utils.hackathon.listAll.invalidate();
    },
  });

  const batchUpdateStatus =
    trpc.hackathon.batchUpdateParticipantStatus.useMutation({
      onSuccess: () => {
        utils.hackathon.adminGetAttendees.invalidate({ hackathonId });
        utils.hackathon.getById.invalidate({ id: hackathonId });
        utils.hackathon.listAll.invalidate();
        setSelectedIds(new Set());
      },
    });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RegistrationStatus>(
    "all",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Stats
  const stats = useMemo(() => {
    if (!attendees)
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        waitlisted: 0,
        checked_in: 0,
      };
    return {
      total: attendees.length,
      pending: attendees.filter((a) => a.registrationStatus === "pending")
        .length,
      approved: attendees.filter((a) => a.registrationStatus === "approved")
        .length,
      rejected: attendees.filter((a) => a.registrationStatus === "rejected")
        .length,
      waitlisted: attendees.filter((a) => a.registrationStatus === "waitlisted")
        .length,
      checked_in: attendees.filter((a) => a.registrationStatus === "checked_in")
        .length,
    };
  }, [attendees]);

  if (isLoading)
    return (
      <div className="text-[var(--text-subtle)] font-mono text-center py-20 animate-pulse">
        Loading Registry...
      </div>
    );

  const filteredAttendees =
    attendees?.filter((a) => {
      if (statusFilter !== "all" && a.registrationStatus !== statusFilter)
        return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (a.user?.name || "").toLowerCase().includes(q) ||
        (a.user?.email || "").toLowerCase().includes(q) ||
        (a.school || "").toLowerCase().includes(q) ||
        (a.major || "").toLowerCase().includes(q) ||
        (a.firstName || "").toLowerCase().includes(q) ||
        (a.lastName || "").toLowerCase().includes(q) ||
        (a.whyAttend || "").toLowerCase().includes(q)
      );
    }) || [];

  const exportToCSV = () => {
    if (!filteredAttendees || filteredAttendees.length === 0) return;
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
    type Attendee = (typeof filteredAttendees)[number];
    const rows = filteredAttendees.map((a: Attendee) => [
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
    batchUpdateStatus.mutate({
      hackathonId,
      participantIds: Array.from(selectedIds),
      status: newStatus,
    });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllVisible = () => {
    if (selectedIds.size === filteredAttendees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAttendees.map((a) => a.id)));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      <RegistrationControls hackathonId={hackathonId} />

      <AttendeeStats
        stats={stats}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Applications
          </h2>
          <p className="text-sm font-mono text-[var(--text-subtle)]">
            {filteredAttendees.length} of {attendees?.length || 0} registrations
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
                className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3 h-3" /> Approve All
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction("rejected")}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Reject All
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction("waitlisted")}
                className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
              >
                <Clock className="w-3 h-3" /> Waitlist All
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={exportToCSV}
            className="px-4 py-2 bg-white/5 border border-[var(--border-subtle)] hover:bg-white/10 transition-colors rounded-none font-mono text-xs uppercase tracking-wider font-bold text-[var(--text-primary)] flex items-center gap-2"
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
            Export CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1">
        <input
          type="search"
          aria-label="Search attendees"
          placeholder="Search by name, email, school, major, or response..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
                  checked={
                    selectedIds.size === filteredAttendees.length &&
                    filteredAttendees.length > 0
                  }
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
    </div>
  );
}
