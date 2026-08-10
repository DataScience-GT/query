"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Rocket } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@query/api";

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
    <LiquidGlass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">{proposal.title}</h3>
          <p className="mt-0.5 text-sm text-white/50">
            {proposal.proposerName ?? proposal.proposerEmail} ·{" "}
            {proposal.proposerEmail}
          </p>
          {proposal.summary && (
            <p className="mt-2 text-sm text-white/80">{proposal.summary}</p>
          )}
          {proposal.description && (
            <p className="mt-2 whitespace-pre-line text-sm text-white/60">
              {proposal.description}
            </p>
          )}
          <p className="mt-2 text-sm text-white/50">
            {proposal.commitment ?? "No commitment given"} ·{" "}
            {proposal.maxMembers === null
              ? "no team cap"
              : `cap ${proposal.maxMembers}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: proposal.id, decision: "approve" })
            }
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={review.isPending}
            onClick={() => setDeclining((prev) => !prev)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>

      {/* A decline without a reason is the thing a member can do nothing with,
          so the note is asked for at the moment of declining. */}
      {declining && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <label
            htmlFor={`note-${proposal.id}`}
            className="text-xs font-semibold uppercase tracking-wide text-white/50"
          >
            Why (shown to them)
          </label>
          <textarea
            id={`note-${proposal.id}`}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Too close to an existing initiative, needs a clearer scope, …"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          <button
            type="button"
            disabled={review.isPending}
            onClick={() =>
              review.mutate({
                id: proposal.id,
                decision: "decline",
                note: note.trim() || undefined,
              })
            }
            className="mt-3 rounded-full bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
          >
            Confirm decline
          </button>
        </div>
      )}

      {review.error && (
        <p className="mt-3 text-sm text-red-300">{review.error.message}</p>
      )}
    </LiquidGlass>
  );
}

export default function AdminInitiativesPage() {
  const { data: session, status } = useSession();
  const utils = trpc.useUtils();
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
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <LiquidGlass className="p-8 text-center">
          <p className="font-semibold text-white">{leaders.error.message}</p>
        </LiquidGlass>
      </div>
    );
  }

  const rows = leaders.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Rocket className="h-6 w-6 text-white/70" />
          <h1 className="text-2xl font-bold text-white">Project leaders</h1>
        </div>
        <p className="mt-2 text-white/60">
          A project leader can post initiatives and pick who joins them. It
          grants nothing else — admin screens stay admin-only.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Proposals waiting on you
          {proposals.data && proposals.data.length > 0
            ? ` · ${proposals.data.length}`
            : ""}
        </h2>
        {proposals.error ? (
          <p className="text-sm text-red-300">{proposals.error.message}</p>
        ) : (proposals.data ?? []).length > 0 ? (
          <div className="space-y-3">
            {(proposals.data ?? []).map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </div>
        ) : (
          <LiquidGlass className="p-6 text-center">
            <p className="text-sm text-white/60">
              Nothing waiting. Members pitch initiatives from their Initiatives
              page; approving one makes them a project leader.
            </p>
          </LiquidGlass>
        )}
      </section>

      <LiquidGlass className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId.trim()) return;
            setLeader.mutate({ userId: userId.trim(), isLeader: true });
          }}
        >
          <div className="min-w-64 flex-1">
            <label
              htmlFor="leader-user-id"
              className="text-xs font-semibold uppercase tracking-wide text-white/50"
            >
              Grant by user id
            </label>
            <input
              id="leader-user-id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="User id from the attendees list"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={setLeader.isPending}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {setLeader.isPending ? "Saving…" : "Make leader"}
          </button>
        </form>

        {setLeader.error && (
          <p className="mt-3 text-sm text-red-300">{setLeader.error.message}</p>
        )}
      </LiquidGlass>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Project leaders
        </h2>

        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((leader) => (
              <LiquidGlass key={leader.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      {leader.name ?? leader.email}
                      {!leader.isActive && (
                        <span className="ml-2 text-sm font-normal text-white/40">
                          revoked
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-white/50">
                      {leader.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={setLeader.isPending}
                    onClick={() =>
                      setLeader.mutate({
                        userId: leader.userId,
                        isLeader: !leader.isActive,
                      })
                    }
                    className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {leader.isActive ? "Revoke" : "Restore"}
                  </button>
                </div>
              </LiquidGlass>
            ))}
          </div>
        ) : (
          <LiquidGlass className="p-8 text-center">
            <p className="font-semibold text-white">No leaders yet.</p>
            <p className="mt-2 text-sm text-white/60">
              Grant the role above and it takes effect on their next request.
            </p>
          </LiquidGlass>
        )}
      </section>
    </div>
  );
}
