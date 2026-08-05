"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { useParams, useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

export default function AdminAttendeeViewer() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const hackathonId = params?.id as string;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: portalContext, isLoading: portalLoading } = usePortalContext();
  const { data: hackathon, isLoading: loadingHackathon } =
    trpc.hackathon.getById.useQuery(
      { id: hackathonId },
      { enabled: !!hackathonId },
    );
  const { data: attendees, isLoading: loadingAttendees, refetch } =
    trpc.hackathon.adminGetAttendees.useQuery(
      { hackathonId },
      { enabled: !!hackathonId && !!portalContext?.isAdmin },
    );

  const massAcceptMutation = trpc.hackathon.sendMassAcceptanceEmails.useMutation({
    onSuccess: (result) => {
      setSelectedIds(new Set());
      refetch();
      // Show what the server actually did: ids that belong to another
      // hackathon are skipped, and silently reporting success for them hides
      // acceptances that never went out.
      alert(result.message);
    },
    onError: (e) => alert("Error: " + e.message)
  });

  if (
    authStatus === "loading" ||
    portalLoading ||
    loadingHackathon ||
    loadingAttendees
  ) {
    return <LoadingScreen message="Loading Attendee Data..." />;
  }

  if (!session || !portalContext?.isAdmin || !hackathon) {
    router.push("/dashboard");
    return null;
  }

  const handleSelectAll = () => {
    if (attendees) {
      if (selectedIds.size === attendees.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(attendees.map(a => a.id)));
      }
    }
  };

  const handleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleMassAccept = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to accept and send emails to ${selectedIds.size} participants?`)) {
      massAcceptMutation.mutate({
        hackathonId,
        participantIds: Array.from(selectedIds)
      });
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
          {hackathon.name} <span className="text-accent italic">Attendees</span>
        </h1>
        <button
          onClick={handleMassAccept}
          disabled={selectedIds.size === 0 || massAcceptMutation.isPending}
          className="px-6 py-3 bg-gradient-to-r from-accent to-emerald-500 text-[var(--bg-primary)] font-bold text-sm hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {massAcceptMutation.isPending ? "Sending..." : `Mass Accept & Email (${selectedIds.size})`}
        </button>
      </div>

      <LiquidGlass className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] font-mono text-xs uppercase tracking-widest text-text-muted">
              <tr>
                <th className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={attendees && attendees.length > 0 && selectedIds.size === attendees.length}
                    onChange={handleSelectAll}
                    className="accent-accent"
                  />
                </th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {attendees && attendees.length > 0 ? (
                attendees.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(attendee.id)}
                        onChange={() => handleSelect(attendee.id)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="px-6 py-4 font-medium">{attendee.user?.name || "No Name"}</td>
                    <td className="px-6 py-4 text-text-muted">{attendee.user?.email || "No Email"}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm ${
                        attendee.registrationStatus === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                        attendee.registrationStatus === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-gray-500/20 text-gray-400"
                      }`}>
                        {attendee.registrationStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-muted">{attendee.team?.name || "Solo"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-text-muted">
                    No attendees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LiquidGlass>
    </div>
  );
}
