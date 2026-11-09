"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
  object,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
} from "@/components/portal/ui";
import { trpc } from "@/lib/trpc";
import { loginHref } from "@/lib/safe-callback";
import type { RouterOutputs } from "@query/api";

type OpenInitiative = RouterOutputs["initiative"]["list"][number];
type MyApplication = RouterOutputs["initiative"]["myApplications"][number];
type MyProposal = RouterOutputs["initiative"]["myProposals"][number];

const errorText = "text-sm text-[var(--danger)]";
const quietAction =
  "text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50";
const inlineLink =
  "font-semibold text-[var(--text-primary)] underline decoration-accent underline-offset-4 hover:decoration-[var(--text-primary)]";
const listRow = "border-b border-[var(--border-subtle)] py-5";

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
      <section className="mt-12 flex flex-col justify-between gap-4 border-t border-[var(--border-subtle)] pt-6 md:flex-row md:items-end">
        <div>
          <h2 className={sectionTitle}>Have something to build?</h2>
          <p className={`${body} mt-2 max-w-xl`}>
            Pitch it. If it is approved you become its project leader and pick
            who joins.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${btnSecondary} shrink-0 self-start md:self-auto`}
        >
          Propose a project
        </button>
      </section>
    );
  }

  return (
    <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          propose.mutate(toInput(draft));
        }}
      >
        <h2 className={sectionTitle}>Propose a project</h2>
        <p className={`${body} mt-2 mb-5 max-w-xl`}>
          An organiser reviews it. If it is approved you lead it and pick who
          joins.
        </p>
        <InitiativeFields draft={draft} onChange={setDraft} />

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={propose.isPending}
            className={btnPrimary}
          >
            {propose.isPending ? "Sending…" : "Send for review"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              propose.reset();
            }}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>

        {propose.error && (
          <p aria-live="polite" className={`${errorText} mt-3`}>
            {propose.error.message}
          </p>
        )}
      </form>
    </section>
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
    <li className={listRow}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {proposal.title}
            </h3>
            <InitiativeChip state={state} />
          </div>
          {proposal.summary && (
            <p className={`${body} mt-1`}>{proposal.summary}</p>
          )}

          {/* The reviewer's note is the whole point of a decline — without it a
              member has no idea what to change before pitching again. */}
          {proposal.reviewNote && (
            <p
              className={`${body} mt-3 border-l-2 border-[var(--border-medium)] pl-3`}
            >
              {proposal.reviewNote}
            </p>
          )}

          {proposal.status === "draft" && (
            <p className={`${body} mt-2`}>
              Approved. Finish writing it and open it to members from{" "}
              <Link href="/lead" className={inlineLink}>
                your projects
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
            className={`${quietAction} shrink-0`}
          >
            Withdraw
          </button>
        )}
      </div>

      {withdraw.error && (
        <p className={`${errorText} mt-3`}>{withdraw.error.message}</p>
      )}
    </li>
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
    // Cleared first: a rejected pick must not leave the previous file attached
    // and submitted under the error.
    setResume(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      return setResumeError(
        "Your resume must be a PDF. Export it as one and try again.",
      );
    }
    if (file.size > 1.4 * 1024 * 1024) {
      return setResumeError(
        "That PDF is over 1.4 MB. Compress it and try again.",
      );
    }
    const reader = new FileReader();
    reader.onload = () =>
      setResume({ fileName: file.name, dataUrl: String(reader.result) });
    reader.onerror = () =>
      setResumeError("Could not read that file. Try choosing it again.");
    reader.readAsDataURL(file);
  };

  return (
    <li className={`${object} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={itemTitle}>{initiative.title}</h3>
          <p className={`${meta} mt-1`}>
            Led by {initiative.leaderName ?? "a project leader"} ·{" "}
            {seatLabel(initiative.accepted, initiative.maxMembers)}
            {initiative.commitment ? ` · ${initiative.commitment}` : ""}
          </p>
        </div>

        {initiative.isFull ? (
          <span className="shrink-0 text-sm font-semibold text-[var(--text-subtle)]">
            Full
          </span>
        ) : (
          !writing &&
          canApply && (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className={`${btnSecondary} shrink-0`}
            >
              Apply
            </button>
          )
        )}
      </div>

      {initiative.summary && (
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {initiative.summary}
        </p>
      )}
      {initiative.description && (
        <p className={`${body} mt-2 whitespace-pre-line`}>
          {initiative.description}
        </p>
      )}

      {!canApply && !initiative.isFull && (
        <p className={`${meta} mt-3`}>
          Joining needs an active membership.{" "}
          <Link href="/dashboard" className={inlineLink}>
            Become a member
          </Link>
        </p>
      )}

      {writing && (
        <form
          className="mt-5 border-t border-[var(--border-subtle)] pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            join.mutate({
              initiativeId: initiative.id,
              pitch: pitch.trim(),
              resume: resume ?? undefined,
            });
          }}
        >
          <label htmlFor={`pitch-${initiative.id}`} className={fieldLabel}>
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
            className={input}
          />

          <label
            htmlFor={`resume-${initiative.id}`}
            className={`${fieldLabel} mt-5`}
          >
            Resume (PDF, optional)
          </label>
          <input
            id={`resume-${initiative.id}`}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => readResume(event.target.files?.[0])}
            className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:cursor-pointer file:rounded-[var(--radius-sm)] file:border file:border-solid file:border-[var(--border-medium)] file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--text-primary)] hover:file:bg-[var(--bg-secondary)]"
          />
          {resume && <p className={fieldHint}>Attached: {resume.fileName}</p>}
          {resumeError && (
            <p aria-live="polite" className={`${errorText} mt-1.5`}>
              {resumeError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={join.isPending || !pitch.trim()}
              className={btnPrimary}
            >
              {join.isPending ? "Sending…" : "Send application"}
            </button>
            <button
              type="button"
              onClick={() => {
                setWriting(false);
                join.reset();
              }}
              className={btnSecondary}
            >
              Cancel
            </button>
          </div>

          {join.error && (
            <p aria-live="polite" className={`${errorText} mt-3`}>
              {join.error.message}
            </p>
          )}
        </form>
      )}
    </li>
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
  const leaving = application.myStatus === "accepted";

  return (
    <li className={listRow}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {application.title}
            </h3>
            <ApplicationChip status={application.myStatus} />
          </div>
          <p className={`${meta} mt-1`}>
            Led by {application.leaderName ?? "a project leader"}
            {application.archivedAt !== null ? " · archived" : ""}
          </p>
          {application.leaderEmail && (
            <p className={`${body} mt-1`}>
              Reach them at{" "}
              <a
                href={`mailto:${application.leaderEmail}`}
                className={inlineLink}
              >
                {application.leaderEmail}
              </a>
            </p>
          )}
        </div>

        {canWithdraw &&
          (confirm ? (
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-[var(--text-muted)]">
                {leaving ? "Leave this project?" : "Withdraw your application?"}
              </span>
              <button
                type="button"
                disabled={withdraw.isPending}
                onClick={() => {
                  withdraw.mutate({ initiativeId: application.id });
                  setConfirm(false);
                }}
                className={btnDanger}
              >
                {leaving ? "Leave" : "Withdraw"}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className={`${quietAction} shrink-0`}
            >
              {leaving ? "Leave" : "Withdraw"}
            </button>
          ))}
      </div>

      {withdraw.error && (
        <p className={`${errorText} mt-3`}>{withdraw.error.message}</p>
      )}
    </li>
  );
}

