"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { CreditCard } from "lucide-react";

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
    <div className="max-w-5xl mx-auto py-16 px-6 space-y-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-accent" />
          Memberships
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] font-mono">
          Grant, extend or end a membership. Every change is recorded in the
          audit log and in the member&apos;s own history.
        </p>
      </div>

      <LiquidGlass className="p-6 border-[var(--border-subtle)] space-y-4">
        <label
          htmlFor="member-search"
          className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] font-mono"
        >
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
            className="flex-1 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setError(null);
              setSearched(query.trim());
            }}
            disabled={!query.trim()}
            className="px-6 py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest rounded-none hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            Search
          </button>
        </div>

        {searched && results.data?.length === 0 && (
          <p className="text-xs font-mono text-amber-300">
            Nobody matches “{searched}”. They must have signed in at least once.
          </p>
        )}

        {(results.data?.length ?? 0) > 0 && (
          <div className="divide-y divide-[var(--border-subtle)]">
            {results.data?.map((row) => (
              <button
                key={row.userId}
                type="button"
                onClick={() => {
                  setSelected(row.userId);
                  setNotice(null);
                  setError(null);
                }}
                className={`w-full text-left py-3 px-2 transition-colors ${
                  selected === row.userId
                    ? "bg-accent/5"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <p className="text-sm text-[var(--text-primary)]">
                  {row.name ||
                    `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
                    "Unnamed account"}
                </p>
                <p className="text-[11px] font-mono text-[var(--text-subtle)]">
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
      </LiquidGlass>

      {selectedRow && (
        <LiquidGlass className="p-6 border-[var(--border-subtle)] space-y-5">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">
              {selectedRow.email}
            </h2>
            <p className="text-[11px] font-mono text-[var(--text-subtle)] mt-1">
              {selectedRow.isCurrentMember
                ? `Active until ${selectedRow.membershipEndDate?.toLocaleDateString()} · renewed ${selectedRow.renewalCount ?? 0}×`
                : "No current membership"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="grant-months"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Months
              </label>
              <input
                id="grant-months"
                type="number"
                min={-24}
                max={24}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
              />
              <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
                Added to whatever term is left. Negative takes time away.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="grant-note"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Reason (recorded)
              </label>
              <input
                id="grant-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Paid $15 cash at the fall kickoff"
                maxLength={500}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
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
              className="px-6 py-3 bg-accent/10 border border-accent/40 text-accent text-xs font-bold uppercase tracking-widest rounded-none hover:bg-accent/20 transition-colors disabled:opacity-30"
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
                className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest rounded-none hover:bg-red-500/20 transition-colors disabled:opacity-30"
              >
                End membership
              </button>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs font-mono text-red-300 border border-red-500/30 bg-red-500/10 px-3 py-2"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="text-xs font-mono text-accent border border-accent/30 bg-accent/10 px-3 py-2"
            >
              {notice}
            </p>
          )}

          <div>
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
              History
            </h3>
            {(history.data?.length ?? 0) === 0 ? (
              <p className="text-[11px] font-mono text-[var(--text-subtle)]">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.data?.map((row) => (
                  <li
                    key={row.id}
                    className="text-[11px] font-mono text-[var(--text-muted)]"
                  >
                    {row.createdAt.toLocaleDateString()} · {row.action} ·{" "}
                    {row.startDate.toLocaleDateString()} →{" "}
                    {row.endDate ? row.endDate.toLocaleDateString() : "—"}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </LiquidGlass>
      )}
    </div>
  );
}
