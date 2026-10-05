"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { ModalWrapper } from "./ModalWrapper";
import {
  btnPrimary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
} from "./ui";

const removeButton =
  "shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-[13px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-glow)] disabled:opacity-50";

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
  const readOnly = useReadOnly();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const roster = trpc.events.attendees.useQuery({ eventId });

  const refresh = async () => {
    await Promise.all([
      utils.events.attendees.invalidate({ eventId }),
      utils.events.listAll.invalidate(),
      // Opened from the bootcamp page too, whose grid counts these rows.
      utils.bootcamp.attendance.invalidate(),
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
          <p className={label}>Attendance</p>
          <h2 className={`${itemTitle} mt-1`}>{eventTitle}</h2>
        </div>

        <div>
          <label htmlFor="attendance-email" className={fieldLabel}>
            Check someone in by email
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
                if (e.key === "Enter" && email.trim() && !readOnly) {
                  checkIn.mutate({ eventId, email: email.trim() });
                }
              }}
              placeholder="them@gatech.edu"
              className={`${input} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => checkIn.mutate({ eventId, email: email.trim() })}
              disabled={
                readOnly || checkIn.isPending || email.trim().length === 0
              }
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={`${btnPrimary} shrink-0`}
            >
              {checkIn.isPending ? "Checking in…" : "Check in"}
            </button>
          </div>
          <p className={fieldHint}>
            Recorded as a manual check-in. They don&apos;t need to be a member,
            but they must have signed in to the portal at least once.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-[var(--danger-glow)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        {notice && !error && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {notice}
          </p>
        )}

        <div>
          <p className={`${label} tabular-nums`}>
            Checked in ({roster.data?.matching ?? 0})
          </p>

          {roster.isLoading ? (
            <p className={`${meta} mt-2`}>Loading the list…</p>
          ) : attendees.length === 0 ? (
            <p className={`${meta} mt-2`}>Nobody has checked in yet.</p>
          ) : (
            <ul className="mt-2 max-h-64 overflow-y-auto border-t border-[var(--border-subtle)]">
              {attendees.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] text-[var(--text-primary)]">
                      {row.user?.name ?? row.user?.email ?? "Unknown"}
                    </p>
                    <p className={`${meta} truncate`}>
                      {row.user?.email} · {row.checkInMethod}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      row.user &&
                      remove.mutate({ eventId, userId: row.user.id })
                    }
                    disabled={readOnly || remove.isPending}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={removeButton}
                  >
                    Remove
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
