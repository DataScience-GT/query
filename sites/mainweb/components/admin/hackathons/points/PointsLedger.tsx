"use client";

import React, { useState } from "react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnInk,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
} from "@/components/portal/ui";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { pointsLabel, signedPoints } from "@/components/hackathon/points/format";
import { ParticipantSearch } from "./ParticipantSearch";

type Ledger = RouterOutputs["points"]["admin"]["ledger"];

const staffTime = (date: Date | string) =>
  new Date(date).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const METHOD: Record<string, string> = {
  scan: "Pass scan",
  code: "Event code",
  manual: "Checked in by name",
};

type Row = {
  key: string;
  at: number;
  title: string;
  detail: string;
  note: string | null;
  amount: number;
  voided: boolean;
};

function ledgerRows(ledger: Ledger): Row[] {
  const rows: Row[] = [
    ...ledger.attendance.map((row) => ({
      key: `event-${row.id}`,
      at: new Date(row.checkedInAt).getTime(),
      title: row.eventName,
      detail: [
        staffTime(row.checkedInAt),
        row.method ? METHOD[row.method] : "From before points",
        // A code is typed by the hacker; the name on it is their own.
        row.method !== "code" && row.checkedInByName
          ? `by ${row.checkedInByName}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      note: null,
      amount: row.pointsAwarded ?? 0,
      voided: false,
    })),
    ...ledger.adjustments.map((row) => ({
      key: `adjustment-${row.id}`,
      at: new Date(row.createdAt).getTime(),
      title: row.reason,
      detail: `${staffTime(row.createdAt)} · Adjustment${row.actorName ? ` by ${row.actorName}` : ""}`,
      note: null,
      amount: row.delta,
      voided: false,
    })),
    ...ledger.purchases.map((row) => ({
      key: `purchase-${row.id}`,
      at: new Date(row.createdAt).getTime(),
      title:
        row.quantity > 1 ? `${row.quantity} × ${row.itemName}` : row.itemName,
      detail: `${staffTime(row.createdAt)} · Store${row.actorName ? `, sold by ${row.actorName}` : ""}`,
      note: row.voidedAt
        ? `Voided${row.voidedByName ? ` by ${row.voidedByName}` : ""}${row.voidReason ? `: ${row.voidReason}` : ""}${row.restocked ? " (restocked)" : ""}`
        : null,
      amount: -row.total,
      voided: !!row.voidedAt,
    })),
  ];
  return rows.sort((a, b) => b.at - a.at);
}

/**
 * One hacker's points: the balance, every row behind it with who made it,
 * and a manual adjustment with a reason the hacker sees on their history.
 */
export function PointsLedger({
  hackathonId,
  participantId,
  onSelect,
}: {
  hackathonId: string;
  participantId: string | null;
  onSelect: (participantId: string | null) => void;
}) {
  return (
    <div className="space-y-6">
      <ParticipantSearch
        hackathonId={hackathonId}
        onSelect={(match) => onSelect(match.id)}
      />
      {participantId ? (
        <ParticipantLedger
          // A fresh form per person, so a half-typed reason never carries over.
          key={participantId}
          hackathonId={hackathonId}
          participantId={participantId}
          onClose={() => onSelect(null)}
        />
      ) : (
        <p className={body}>
          Pick someone from the leaderboard or search for them to see their
          points and adjust them.
        </p>
      )}
    </div>
  );
}

function ParticipantLedger({
  hackathonId,
  participantId,
  onClose,
}: {
  hackathonId: string;
  participantId: string;
  onClose: () => void;
}) {
  const readOnly = useReadOnly();
  const utils = trpc.useUtils();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const ledger = trpc.points.admin.ledger.useQuery(
    { hackathonId, participantId },
    { refetchInterval: 10_000 },
  );

  const adjust = trpc.points.admin.adjust.useMutation({
    onSuccess: (result) => {
      const n = result.adjustment.delta;
      setDone(
        `${n > 0 ? "Added" : "Took away"} ${pointsLabel(Math.abs(n))}. ${pointsLabel(result.balance.available)} to spend now.`,
      );
      setDelta("");
      setReason("");
      void utils.points.admin.invalidate();
      void utils.points.store.lookupParticipant.invalidate({ hackathonId });
      void utils.points.store.searchParticipants.invalidate({ hackathonId });
    },
  });

  if (!ledger.data) {
    return ledger.isError ? (
      <div className="space-y-3">
        <p className="text-[15px] text-[var(--danger)]">
          {trpcErrorMessage(ledger.error, "Couldn't load this hacker's points.")}
        </p>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
      </div>
    ) : (
      <p className={meta}>Loading their points…</p>
    );
  }

  const { participant, balance } = ledger.data;
  const rows = ledgerRows(ledger.data);
  const amount = Number(delta);
  const validAmount =
    delta.trim() !== "" &&
    Number.isInteger(amount) &&
    amount !== 0 &&
    Math.abs(amount) <= 1000;

  return (
    <section className="space-y-6 border-l-2 border-l-accent pl-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${itemTitle} break-words`}>{participant.name}</h3>
          <p className={`flex flex-wrap gap-x-3 ${meta}`}>
            <span className="truncate">{participant.email}</span>
            <StatusBadge status={participant.registrationStatus} />
          </p>
        </div>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3 tabular-nums">
        <div>
          <dt className={label}>To spend</dt>
          <dd className="font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight text-[var(--text-primary)]">
            {balance.available.toLocaleString("en-US")}
          </dd>
        </div>
        <div>
          <dt className={label}>Earned</dt>
          <dd className="mt-2 text-[17px] text-[var(--text-primary)]">
            {balance.earned.toLocaleString("en-US")}
          </dd>
        </div>
        <div>
          <dt className={label}>Spent</dt>
          <dd className="mt-2 text-[17px] text-[var(--text-primary)]">
            {balance.spent.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      <form
        className="space-y-3 border-t border-[var(--border-subtle)] pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validAmount || !reason.trim()) return;
          setDone(null);
          adjust.mutate({
            hackathonId,
            participantId,
            delta: amount,
            reason,
          });
        }}
      >
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          Adjust points
        </p>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <div>
            <label htmlFor={`adjust-delta-${participantId}`} className={fieldLabel}>
              Points
            </label>
            <input
              id={`adjust-delta-${participantId}`}
              type="number"
              inputMode="numeric"
              step={1}
              min={-1000}
              max={1000}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="50"
              className={`min-h-11 tabular-nums ${input}`}
            />
          </div>
          <div>
            <label htmlFor={`adjust-reason-${participantId}`} className={fieldLabel}>
              Reason
            </label>
            <input
              id={`adjust-reason-${participantId}`}
              type="text"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Helped run the closing ceremony"
              className={`min-h-11 ${input}`}
            />
          </div>
        </div>
        <p className={fieldHint}>
          Negative to take points away, up to 1,000 either way. The hacker sees
          the reason on their history.
        </p>
        {adjust.error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {trpcErrorMessage(adjust.error, "Couldn't adjust their points.")}
          </p>
        )}
        {done && (
          <p role="status" className="text-[13px] text-[var(--success)]">
            {done}
          </p>
        )}
        <button
          type="submit"
          disabled={
            readOnly || !validAmount || !reason.trim() || adjust.isPending
          }
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`min-h-11 ${btnInk}`}
        >
          {adjust.isPending
            ? "Saving…"
            : validAmount
              ? amount > 0
                ? `Add ${pointsLabel(amount)}`
                : `Take away ${pointsLabel(-amount)}`
              : "Adjust"}
        </button>
      </form>

      <div className="border-t border-[var(--border-subtle)] pt-5">
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          History
        </p>
        {rows.length === 0 ? (
          <p className={`mt-2 ${body}`}>
            Nothing yet: no check-ins, adjustments or purchases.
          </p>
        ) : (
          <ul className="mt-2 border-t border-[var(--border-subtle)]">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] py-2.5"
              >
                <div className="min-w-0">
                  <p
                    className={`break-words text-[15px] ${row.voided ? "text-[var(--text-muted)] line-through decoration-[var(--text-subtle)]" : "text-[var(--text-primary)]"}`}
                  >
                    {row.title}
                  </p>
                  <p className={meta}>{row.detail}</p>
                  {row.note && <p className={meta}>{row.note}</p>}
                </div>
                <span
                  className={`shrink-0 text-[15px] font-semibold tabular-nums ${row.voided ? "text-[var(--text-subtle)] line-through" : "text-[var(--text-primary)]"}`}
                >
                  {signedPoints(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
