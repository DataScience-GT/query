"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnInk,
  fieldLabel,
  input,
  sectionRule,
  sectionTitle,
} from "@/components/portal/ui";
import { MASS_EMAIL_BATCH } from "@query/api/email-limits";

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
    Number.isFinite(parsedSize) &&
    parsedSize > 0 &&
    parsedSize <= MASS_EMAIL_BATCH;
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
    <section className={sectionRule}>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className={sectionTitle}>Acceptance waves</h2>
          <p className={`mt-1 max-w-md ${body}`}>
            Takes the oldest pending applications first. Wave{" "}
            {status?.nextWave ?? 1} would accept{" "}
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">
              {willTake}
            </span>{" "}
            of <span className="tabular-nums">{pending}</span> pending.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="wave-size" className={fieldLabel}>
              Wave size
            </label>
            <input
              id="wave-size"
              type="number"
              min={1}
              max={MASS_EMAIL_BATCH}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={`min-h-11 tabular-nums ${input.replace("w-full", "w-28")}`}
            />
          </div>
          <button
            type="button"
            onClick={runWave}
            disabled={busy || !validSize || willTake === 0}
            className={btnInk}
          >
            {busy
              ? "Working…"
              : pending === 0
                ? "Nothing pending"
                : `Accept and email wave ${status?.nextWave ?? 1}`}
          </button>
        </div>
      </div>

      {/* The bound is the mailer's per-call ceiling, kept below the sending
          account's daily quota so a wave cannot exhaust it and take sign-in
          codes down with it. A bigger wave is refused, not truncated. */}
      {!validSize && (
        <p className="mt-4 text-[13px] text-[var(--warning)]">
          Wave size must be between 1 and {MASS_EMAIL_BATCH}.
        </p>
      )}

      {(status?.waves.length ?? 0) > 0 && (
        <ul className="mt-6 max-w-xl">
          {status?.waves.map((wave) => (
            <li
              key={wave.wave}
              className="flex items-baseline justify-between gap-6 border-b border-[var(--border-subtle)] py-2 text-[14px]"
            >
              <span className="font-semibold text-[var(--text-primary)]">
                Wave {wave.wave}
              </span>
              <span className="tabular-nums text-[var(--text-muted)]">
                {wave.accepted} accepted · {wave.emailed} emailed
              </span>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <p className="mt-4 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
          {result}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
