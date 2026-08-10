"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModalWrapper } from "./ModalWrapper";

/**
 * Officer-side attendance for a club event.
 *
 * The QR path only records people who are signed in and scanning for
 * themselves, so a queue at the door, a flat phone battery or a guest at a
 * recruiting event all ended with nothing written down.
 */
export function EventAttendanceModal({
  eventId,
  eventTitle,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const roster = trpc.events.attendees.useQuery({ eventId });

  const refresh = async () => {
    await Promise.all([
      utils.events.attendees.invalidate({ eventId }),
      utils.events.listAll.invalidate(),
    ]);
  };

  const checkIn = trpc.events.manualCheckIn.useMutation({
    onSuccess: async (result) => {
      setEmail("");
      setError(null);
      setNotice(
        result.isMember
          ? `${result.name} checked in.`
          : `${result.name} checked in — not a member yet.`,
      );
      await refresh();
    },
    onError: (e) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const remove = trpc.events.removeAttendance.useMutation({
    onSuccess: async () => {
      setError(null);
      setNotice("Check-in removed.");
      await refresh();
    },
    onError: (e) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const attendees = roster.data?.attendees ?? [];

  return (
    <ModalWrapper onClose={onClose} maxWidth="2xl">
      <div className="space-y-6">
        <div>
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1">
            Attendance
          </p>
          <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight">
            {eventTitle}
          </h2>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="attendance-email"
            className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
          >
            Check somebody in
          </label>
          <div className="flex gap-2">
            <input
              id="attendance-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email.trim()) {
                  checkIn.mutate({ eventId, email: email.trim() });
                }
              }}
              placeholder="them@gatech.edu"
              className="flex-1 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent focus:outline-none transition-ui"
            />
            <button
              type="button"
              onClick={() => checkIn.mutate({ eventId, email: email.trim() })}
              disabled={checkIn.isPending || email.trim().length === 0}
              className="px-6 py-3 bg-accent text-black font-black text-xs uppercase tracking-widest rounded-none hover:bg-accent/90 transition-ui disabled:opacity-40"
            >
              {checkIn.isPending ? "…" : "Check In"}
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--text-subtle)]">
            Recorded as a manual check-in. Membership is not required — they do
            need to have signed in to the portal at least once.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300"
          >
            {error}
          </p>
        )}

        {notice && !error && (
          <p className="border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-mono text-accent">
            {notice}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
            Checked in ({roster.data?.matching ?? 0})
          </p>

          {roster.isLoading ? (
            <p className="text-xs font-mono text-[var(--text-subtle)]">
              Loading roster...
            </p>
          ) : attendees.length === 0 ? (
            <p className="text-xs font-mono text-[var(--text-subtle)]">
              Nobody has checked in yet.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)]">
              {attendees.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {row.user?.name ?? row.user?.email ?? "Unknown"}
                    </p>
                    <p className="text-[10px] font-mono text-[var(--text-subtle)] truncate">
                      {row.user?.email} · {row.checkInMethod}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      row.user &&
                      remove.mutate({ eventId, userId: row.user.id })
                    }
                    disabled={remove.isPending}
                    className="shrink-0 px-3 py-2 border border-red-500/20 text-red-400 text-[10px] font-mono uppercase tracking-widest rounded-none hover:bg-red-500/10 transition-ui disabled:opacity-40"
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
