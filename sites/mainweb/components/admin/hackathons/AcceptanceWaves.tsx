"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Waves } from "lucide-react";

/**
 * Accept applicants in numbered waves: take the oldest N pending, approve them,
 * then mail that wave.
 *
 * Two calls rather than one. A send of hundreds can die inside a Cloud Run
 * request, and the wave must survive that — accepting is committed first, then
 * the mailer walks the same ids with per-row markers so pressing the button
 * again finishes the send instead of congratulating anybody twice.
 */
export function AcceptanceWaves({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const [size, setSize] = useState("150");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { data: status } = trpc.hackathon.waveStatus.useQuery({ hackathonId });
  const acceptWave = trpc.hackathon.acceptWave.useMutation();
  const sendEmails = trpc.hackathon.sendMassAcceptanceEmails.useMutation();

  const parsedSize = parseInt(size, 10);
  const validSize =
    Number.isFinite(parsedSize) && parsedSize > 0 && parsedSize <= 500;
  const pending = status?.pending ?? 0;
  const willTake = validSize ? Math.min(parsedSize, pending) : 0;

  const runWave = async () => {
    if (!validSize || willTake === 0) return;
    if (
      !window.confirm(
        `Accept the ${willTake} oldest pending application(s) as wave ${status?.nextWave ?? 1} and email them?\n\nAcceptance emails cannot be unsent.`,
      )
    )
      return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const wave = await acceptWave.mutateAsync({
        hackathonId,
        size: parsedSize,
      });

      if (wave.accepted === 0) {
        setResult(wave.message);
        return;
      }

      const sent = await sendEmails.mutateAsync({
        hackathonId,
        participantIds: wave.participantIds,
      });

      setResult(
        `Wave ${wave.wave}: ${wave.accepted} accepted, ${sent.emailed} emailed.` +
          (sent.failedEmails.length > 0
            ? ` ${sent.failedEmails.length} address(es) were rejected — press again to retry just those.`
            : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wave failed");
    } finally {
      setBusy(false);
      utils.hackathon.waveStatus.invalidate({ hackathonId });
      utils.hackathon.adminGetAttendees.invalidate();
      utils.hackathon.analytics.invalidate({ hackathonId });
    }
  };

  return (
    <LiquidGlass className="p-6 border-[var(--border-subtle)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2 mb-2">
            <Waves className="w-4 h-4 text-accent" />
            Acceptance Waves
          </h3>
          <p className="text-xs font-mono text-[var(--text-subtle)] leading-relaxed max-w-md">
            Takes the oldest pending applications first. Wave{" "}
            {status?.nextWave ?? 1} would accept{" "}
            <span className="text-[var(--text-primary)] font-bold">
              {willTake}
            </span>{" "}
            of {pending} pending.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label
              htmlFor="wave-size"
              className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Wave size
            </label>
            <input
              id="wave-size"
              type="number"
              min={1}
              max={500}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-28 px-3 py-2.5 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={runWave}
            disabled={busy || !validSize || willTake === 0}
            className="px-5 py-2.5 bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-wider rounded-none hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy
              ? "Working…"
              : pending === 0
                ? "Nothing pending"
                : `Accept + email wave ${status?.nextWave ?? 1}`}
          </button>
        </div>
      </div>

      {/* 500 is both the mailer's per-call ceiling and the daily limit of the
          account it sends through, so a bigger wave is refused, not truncated. */}
      {!validSize && (
        <p className="mt-4 text-[11px] font-mono text-amber-300/80">
          Wave size must be between 1 and 500.
        </p>
      )}

      {(status?.waves.length ?? 0) > 0 && (
        <div className="mt-6 pt-6 border-t border-[var(--border-subtle)] flex flex-wrap gap-x-6 gap-y-2">
          {status?.waves.map((wave) => (
            <span
              key={wave.wave}
              className="text-[11px] font-mono text-[var(--text-subtle)]"
            >
              <span className="text-[var(--text-primary)] font-bold">
                Wave {wave.wave}
              </span>{" "}
              · {wave.accepted} accepted · {wave.emailed} emailed
            </span>
          ))}
        </div>
      )}

      {result && (
        <p className="mt-4 text-xs font-mono text-accent border border-accent/30 bg-accent/5 px-3 py-2">
          {result}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 text-xs font-mono text-red-300 border border-red-500/30 bg-red-500/10 px-3 py-2"
        >
          {error}
        </p>
      )}
    </LiquidGlass>
  );
}
