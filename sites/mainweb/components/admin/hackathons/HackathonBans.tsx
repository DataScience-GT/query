"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  meta,
  sectionRule,
  sectionTitle,
} from "@/components/portal/ui";

/**
 * People barred from hackathons. A ban stops registering, the interest list,
 * teams, submitting and applying to judge; club membership is untouched. It
 * is keyed by email, so it also covers an account they create later.
 */
export function HackathonBans() {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bans = trpc.hackathon.listBans.useQuery();

  const ban = trpc.hackathon.banFromHackathons.useMutation({
    onSuccess: (_row, vars) => {
      setError(null);
      setNotice(`${vars.email} can no longer take part in hackathons.`);
      setEmail("");
      setReason("");
      utils.hackathon.listBans.invalidate();
    },
    onError: (e) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const lift = trpc.hackathon.liftHackathonBan.useMutation({
    onSuccess: (_res, vars) => {
      setError(null);
      setNotice(`Ban lifted for ${vars.email}.`);
      utils.hackathon.listBans.invalidate();
    },
    onError: (e) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const canBan =
    !readOnly &&
    !ban.isPending &&
    email.trim().length > 3 &&
    reason.trim().length >= 3;

  return (
    <section className={`mt-16 ${sectionRule}`}>
      <h2 className={sectionTitle}>Banned from hackathons</h2>
      <p className={`mt-2 max-w-2xl ${body}`}>
        A ban stops someone registering, joining the interest list, forming or
        joining a team, submitting and applying to judge. Their club membership
        is not affected. It applies to the email address, including accounts
        they make later.
      </p>

      <form
        className="mt-6 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canBan) return;
          if (
            !window.confirm(
              `Ban ${email.trim()} from all hackathons? They will be refused at registration, teams and submission.`,
            )
          )
            return;
          ban.mutate({ email: email.trim(), reason: reason.trim() });
        }}
      >
        <div>
          <label htmlFor="ban-email" className={fieldLabel}>
            Email
          </label>
          <input
            id="ban-email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@gatech.edu"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="ban-reason" className={fieldLabel}>
            Reason
          </label>
          <input
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="What happened, for the record"
            className={input}
          />
        </div>
        <button
          type="submit"
          disabled={!canBan}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnDanger}
        >
          {ban.isPending ? "Banning…" : "Ban"}
        </button>
      </form>
      <p className={fieldHint}>
        Staff see the reason. The person sees only that they can&apos;t take
        part.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-[var(--success)]">
          {notice}
        </p>
      )}

      <div className="mt-8">
        {bans.isLoading ? (
          <p className={meta}>Loading bans…</p>
        ) : bans.error ? (
          <p role="alert" className="text-sm text-[var(--danger)]">
            The ban list didn&apos;t load. Reload the page to try again.
          </p>
        ) : !bans.data?.length ? (
          <p className={body}>Nobody is banned from hackathons.</p>
        ) : (
          <ul className="border-t border-[var(--border-subtle)]">
            {bans.data.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 border-b border-[var(--border-subtle)] py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] break-words">
                    {b.name ? `${b.name} · ` : ""}
                    {b.email}
                  </p>
                  <p className={`mt-1 ${body}`}>{b.reason}</p>
                  <p className={`mt-1 ${meta}`}>
                    Banned{" "}
                    {new Date(b.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {b.bannedBy ? ` by ${b.bannedBy}` : ""}
                    {b.hasAccount ? "" : " · no account yet"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly || lift.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  onClick={() => {
                    if (
                      window.confirm(`Lift the hackathon ban for ${b.email}?`)
                    ) {
                      lift.mutate({ email: b.email });
                    }
                  }}
                  className={`${btnSecondary} shrink-0`}
                >
                  Lift ban
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
