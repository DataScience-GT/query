"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Download, QrCode } from "lucide-react";

export default function AttendeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const { data: eventList } = trpc.events.listAll.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: eventData, isLoading } = trpc.events.getById.useQuery(
    selectedEvent ? { id: selectedEvent } : skipToken,
  );

  const attendees = eventData?.checkIns;

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleDownloadCSV = () => {
    if (!attendees || attendees.length === 0) return;

    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = attendees.map((a: NonNullable<typeof attendees>[number]) =>
      [
        a.member ? `${a.member.firstName} ${a.member.lastName}` : a.user?.name,
        a.user?.email,
        a.checkInMethod,
        a.checkedInAt ? new Date(a.checkedInAt).toISOString() : "",
      ].map(cell),
    );

    const csv = [
      // No "Points" column: every row carried the same schema default, so the
      // export presented a constant as though it were tracked data.
      ["Name", "Email", "Method", "Checked In At"].map(cell),
      ...rows,
    ]
      .map((r) => r.join(","))
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(eventData?.title ?? "event")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_attendees.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Without this the blob is retained for the lifetime of the page.
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-r from-accent/5 via-accent/2 to-transparent blur-[300px] rounded-sm" />
          <div className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-r from-accent/5 via-accent/4 to-transparent blur-[250px] rounded-sm" />
        </div>

        {/* Page Header */}
        <div className="relative mb-6 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/5 via-accent-dim to-transparent rounded-none overflow-hidden group hover:border-accent/25 transition-ui duration-500">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-accent/80 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <QrCode className="w-3 h-3" /> Club Events
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent group-hover:via-emerald-400 group-hover:to-accent transition-ui duration-500">
            Attendees{" "}
            <span className="text-accent italic font-bold">Registry</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            View and manage attendee check-ins for club meetings. Hackathon
            applications live on each edition&apos;s dashboard.
          </p>
          {/* Decorative Corner Accent */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-accent/5 rounded-sm blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <div className="space-y-6">
          {/* Event Selector - Enhanced */}
          <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none p-1.5 group-hover:border-white/20 transition-colors">
              <select
                aria-label="Filter attendees by club event"
                value={selectedEvent || ""}
                onChange={(e) => setSelectedEvent(e.target.value || null)}
                className="bg-transparent text-[var(--text-primary)] text-sm font-medium min-h-11 px-5 py-3 focus:outline-none cursor-pointer hover:text-[var(--text-primary)] transition-ui"
              >
                <option value="">Select a club event…</option>
                {eventList?.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedEvent && (
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-accent/10 to-accent/10 border border-accent/25 hover:border-accent/40 text-accent text-sm font-medium rounded-none hover:bg-accent/20 transition-ui active:scale-95 shadow-[0_0_20px_rgba(0,168,168,0.1)] hover:shadow-[0_0_25px_rgba(0,168,168,0.2)]"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* Attendees List - Enhanced */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-accent/5 via-accent-fade to-transparent animate-pulse" />
                <p className="relative text-text-muted font-mono text-sm animate-pulse">
                  Loading event check-ins...
                </p>
              </div>
            ) : !attendees || attendees.length === 0 ? (
              <LiquidGlass className="p-16 text-center">
                <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-[var(--border-subtle)]">
                  <svg
                    className="w-8 h-8 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-[var(--text-primary)] font-semibold mb-1">
                  No attendees yet
                </h3>
                <p className="text-text-muted text-sm">
                  Select an event to view check-ins.
                </p>
              </LiquidGlass>
            ) : (
              <div className="overflow-x-auto rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)]/20 relative overflow-hidden group hover:border-white/20 transition-ui duration-300">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-accent/[0.02] via-transparent to-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/5 rounded-sm blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <table className="w-full text-left">
                  <thead className="bg-[var(--bg-primary)]/30 border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">
                        Name
                      </th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">
                        Email
                      </th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">
                        Status
                      </th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">
                        Check-In Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {attendees.map((attendee) => (
                      <tr
                        key={attendee.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {}
                            <img
                              src={
                                attendee.user?.image || "/avatars/default.svg"
                              }
                              alt={attendee.user?.name || "Attendee"}
                              className="h-10 w-10 rounded-sm border border-[var(--border-subtle)] object-cover"
                            />
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">
                                {attendee.user?.name ||
                                  `${attendee.member?.firstName ?? ""} ${attendee.member?.lastName ?? ""}`.trim() ||
                                  "Unknown"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-muted)]">
                          {attendee.user?.email}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 rounded-sm text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Checked In
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-muted)]">
                          {attendee.checkedInAt
                            ? new Date(attendee.checkedInAt).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
