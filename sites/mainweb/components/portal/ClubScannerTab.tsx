"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "./LiquidGlass";
import { QRScannerModal } from "./QRScannerModal";

type Outcome = {
  ok: boolean;
  message: string;
  warning?: string;
};

/** Officer-side check-in for one club event: scan a member pass, or type an email. */
export function ClubScannerTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
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
    <div className="space-y-6">
      <LiquidGlass className="p-8 text-center">
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Scan the member pass from their portal, or check somebody in by email.
        </p>

        <button
          type="button"
          onClick={() => {
            setOutcome(null);
            setScanning(true);
          }}
          disabled={busy}
          className="px-8 py-4 bg-accent text-black font-black text-xs uppercase tracking-widest rounded-none hover:bg-accent/90 transition-colors disabled:opacity-40"
        >
          {busy ? "Checking in..." : "Scan Member Pass"}
        </button>

        <div className="mt-6 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && email.trim()) {
                manual.mutate({ eventId, email: email.trim() });
              }
            }}
            placeholder="or check in by email"
            className="flex-1 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => manual.mutate({ eventId, email: email.trim() })}
            disabled={manual.isPending || email.trim().length === 0}
            className="px-5 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-mono uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {outcome && (
          <div
            role="status"
            className={`mt-6 px-4 py-3 border text-sm font-mono ${
              outcome.ok
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {outcome.message}
            {outcome.warning && (
              <span className="block mt-1 text-amber-400">
                {outcome.warning}
              </span>
            )}
          </div>
        )}
      </LiquidGlass>

      <LiquidGlass className="p-6">
        <p className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono mb-3">
          Checked in ({roster.data?.matching ?? 0})
        </p>

        {attendees.length === 0 ? (
          <p className="text-xs font-mono text-[var(--text-subtle)]">
            Nobody yet.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {attendees.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 py-3"
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
                    row.user && remove.mutate({ eventId, userId: row.user.id })
                  }
                  disabled={remove.isPending}
                  className="shrink-0 px-3 py-2 border border-red-500/20 text-red-400 text-[10px] font-mono uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </LiquidGlass>

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
