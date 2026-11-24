"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { Alert } from "@query/ui/Alert";
import {
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
} from "@query/ui/classes";
import { EmptyState } from "@query/ui/EmptyState";
import { formatCents } from "@query/api/pricing";
import { venueFormat } from "@/lib/venue-time";

const PAGE_SIZE = 10;

type Entitlement = {
  plan: "annual" | "semester";
  bootcamp: boolean;
  addOnOnly: boolean;
};

const describeEntitlement = (e: Entitlement) => {
  if (e.addOnOnly) return "Bootcamp add-on only (no membership term)";
  const plan = e.plan === "semester" ? "Semester membership" : "Annual membership";
  return `${plan}${e.bootcamp ? " + bootcamp add-on" : ", no bootcamp add-on"}`;
};

/**
 * Paid Stripe payments nobody has claimed. Self-service linking needs the
 * portal email to match the payer's, so a payment made under another address
 * waits here for an officer to attach it to the right account.
 */
export function UnlinkedPayments() {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const payments = trpc.stripe.listUnlinkedPayments.useQuery({
    query: searched,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const typedEmail = email.trim().toLowerCase();
  // The same lookup the Memberships search uses, to show who the payment would
  // land on before an officer confirms.
  const accounts = trpc.member.adminSearch.useQuery(
    { query: typedEmail },
    { enabled: confirming && typedEmail.length > 0 },
  );
  const account = accounts.data?.find(
    (row) => row.email?.toLowerCase() === typedEmail,
  );

  const link = trpc.stripe.linkPaymentToUser.useMutation({
    onSuccess: (result) => {
      setError(null);
      setNotice(
        `Linked. ${result.userEmail ?? "The account"} now has: ${describeEntitlement(result.entitlement)}.`,
      );
      setActive(null);
      setEmail("");
      setConfirming(false);
      utils.stripe.listUnlinkedPayments.invalidate();
      utils.member.adminSearch.invalidate();
      utils.member.adminHistory.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const total = payments.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const closeRow = () => {
    setActive(null);
    setEmail("");
    setConfirming(false);
    setError(null);
  };

  return (
    <section className="mt-16 border-t border-[var(--border-subtle)] pt-10">
      <h2 className={itemTitle}>Unlinked payments</h2>
      <p className={`${meta} mt-1`}>
        Paid in Stripe but not attached to a portal account, usually because the
        payer used a different email. Linking grants what the amount bought and
        is recorded in the audit log.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <input
          id="unlinked-search"
          type="text"
          aria-label="Search unlinked payments by payer email or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setSearched(query.trim());
              setPage(0);
            }
          }}
          placeholder="Search payer email or name"
          className={`${input} sm:flex-1`}
        />
        <button
          type="button"
          onClick={() => {
            setSearched(query.trim());
            setPage(0);
          }}
          className={btnSecondary}
        >
          Search
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-4 text-[13px] text-[var(--success)]">
          {notice}
        </p>
      )}

      {payments.data && payments.data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState>
            {searched
              ? `No unlinked payments match “${searched}”.`
              : "Every paid payment is linked to an account."}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {payments.data?.items.map((row) => {
            const open = active === row.id;
            return (
              <li key={row.id} className="py-4 px-3">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="sm:flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] break-all">
                      {row.customerEmail}
                    </p>
                    <p className={`${meta} tabular-nums`}>
                      {row.customerName || "No name on payment"} ·{" "}
                      {row.amountTotal == null
                        ? "no amount"
                        : formatCents(row.amountTotal)}{" "}
                      · {venueFormat(row.createdAt)}
                    </p>
                    <p
                      className={`text-[13px] mt-1 ${
                        row.entitlement
                          ? "text-[var(--text-secondary)]"
                          : "text-[var(--warning)]"
                      }`}
                    >
                      {row.entitlement
                        ? `Grants: ${describeEntitlement(row.entitlement)}`
                        : "Amount does not match any membership, so it cannot be linked."}
                    </p>
                  </div>
                  {row.entitlement && !open && (
                    <button
                      type="button"
                      onClick={() => {
                        setActive(row.id);
                        setEmail("");
                        setConfirming(false);
                        setError(null);
                        setNotice(null);
                      }}
                      disabled={readOnly}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnSecondary}
                    >
                      Link to account
                    </button>
                  )}
                </div>

                {open && row.entitlement && (
                  <div className="mt-4 space-y-3 border-l-2 border-accent pl-4">
                    <label htmlFor={`link-email-${row.id}`} className={fieldLabel}>
                      Member&apos;s portal email
                    </label>
                    <input
                      id={`link-email-${row.id}`}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setConfirming(false);
                        setError(null);
                      }}
                      placeholder="ada@gatech.edu"
                      className={input}
                    />

                    {confirming && (
                      <div className="text-[14px] text-[var(--text-secondary)] space-y-1">
                        {accounts.isPending ? (
                          <p>Looking up the account...</p>
                        ) : account ? (
                          <>
                            <p>
                              Link this {formatCents(row.amountTotal ?? 0)}{" "}
                              payment from {row.customerEmail} to{" "}
                              <strong>{account.name || account.email}</strong> (
                              {account.email}).
                            </p>
                            <p>
                              This will grant:{" "}
                              <strong>{describeEntitlement(row.entitlement)}</strong>.
                            </p>
                          </>
                        ) : (
                          <p className="text-[var(--warning)]">
                            No account has that email. They need to sign in to
                            the portal once first.
                          </p>
                        )}
                      </div>
                    )}

                    {error && <Alert size={13}>{error}</Alert>}

                    <div className="flex flex-wrap gap-3">
                      {confirming ? (
                        <button
                          type="button"
                          onClick={() =>
                            link.mutate({
                              paymentId: row.id,
                              email: typedEmail,
                            })
                          }
                          disabled={readOnly || link.isPending || !account}
                          title={readOnly ? READ_ONLY_TITLE : undefined}
                          className={btnPrimary}
                        >
                          {link.isPending ? "Linking..." : "Confirm link"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming(true)}
                          disabled={!typedEmail.includes("@")}
                          className={btnPrimary}
                        >
                          Review
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={closeRow}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPage(page - 1);
              closeRow();
            }}
            disabled={page === 0}
            className={btnSecondary}
          >
            Newer
          </button>
          <span className={`${meta} tabular-nums`}>
            {page * PAGE_SIZE + 1} to {Math.min(total, (page + 1) * PAGE_SIZE)}{" "}
            of {total}
          </span>
          <button
            type="button"
            onClick={() => {
              setPage(page + 1);
              closeRow();
            }}
            disabled={page >= lastPage}
            className={btnSecondary}
          >
            Older
          </button>
        </div>
      )}
    </section>
  );
}
