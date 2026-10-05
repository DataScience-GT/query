"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  page,
  pageDek,
} from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

/**
 * Membership operations for staff.
 *
 * Cash at a table, a comped officer, a refund that has to be honoured — none of
 * these arrive through Stripe, and until now none had any path but SQL against
 * production. Every action here is audit-logged as critical.
 */
export default function AdminMembersPage() {
  const utils = trpc.useUtils();

  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const results = trpc.member.adminSearch.useQuery(
    { query: searched },
    { enabled: searched.length > 0 },
  );

  const history = trpc.member.adminHistory.useQuery(
    { userId: selected ?? "" },
    { enabled: !!selected },
  );

  const refresh = () => {
    utils.member.adminSearch.invalidate();
    utils.member.adminHistory.invalidate();
  };

  const grant = trpc.member.adminGrant.useMutation({
    onSuccess: (result) => {
      setError(null);
      setNotice(
        `Done. Membership now ${result.isActive ? "runs to" : "ended"} ${result.membershipEndDate.toLocaleDateString()}.`,
      );
      setNote("");
      refresh();
    },
    onError: (e) => setError(e.message),
  });

  const revoke = trpc.member.adminRevoke.useMutation({
    onSuccess: () => {
      setError(null);
      setNotice("Membership ended.");
      setNote("");
      refresh();
    },
    onError: (e) => setError(e.message),
  });

  const busy = grant.isPending || revoke.isPending;
  const selectedRow = results.data?.find((row) => row.userId === selected);

  return (
    <div className={page}>
      <h1 className={adminTitle}>Memberships</h1>
      <p className={pageDek}>
        Grant, extend or end a membership. Every change is recorded in the
        audit log and in the member&apos;s own history.
      </p>

      <section className="mt-10">
        <label htmlFor="member-search" className={fieldLabel}>
          Find someone by name or email
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="member-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearched(query.trim());
            }}
            placeholder="ada@gatech.edu"
            className={`${input} sm:flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setError(null);
              setSearched(query.trim());
            }}
            disabled={!query.trim()}
            className={btnSecondary}
          >
            Search
          </button>
        </div>

        {searched && results.data?.length === 0 && (
          <p className="mt-3 text-[13px] text-[var(--warning)]">
            Nobody matches “{searched}”. They need to have signed in at least
            once.
          </p>
        )}

        {(results.data?.length ?? 0) > 0 && (
          <div className="mt-6 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {results.data?.map((row) => (
              <button
                key={row.userId}
                type="button"
                onClick={() => {
                  setSelected(row.userId);
                  setNotice(null);
                  setError(null);
                }}
                className={`w-full text-left py-3 px-3 border-l-2 transition-colors ${
                  selected === row.userId
                    ? "border-accent bg-[var(--bg-secondary)]"
                    : "border-transparent hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {row.name ||
                    `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
                    "Unnamed account"}
                </p>
                <p className={meta}>
                  {row.email} ·{" "}
                  {row.isCurrentMember
                    ? `member until ${row.membershipEndDate?.toLocaleDateString()}`
                    : row.memberId
                      ? "lapsed"
                      : "not a member"}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedRow && (
        <section className="mt-12 border-t border-[var(--border-subtle)] pt-8 space-y-6">
          <div>
            <h2 className={`${itemTitle} break-all`}>{selectedRow.email}</h2>
            <p className={`${meta} mt-1`}>
              {selectedRow.isCurrentMember
                ? `Active until ${selectedRow.membershipEndDate?.toLocaleDateString()} · renewed ${selectedRow.renewalCount ?? 0}×`
                : "No current membership"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="grant-months" className={fieldLabel}>
                Months
              </label>
              <input
                id="grant-months"
                type="number"
                min={-24}
                max={24}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className={`${input} tabular-nums`}
              />
              <p className={fieldHint}>
                Added to whatever term is left. A negative number takes time
                away.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="grant-note" className={fieldLabel}>
                Reason (recorded)
              </label>
              <input
                id="grant-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Paid $15 cash at the fall kickoff"
                maxLength={500}
                className={input}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                grant.mutate({
                  userId: selectedRow.userId,
                  months,
                  note: note.trim(),
                })
              }
              disabled={busy || !note.trim() || months === 0}
              className={btnPrimary}
            >
              {months >= 0 ? `Add ${months} month(s)` : `Remove ${-months} month(s)`}
            </button>
            {selectedRow.isCurrentMember && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `End ${selectedRow.email}'s membership now?\n\nTheir history is kept.`,
                    )
                  )
                    return;
                  revoke.mutate({
                    userId: selectedRow.userId,
                    note: note.trim(),
                  });
                }}
                disabled={busy || !note.trim()}
                className={`${btnDanger} sm:ml-auto`}
              >
                End membership
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-[13px] text-[var(--success)]">
              {notice}
            </p>
          )}

          <div className="border-t border-[var(--border-subtle)] pt-6">
            <h3 className={`${label} mb-2`}>History</h3>
            {(history.data?.length ?? 0) === 0 ? (
              <p className={meta}>
                Nothing recorded yet. Grants and endings will be listed here.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {history.data?.map((row) => (
                  <li
                    key={row.id}
                    className="py-2 text-[14px] text-[var(--text-muted)] tabular-nums"
                  >
                    {row.createdAt.toLocaleDateString()} · {row.action} ·{" "}
                    {row.startDate.toLocaleDateString()} to{" "}
                    {row.endDate ? row.endDate.toLocaleDateString() : "—"}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
