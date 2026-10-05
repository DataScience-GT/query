"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import type { RouterOutputs } from "@query/api";
import {
  body,
  btnDanger,
  btnInk,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  page,
  pageDek,
  sectionTitle,
} from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

/**
 * Who runs club initiatives.
 *
 * Granting takes a user id rather than an email search: this reuses the
 * attendees list every officer already works from, and a leader has to have
 * signed in at least once to have an id at all.
 */
function ProposalRow({
  proposal,
}: {
  proposal: RouterOutputs["initiative"]["listProposals"][number];
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);

  const review = trpc.initiative.reviewProposal.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.initiative.listProposals.invalidate(),
        // Approving mints a project leader, so that list moves too.
        utils.initiative.listLeaders.invalidate(),
      ]);
    },
  });

  return (
    <div className="py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={itemTitle}>{proposal.title}</h3>
          <p className={`${meta} mt-0.5 break-all`}>
            {proposal.proposerName ?? proposal.proposerEmail} ·{" "}
            {proposal.proposerEmail}
          </p>
          {proposal.summary && (
            <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
              {proposal.summary}
            </p>
          )}
          {proposal.description && (
            <p className={`${body} mt-2 whitespace-pre-line`}>
              {proposal.description}
            </p>
          )}
          <p className={`${meta} mt-3`}>
            {proposal.commitment ?? "No commitment given"} ·{" "}
            {proposal.maxMembers === null
              ? "no team cap"
              : `cap ${proposal.maxMembers}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={readOnly || review.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() =>
              review.mutate({ id: proposal.id, decision: "approve" })
            }
            className={btnInk}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={readOnly || review.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => setDeclining((prev) => !prev)}
            className={btnSecondary}
          >
            Decline
          </button>
        </div>
      </div>

      {/* A decline without a reason is the thing a member can do nothing with,
          so the note is asked for at the moment of declining. */}
      {declining && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
          <label htmlFor={`note-${proposal.id}`} className={fieldLabel}>
            Why (shown to them)
          </label>
          <textarea
            id={`note-${proposal.id}`}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Too close to an existing project, needs a clearer scope, …"
            className={`${input} min-h-11`}
          />
          <button
            type="button"
            disabled={readOnly || review.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() =>
              review.mutate({
                id: proposal.id,
                decision: "decline",
                note: note.trim() || undefined,
              })
            }
            className={`${btnDanger} mt-3`}
          >
            Confirm decline
          </button>
        </div>
      )}

      {review.error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {review.error.message}
        </p>
      )}
    </div>
  );
}

export default function AdminInitiativesPage() {
  const { data: session, status } = useSession();
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [userId, setUserId] = useState("");

  const leaders = trpc.initiative.listLeaders.useQuery(undefined, {
    enabled: !!session,
  });
  const proposals = trpc.initiative.listProposals.useQuery(undefined, {
    enabled: !!session,
  });

  const setLeader = trpc.initiative.setLeader.useMutation({
    onSuccess: async () => {
      setUserId("");
      await utils.initiative.listLeaders.invalidate();
    },
  });

  if (status === "loading" || leaders.isPending) return <LoadingScreen />;

  if (leaders.error) {
    return (
      <div className={page}>
        <h1 className={adminTitle}>Project leaders</h1>
        <p role="alert" className="mt-3 text-[15px] text-[var(--danger)]">
          {leaders.error.message}
        </p>
      </div>
    );
  }

  const rows = leaders.data ?? [];

  return (
    <div className={page}>
      <h1 className={adminTitle}>Project leaders</h1>
      <p className={pageDek}>
        A project leader can post projects and pick who joins them. It grants
        nothing else; admin screens stay admin-only.
      </p>

      <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={sectionTitle}>
          Proposals waiting on you
          {proposals.data && proposals.data.length > 0 ? (
            <span className="ml-2 text-[var(--text-subtle)] tabular-nums">
              {proposals.data.length}
            </span>
          ) : null}
        </h2>
        {proposals.error ? (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {proposals.error.message}
          </p>
        ) : (proposals.data ?? []).length > 0 ? (
          <div className="mt-2 divide-y divide-[var(--border-subtle)]">
            {(proposals.data ?? []).map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </div>
        ) : (
          <p className={`${body} mt-3`}>
            Nothing waiting. Members pitch projects from their Projects page;
            approving one makes them a project leader.
          </p>
        )}
      </section>

      <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={sectionTitle}>Project leaders</h2>

        <form
          className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId.trim()) return;
            setLeader.mutate({ userId: userId.trim(), isLeader: true });
          }}
        >
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="leader-user-id" className={fieldLabel}>
              Grant by user id
            </label>
            <input
              id="leader-user-id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="User id from the attendees list"
              className={`${input} min-h-11 font-mono`}
            />
          </div>
          <button
            type="submit"
            disabled={readOnly || setLeader.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {setLeader.isPending ? "Saving…" : "Make leader"}
          </button>
        </form>

        {setLeader.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {setLeader.error.message}
          </p>
        )}

        {rows.length > 0 ? (
          <div className="mt-8 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {rows.map((leader) => (
              <div
                key={leader.id}
                className="py-3 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {leader.name ?? leader.email}
                    {!leader.isActive && (
                      <span className="ml-2 text-[13px] font-normal text-[var(--text-subtle)]">
                        revoked
                      </span>
                    )}
                  </p>
                  <p className={`${meta} break-all`}>{leader.email}</p>
                </div>

                <button
                  type="button"
                  disabled={readOnly || setLeader.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  onClick={() =>
                    setLeader.mutate({
                      userId: leader.userId,
                      isLeader: !leader.isActive,
                    })
                  }
                  className={leader.isActive ? btnDanger : btnSecondary}
                >
                  {leader.isActive ? "Revoke" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={`${body} mt-8`}>
            No leaders yet. Grant the role above and it takes effect on their
            next request.
          </p>
        )}
      </section>
    </div>
  );
}
