"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  READ_ONLY_TITLE,
  usePortalContext,
  useReadOnly,
} from "@/lib/use-portal-context";
import { UserPlus, Copy } from "lucide-react";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";

/**
 * The judge roster for one edition: who applied, who is approved, adding a
 * judge by email and removing one. Running judging itself (rooms, schedule,
 * results) is on /admin/judging.
 */
export function JudgesTab({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const { data: portalContext } = usePortalContext();
  // judge.remove is super-admin only; other staff would only meet the refusal.
  const canRemove = portalContext?.role === "super_admin";

  const {
    data: judges,
    isLoading,
    isError,
    error: listError,
    refetch,
  } = trpc.judge.list.useQuery({
    hackathonId,
  });

  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJudgeEmail, setNewJudgeEmail] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const refresh = () => {
    void utils.judge.list.invalidate({ hackathonId });
    setError(null);
  };

  const createJudge = trpc.judge.create.useMutation({
    onSuccess: () => {
      refresh();
      setNewJudgeEmail("");
      setShowAddForm(false);
    },
    onError: (e) => setError(e.message),
  });

  // Judges who applied through /judge/register arrive inactive; this is the
  // only thing that approves them.
  const setActive = trpc.judge.setActive.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });

  const removeJudge = trpc.judge.remove.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });

  const applyLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/judge/register?hackathonId=${hackathonId}`;

  if (isLoading) {
    return <p className={`py-16 ${body}`}>Loading judges…</p>;
  }

  if (isError) {
    return (
      <p className={`py-16 ${body}`}>
        {trpcErrorMessage(listError, "Could not load the judges.")}{" "}
        <button type="button" onClick={() => refetch()} className={textLink}>
          Try again
        </button>
      </p>
    );
  }

  const roster = judges ?? [];
  const approved = roster.filter((j) => j.isActive).length;

  return (
    <div className="space-y-10">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className={sectionTitle}>Judges</h2>
          <p className={`mt-2 ${meta}`}>
            {approved} approved · {roster.length - approved} waiting
          </p>
          <p className={`mt-1 max-w-xl ${meta}`}>
            Approved judges sign in and pick a room or table on their judge
            desk. Guest judges scan the QR code at a room or table instead and
            are not listed here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/admin/judging/${hackathonId}`} className={textLink}>
            Run judging
          </Link>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" /> Add
            judge
          </button>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      {showAddForm && (
        <section className="space-y-4 border-y border-[var(--border-subtle)] py-6">
          <form
            className="grid gap-4 sm:grid-cols-[1fr_auto] items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newJudgeEmail.trim()) return;
              setError(null);
              createJudge.mutate({ email: newJudgeEmail.trim(), hackathonId });
            }}
          >
            <div>
              <label htmlFor="new-judge-email" className={fieldLabel}>
                Email
              </label>
              <input
                id="new-judge-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={newJudgeEmail}
                onChange={(e) => setNewJudgeEmail(e.target.value)}
                placeholder="judge@company.com"
                className={input}
              />
            </div>
            <button
              type="submit"
              disabled={readOnly || !newJudgeEmail.trim() || createJudge.isPending}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={`${btnInk} whitespace-nowrap`}
            >
              {createJudge.isPending ? "Adding…" : "Add judge"}
            </button>
          </form>
          <p className={meta}>
            The person needs a portal account; signing in once creates one.
            Judges added here are approved straight away.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <p className={`flex-1 ${meta}`}>
              Or send judges the application link. You approve each one below.
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(applyLink).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                });
              }}
              className={btnSecondary}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              {linkCopied ? "Copied" : "Copy apply link"}
            </button>
          </div>
        </section>
      )}

      <section className={sectionRule}>
        {roster.length === 0 ? (
          <p className={body}>
            No judges yet. Add one by email, or send the application link.
          </p>
        ) : (
          <ul className="border-t border-[var(--border-subtle)]">
            {roster.map((judge) => {
              const application = judge.assignments.find(
                (a) => a.hackathon?.id === hackathonId,
              );
              const name =
                judge.user?.name || judge.name || judge.user?.email || "Unnamed judge";
              return (
                <li
                  key={judge.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-[var(--border-subtle)] py-4"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Image
                      src={judge.user?.image || "/avatars/default.svg"}
                      alt=""
                      width={36}
                      height={36}
                      className="rounded-full bg-[var(--bg-secondary)] shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`${itemTitle} text-[17px] truncate`}>{name}</p>
                      <p className={`truncate ${meta}`}>
                        {[
                          judge.user?.email ?? judge.email,
                          application?.track
                            ? `Prefers ${application.track}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className={status(judge.isActive ? "success" : "warning")}>
                      {judge.isActive ? "Approved" : "Waiting"}
                    </span>
                    <button
                      type="button"
                      disabled={readOnly || setActive.isPending}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      onClick={() =>
                        setActive.mutate({
                          judgeId: judge.id,
                          isActive: !judge.isActive,
                        })
                      }
                      className={btnSecondary}
                    >
                      {judge.isActive ? "Suspend" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || !canRemove || removeJudge.isPending}
                      title={
                        readOnly
                          ? READ_ONLY_TITLE
                          : !canRemove
                            ? "Only a super admin can remove a judge. Suspend them instead."
                            : undefined
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove ${name} from this edition's judges? Their application is deleted.`,
                          )
                        )
                          return;
                        removeJudge.mutate({ judgeId: judge.id });
                      }}
                      className={btnDanger}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
