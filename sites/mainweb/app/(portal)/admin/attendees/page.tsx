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
    if (selectedEvent) {
      // CSV export logic would go here
      // TODO: Implement CSV export logic
    }
  };

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-r from-red-900/10 via-red-900/5 to-transparent blur-[300px] rounded-sm" />
          <div className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-r from-red-900/10 via-red-900/8 to-transparent blur-[250px] rounded-sm" />
        </div>

        {/* Page Header */}
        <div className="relative mb-6 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-red-500/5 via-red-900/10 to-transparent rounded-none overflow-hidden group hover:border-red-500/20 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-red-500/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <QrCode className="w-3 h-3" /> Club Events
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-red-500 group-hover:via-red-400 group-hover:to-red-500 transition-all duration-500">
            Attendees{" "}
            <span className="text-red-500 italic font-bold">Registry</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            View and manage attendee registrations for club events.
          </p>
          {/* Decorative Corner Accent */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-red-500/5 rounded-sm blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <div className="space-y-6">
          {/* Event Selector - Enhanced */}
          <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none p-1.5 group-hover:border-white/20 transition-colors">
              <select
                value={selectedEvent || ""}
                onChange={(e) => setSelectedEvent(e.target.value || null)}
                className="bg-transparent text-[var(--text-primary)] text-sm font-medium px-5 py-3 focus:outline-none cursor-pointer hover:text-[var(--text-primary)] transition-all"
              >
                <option value="">Select a club event...</option>
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
                className="flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-red-500/10 to-red-500/10 border border-red-500/25 hover:border-red-500/40 text-red-500 text-sm font-medium rounded-none hover:bg-red-500/20 transition-all active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_25px_rgba(239,68,68,0.25)]"
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
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-red-900/5 to-transparent animate-pulse" />
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
              <div className="overflow-x-auto rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)]/20 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.02] via-transparent to-red-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/5 rounded-sm blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
                                attendee.user?.image || "/avatars/default.png"
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
                          <span className="px-3 py-1 rounded-sm text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
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
