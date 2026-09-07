"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Rocket } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  ApplicationChip,
  InitiativeChip,
  initiativeState,
  seatLabel,
} from "@/components/portal/initiatives/chips";
import {
  InitiativeFields,
  emptyDraft,
  toInput,
} from "@/components/portal/initiatives/form-fields";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@query/api";

type OpenInitiative = RouterOutputs["initiative"]["list"][number];
type MyApplication = RouterOutputs["initiative"]["myApplications"][number];
type MyProposal = RouterOutputs["initiative"]["myProposals"][number];

/**
 * Proposing something to run, rather than joining something that exists.
 *
 * An admin reviews it; approving turns the proposal into a draft project
 * and makes the proposer a project leader, so this is the one place a member
 * can earn that role.
 */
function ProposeSection({ canPropose }: { canPropose: boolean }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const propose = trpc.initiative.propose.useMutation({
    onSuccess: async () => {
      setOpen(false);
      setDraft(emptyDraft);
      await utils.initiative.myProposals.invalidate();
    },
  });

  if (!canPropose) return null;

  if (!open) {
    return (
      <LiquidGlass className="mb-10 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold text-white">Got something to build?</p>
          <p className="mt-1 text-sm text-white/60">
            Pitch it. If it is approved you become its project leader and pick
            who joins.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
        >
          Propose a project
        </button>
      </LiquidGlass>
    );
  }

  return (
    <LiquidGlass className="mb-10 p-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          propose.mutate(toInput(draft));
        }}
      >
        <h2 className="mb-4 font-semibold text-white">Propose a project</h2>
        <InitiativeFields draft={draft} onChange={setDraft} />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={propose.isPending}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {propose.isPending ? "Sending…" : "Send for review"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              propose.reset();
            }}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>

        {propose.error && (
          <p aria-live="polite" className="mt-3 text-sm text-red-300">
            {propose.error.message}
          </p>
        )}
      </form>
    </LiquidGlass>
  );
}

function ProposalRow({ proposal }: { proposal: MyProposal }) {
  const utils = trpc.useUtils();

  const withdraw = trpc.initiative.withdrawProposal.useMutation({
    onSuccess: async () => {
      await utils.initiative.myProposals.invalidate();
    },
  });

  const state = initiativeState(proposal);

  return (
    <LiquidGlass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{proposal.title}</h3>
            <InitiativeChip state={state} />
          </div>
          {proposal.summary && (
            <p className="mt-1 text-sm text-white/60">{proposal.summary}</p>
          )}

          {/* The reviewer's note is the whole point of a decline — without it a
              member has no idea what to change before pitching again. */}
          {proposal.reviewNote && (
            <p className="mt-2 border-l-2 border-white/10 pl-3 text-sm text-white/70">
              {proposal.reviewNote}
            </p>
          )}

          {proposal.status === "draft" && (
            <p className="mt-2 text-sm text-white/60">
              Approved — finish writing it and open it from{" "}
              <Link href="/lead" className="font-semibold text-white underline">
                My Projects
              </Link>
              .
            </p>
          )}
        </div>

        {proposal.status === "proposed" && (
          <button
            type="button"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate({ id: proposal.id })}
            className="shrink-0 text-sm font-semibold text-white/50 transition hover:text-white disabled:opacity-50"
          >
            Withdraw
          </button>
        )}
      </div>

      {withdraw.error && (
        <p className="mt-3 text-sm text-red-300">{withdraw.error.message}</p>
      )}
    </LiquidGlass>
  );
}