export default function InitiativesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // Queries wait on the session, so a signed-out visitor otherwise sits on
  // the loading screen forever.
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

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
  const loadError = open.error ?? mine.error ?? proposals.error;

  return (
    <div className={page}>
      <Link
        href="/dashboard"
        className="text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]"
      >
        ← Dashboard
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>
          {joinable.length > 0
            ? `${joinable.length} club project${joinable.length === 1 ? " is" : "s are"} taking members`
            : "Club projects"}
        </h1>
        <p className={pageDek}>
          Projects the club runs year-round. Leaders post what they are building
          and pick who joins.
        </p>
      </header>

      {loadError && (
        <p className={`${errorText} mt-6`}>
          {loadError.message} Refresh the page to try again.
        </p>
      )}

      <section className="mt-10">
        <h2 className={sectionTitle}>Open to join</h2>
        {joinable.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {joinable.map((initiative) => (
              <OpenRow
                key={initiative.id}
                initiative={initiative}
                canApply={canApply}
              />
            ))}
          </ul>
        ) : (
          <p className={`${body} mt-3 max-w-xl`}>
            {applications.length > 0
              ? "Nothing else is open right now."
              : "No projects are taking applications right now."}{" "}
            Leaders open them through the year, so check back or ask at a
            general meeting what is being planned.
          </p>
        )}
      </section>

      {applications.length > 0 && (
        <section className="mt-12">
          <h2 className={sectionTitle}>Your applications</h2>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {applications.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </ul>
        </section>
      )}

      {myProposals.length > 0 && (
        <section className="mt-12">
          <h2 className={sectionTitle}>What you proposed</h2>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {myProposals.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </ul>
        </section>
      )}

      <ProposeSection canPropose={canApply} />
    </div>
  );
}
