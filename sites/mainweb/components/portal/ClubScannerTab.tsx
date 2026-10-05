"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { QRScannerModal } from "./QRScannerModal";
import {
  body,
  btnPrimary,
  btnSecondary,
  input,
  label,
  meta,
  sectionRule,
} from "./ui";

type Outcome = {
  ok: boolean;
  message: string;
  warning?: string;
};

/** Officer-side check-in for one club event: scan a member pass, or type an email. */
export function ClubScannerTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const roster = trpc.events.attendees.useQuery({ eventId });
  const refresh = () => utils.events.attendees.invalidate({ eventId });

  const scanPass = trpc.events.scanMemberPass.useMutation({
    onSuccess: async (r) => {
      setOutcome({
        ok: true,
        message: `${r.name} checked in.`,
        warning: r.membershipActive ? undefined : "Membership is not active.",
      });
      await refresh();
    },
    onError: (e) => setOutcome({ ok: false, message: e.message }),
    onSettled: () => setBusy(false),
  });

  const manual = trpc.events.manualCheckIn.useMutation({
    onSuccess: async (r) => {
      setEmail("");
      setOutcome({
        ok: true,
        message: `${r.name} checked in.`,
        warning: r.isMember ? undefined : "Not a member yet.",
      });
      await refresh();
    },
    onError: (e) => setOutcome({ ok: false, message: e.message }),
  });

  const remove = trpc.events.removeAttendance.useMutation({
    onSuccess: async () => {
      setOutcome({ ok: true, message: "Check-in removed." });
      await refresh();
    },
    onError: (e) => setOutcome({ ok: false, message: e.message }),
  });

  const attendees = roster.data?.attendees ?? [];

  return (
    <div className="space-y-10">
      <section>
        <p className={`${body} max-w-lg`}>
          Scan the member pass from their portal, or check someone in by email.
        </p>

        <button
          type="button"
          onClick={() => {
            setOutcome(null);
            setScanning(true);
          }}
          disabled={readOnly || busy}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`${btnPrimary} mt-5`}
        >
          {busy ? "Checking in…" : "Scan member pass"}
        </button>

        <div className="mt-6 flex max-w-lg gap-2">
          <input
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                email.trim() &&
                !manual.isPending &&
                !readOnly
              ) {
                manual.mutate({ eventId, email: email.trim() });
              }
            }}
            placeholder="Or check in by email"
            aria-label="Check in by email"
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => manual.mutate({ eventId, email: email.trim() })}
            disabled={
              readOnly || manual.isPending || email.trim().length === 0
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`${btnSecondary} shrink-0`}
          >
            Check in
          </button>
        </div>

        {outcome && (
          <div
            role="status"
            className={`mt-6 max-w-lg rounded-[var(--radius-sm)] px-4 py-3 text-sm ${
              outcome.ok
                ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                : "bg-[var(--danger-glow)] text-[var(--danger)]"
            }`}
          >
            {outcome.message}
            {outcome.warning && (
              <span className="mt-1 block font-semibold text-[var(--warning)]">
                {outcome.warning}
              </span>
            )}
          </div>
        )}
      </section>

      <section className={sectionRule}>
        <p className={`${label} tabular-nums`}>
          Checked in ({roster.data?.matching ?? 0})
        </p>

        {attendees.length === 0 ? (
          <p className={`${meta} mt-2`}>Nobody has checked in yet.</p>
        ) : (
          <ul className="mt-2 max-h-72 overflow-y-auto border-t border-[var(--border-subtle)]">
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
                    row.user && remove.mutate({ eventId, userId: row.user.id })
                  }
                  disabled={readOnly || remove.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-[13px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-glow)] disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {scanning && (
        <QRScannerModal
          onClose={() => setScanning(false)}
          onScan={(codes) => {
            const value = codes[0]?.rawValue;
            if (!value || busy) return;
            setBusy(true);
            setScanning(false);
            scanPass.mutate({ eventId, passCode: value });
          }}
        />
      )}
    </div>
  );
}