function OpenRow({
  initiative,
  canApply,
}: {
  initiative: OpenInitiative;
  canApply: boolean;
}) {
  const utils = trpc.useUtils();
  const [writing, setWriting] = useState(false);
  const [pitch, setPitch] = useState("");

  // Both lists move together: applying takes a project out of one and puts
  // it into the other, so refreshing one alone renders it twice.
  const refresh = async () => {
    await Promise.all([
      utils.initiative.list.invalidate(),
      utils.initiative.myApplications.invalidate(),
    ]);
  };

  const [resume, setResume] = useState<{
    fileName: string;
    dataUrl: string;
  } | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const join = trpc.initiative.requestToJoin.useMutation({
    onSuccess: async () => {
      setWriting(false);
      setPitch("");
      setResume(null);
      await refresh();
    },
  });

  // 2 MB is the server's whole-payload cap; catching it here saves a round
  // trip and says which file was too big.
  const readResume = (file: File | undefined) => {
    setResumeError(null);
    if (!file) return setResume(null);
    if (file.type !== "application/pdf") {
      return setResumeError("Your resume must be a PDF.");
    }
    if (file.size > 1.4 * 1024 * 1024) {
      return setResumeError("That PDF is over 1.4 MB. Please compress it.");
    }
    const reader = new FileReader();
    reader.onload = () =>
      setResume({ fileName: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => setResumeError("Could not read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <LiquidGlass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">{initiative.title}</h3>
          <p className="mt-1 text-sm text-white/60">
            Led by {initiative.leaderName ?? "a project leader"} ·{" "}
            {seatLabel(initiative.accepted, initiative.maxMembers)}
            {initiative.commitment ? ` · ${initiative.commitment}` : ""}
          </p>
        </div>

        {initiative.isFull ? (
          <span className="shrink-0 text-sm font-semibold text-white/50">
            Full
          </span>
        ) : (
          !writing &&
          canApply && (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Apply
            </button>
          )
        )}
      </div>

      {initiative.summary && (
        <p className="mt-3 text-sm text-white/80">{initiative.summary}</p>
      )}
      {initiative.description && (
        <p className="mt-2 whitespace-pre-line text-sm text-white/60">
          {initiative.description}
        </p>
      )}

      {!canApply && !initiative.isFull && (
        <p className="mt-3 text-sm text-white/50">
          An active membership is required to join.{" "}
          <Link
            href="/dashboard"
            className="font-semibold text-white underline"
          >
            Become a member
          </Link>
        </p>
      )}

      {writing && (
        <form
          className="mt-4 border-t border-white/10 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            join.mutate({
              initiativeId: initiative.id,
              pitch: pitch.trim(),
              resume: resume ?? undefined,
            });
          }}
        >
          <label
            htmlFor={`pitch-${initiative.id}`}
            className="text-xs font-semibold uppercase tracking-wide text-white/50"
          >
            Why do you want to join?
          </label>
          <textarea
            id={`pitch-${initiative.id}`}
            rows={3}
            required
            maxLength={1000}
            value={pitch}
            onChange={(event) => setPitch(event.target.value)}
            placeholder="What you want to work on, and what you have built before."
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />

          <label
            htmlFor={`resume-${initiative.id}`}
            className="mt-4 block text-xs font-semibold uppercase tracking-wide text-white/50"
          >
            Resume (PDF, optional)
          </label>
          <input
            id={`resume-${initiative.id}`}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => readResume(event.target.files?.[0])}
            className="mt-2 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20"
          />
          {resume && (
            <p className="mt-2 text-xs text-white/50">
              Attached: {resume.fileName}
            </p>
          )}
          {resumeError && (
            <p aria-live="polite" className="mt-2 text-xs text-red-300">
              {resumeError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={join.isPending || !pitch.trim()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {join.isPending ? "Sending…" : "Send application"}
            </button>
            <button
              type="button"
              onClick={() => {
                setWriting(false);
                join.reset();
              }}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
            >
              Cancel
            </button>
          </div>

          {join.error && (
            <p aria-live="polite" className="mt-3 text-sm text-red-300">
              {join.error.message}
            </p>
          )}
        </form>
      )}
    </LiquidGlass>
  );
}

function ApplicationRow({ application }: { application: MyApplication }) {
  const utils = trpc.useUtils();
  const [confirm, setConfirm] = useState(false);

  const withdraw = trpc.initiative.withdraw.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.initiative.list.invalidate(),
        utils.initiative.myApplications.invalidate(),
      ]);
    },
  });

  // Nothing to leave once the leader has said no, and an archived project is
  // over — the control would change nothing either way.
  const canWithdraw =
    application.myStatus !== "rejected" && application.archivedAt === null;

  return (
    <LiquidGlass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{application.title}</h3>
            <ApplicationChip status={application.myStatus} />
          </div>
          <p className="mt-1 text-sm text-white/60">
            Led by {application.leaderName ?? "a project leader"}
            {application.archivedAt !== null ? " · archived" : ""}
          </p>
          {application.leaderEmail && (
            <p className="mt-1 text-sm text-white/60">
              Reach them at{" "}
              <a
                href={`mailto:${application.leaderEmail}`}
                className="font-semibold text-white underline"
              >
                {application.leaderEmail}
              </a>
            </p>
          )}
        </div>

        {canWithdraw &&
          (confirm ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/60">
                {application.myStatus === "accepted" ? "Leave?" : "Withdraw?"}
              </span>
              <button
                type="button"
                disabled={withdraw.isPending}
                onClick={() => {
                  withdraw.mutate({ initiativeId: application.id });
                  setConfirm(false);
                }}
                className="rounded-full bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="shrink-0 text-sm font-semibold text-white/50 transition hover:text-white"
            >
              {application.myStatus === "accepted" ? "Leave" : "Withdraw"}
            </button>
          ))}
      </div>

      {withdraw.error && (
        <p className="mt-3 text-sm text-red-300">{withdraw.error.message}</p>
      )}
    </LiquidGlass>
  );
}

export default function InitiativesPage() {
  const { data: session, status } = useSession();

  const open = trpc.initiative.list.useQuery(undefined, { enabled: !!session });
  const mine = trpc.initiative.myApplications.useQuery(undefined, {
    enabled: !!session,
  });
  const memberStatus = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });
  const proposals = trpc.initiative.myProposals.useQuery(undefined, {
    enabled: !!session,
  });

  if (
    status === "loading" ||
    open.isPending ||
    mine.isPending ||
    proposals.isPending
  ) {
    return <LoadingScreen />;
  }

  const applications = mine.data ?? [];
  const myProposals = proposals.data ?? [];
  // Already applied belongs in the member's own list, not in the one offering
  // them a chance to apply again.
  const joinable = (open.data ?? []).filter((row) => row.myStatus === null);
  const canApply = !!memberStatus.data?.isActive;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Rocket className="h-6 w-6 text-white/70" />
          <h1 className="text-2xl font-bold text-white">Projects</h1>
        </div>
        <p className="mt-2 text-white/60">
          Projects the club runs year-round. Leaders post what they are building
          and pick who joins.
        </p>
      </header>

      {(open.error ?? mine.error ?? proposals.error) && (
        <p className="mb-6 text-sm text-red-300">
          {(open.error ?? mine.error ?? proposals.error)?.message}
        </p>
      )}

      <ProposeSection canPropose={canApply} />

      {myProposals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
            What you proposed
          </h2>
          <div className="space-y-3">
            {myProposals.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </div>
        </section>
      )}

      {applications.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
            Your applications
          </h2>
          <div className="space-y-3">
            {applications.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Open to join
        </h2>
        {joinable.length > 0 ? (
          <div className="space-y-3">
            {joinable.map((initiative) => (
              <OpenRow
                key={initiative.id}
                initiative={initiative}
                canApply={canApply}
              />
            ))}
          </div>
        ) : (
          <LiquidGlass className="p-8 text-center">
            <p className="font-semibold text-white">
              {applications.length > 0
                ? "Nothing else open right now."
                : "No projects are taking applications."}
            </p>
            <p className="mt-2 text-sm text-white/60">
              Leaders open these up through the year. Check back, or ask at a
              general meeting what is being planned.
            </p>
          </LiquidGlass>
        )}
      </section>
    </div>
  );
}
