"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  SubteamApplicationChip,
  SubteamChip,
  shortDate,
} from "@/components/portal/subteams/chips";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import type { RouterOutputs } from "@query/api";
import type { SubteamApplicationStatus } from "@query/db";
import {
  body,
  btnDanger,
  btnInk,
  btnPrimary,
  btnSecondary,
  chip,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
  page,
  pageDek,
  sectionTitle,
} from "@/components/portal/ui";

type SubteamRow = RouterOutputs["subteam"]["adminList"][number];
type Applicant = RouterOutputs["subteam"]["applicants"]["applicants"][number];
type RosterMember = RouterOutputs["subteam"]["roster"][number];

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";
const errorText = "mt-3 text-[13px] text-[var(--danger)]";
const quietAction =
  "text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed";
const backLink =
  "text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]";
const quote = `${body} whitespace-pre-line border-l-2 border-[var(--border-medium)] pl-3`;

// The router's limit, repeated so the add button can stop at it.
const MAX_QUESTIONS = 10;

/** Delays a fast-changing value so it can drive a query without firing one per
 *  keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

type QuestionDraft = { id: string; prompt: string; required: boolean };

type Draft = {
  name: string;
  summary: string;
  description: string;
  isOpen: boolean;
  questions: QuestionDraft[];
};

const draftFrom = (row?: SubteamRow): Draft => ({
  name: row?.name ?? "",
  summary: row?.summary ?? "",
  description: row?.description ?? "",
  isOpen: row?.isOpen ?? false,
  questions: row?.questions.map((question) => ({ ...question })) ?? [],
});

/**
 * Create and edit share one form. A question keeps its id across edits, so the
 * answers already given stay matched to it; a new one is named here and the
 * server keeps that name.
 */
function SubteamForm({
  subteam,
  onDone,
}: {
  subteam?: SubteamRow;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [draft, setDraft] = useState(() => draftFrom(subteam));

  const onSuccess = async () => {
    onDone();
    await utils.subteam.adminList.invalidate();
  };
  const create = trpc.subteam.create.useMutation({ onSuccess });
  const update = trpc.subteam.update.useMutation({ onSuccess });
  const save = subteam ? update : create;

  const setQuestion = (index: number, patch: Partial<QuestionDraft>) =>
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((question, i) =>
        i === index ? { ...question, ...patch } : question,
      ),
    }));

  const archived = !!subteam && subteam.archivedAt !== null;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const values = {
          name: draft.name.trim(),
          summary: draft.summary.trim() || undefined,
          description: draft.description.trim() || undefined,
          isOpen: draft.isOpen,
          questions: draft.questions.map((question) => ({
            ...question,
            prompt: question.prompt.trim(),
          })),
        };
        if (subteam) update.mutate({ id: subteam.id, ...values });
        else create.mutate(values);
      }}
    >
      <div>
        <label htmlFor="subteam-name" className={fieldLabel}>
          Name
        </label>
        <input
          id="subteam-name"
          required
          maxLength={120}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="subteam-summary" className={fieldLabel}>
          Short description
        </label>
        <input
          id="subteam-summary"
          maxLength={300}
          value={draft.summary}
          onChange={(event) =>
            setDraft({ ...draft, summary: event.target.value })
          }
          placeholder="One line a member reads before opening it"
          className={input}
        />
      </div>
      <div>
        <label htmlFor="subteam-description" className={fieldLabel}>
          What you would do
        </label>
        <textarea
          id="subteam-description"
          rows={4}
          maxLength={4000}
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
          className={input}
        />
      </div>

      <fieldset>
        <legend className={fieldLabel}>Application questions</legend>
        {draft.questions.length === 0 && (
          <p className={fieldHint}>
            No questions yet. Members can still apply with a note.
          </p>
        )}
        <ol className="space-y-3">
          {draft.questions.map((question, index) => (
            <li
              key={question.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input
                aria-label={`Question ${index + 1}`}
                required
                maxLength={300}
                value={question.prompt}
                onChange={(event) =>
                  setQuestion(index, { prompt: event.target.value })
                }
                placeholder="Why this subteam?"
                className={`${input} sm:flex-1`}
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                      setQuestion(index, { required: event.target.checked })
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      questions: prev.questions.filter((_, i) => i !== index),
                    }))
                  }
                  className={quietAction}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={draft.questions.length >= MAX_QUESTIONS}
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              questions: [
                ...prev.questions,
                { id: crypto.randomUUID(), prompt: "", required: true },
              ],
            }))
          }
          className={`${quietAction} mt-3`}
        >
          Add a question
        </button>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={draft.isOpen}
          disabled={archived}
          onChange={(event) =>
            setDraft({ ...draft, isOpen: event.target.checked })
          }
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Taking applications
        {archived && <span className={meta}>(restore it first)</span>}
      </label>

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          disabled={readOnly || save.isPending}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnPrimary}
        >
          {save.isPending
            ? "Saving…"
            : subteam
              ? "Save changes"
              : "Create subteam"}
        </button>
        <button
          type="button"
          onClick={() => {
            save.reset();
            onDone();
          }}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>

      {save.error && (
        <p role="alert" className={errorText}>
          {save.error.message}
        </p>
      )}
    </form>
  );
}

function SubteamListRow({
  subteam,
  onReview,
}: {
  subteam: SubteamRow;
  onReview: () => void;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [editing, setEditing] = useState(false);
  const archived = subteam.archivedAt !== null;

  const setArchived = trpc.subteam.setArchived.useMutation({
    onSuccess: async () => {
      await utils.subteam.adminList.invalidate();
    },
  });

  if (editing) {
    return (
      <div className="py-6">
        <h3 className={`${itemTitle} mb-4`}>Edit {subteam.name}</h3>
        <SubteamForm subteam={subteam} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className={itemTitle}>{subteam.name}</h3>
            <SubteamChip
              isOpen={subteam.isOpen}
              archivedAt={subteam.archivedAt}
            />
          </div>
          {subteam.summary && (
            <p className={`${body} mt-1`}>{subteam.summary}</p>
          )}
          <p className={`${meta} mt-2 tabular-nums`}>
            {subteam.pending} waiting · {subteam.accepted} on the team ·{" "}
            {subteam.questions.length} question
            {subteam.questions.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <button type="button" onClick={onReview} className={btnSecondary}>
            Review
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={quietAction}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={readOnly || setArchived.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() =>
              setArchived.mutate({ id: subteam.id, archived: !archived })
            }
            className={quietAction}
          >
            {archived ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      {setArchived.error && (
        <p role="alert" className={errorText}>
          {setArchived.error.message}
        </p>
      )}
    </div>
  );
}

function ApplicantRow({
  applicant,
  archived,
  onChanged,
}: {
  applicant: Applicant;
  archived: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const readOnly = useReadOnly();
  const [note, setNote] = useState("");
  const [writingNote, setWritingNote] = useState(false);

  const decide = trpc.subteam.decide.useMutation({ onSuccess: onChanged });
  const send = (decision: "accepted" | "rejected") =>
    decide.mutate({
      applicationId: applicant.id,
      decision,
      note: note.trim() || undefined,
    });

  const blocked = readOnly || archived || decide.isPending;

  return (
    <li className="border-b border-[var(--border-subtle)] py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          {applicant.name ?? applicant.email}
        </p>
        <SubteamApplicationChip status={applicant.status} side="admin" />
      </div>
      <p className={`${meta} mt-0.5 break-all`}>
        <a
          href={`mailto:${applicant.email}`}
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          {applicant.email}
        </a>{" "}
        · applied {shortDate(applicant.appliedAt)}
      </p>

      {applicant.answers.length > 0 && (
        <dl className="mt-4 max-w-2xl space-y-3">
          {applicant.answers.map((row) => (
            <div key={row.questionId}>
              <dt className={meta}>{row.prompt}</dt>
              <dd className={`${body} mt-0.5 whitespace-pre-line`}>
                {row.answer}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {applicant.note && (
        <p className={`${quote} mt-4 max-w-2xl`}>{applicant.note}</p>
      )}
      {applicant.decisionNote && applicant.status !== "pending" && (
        <p className={`${meta} mt-3`}>Note sent: {applicant.decisionNote}</p>
      )}

      {applicant.status === "pending" && (
        <div className="mt-4">
          {writingNote && (
            <div className="mb-3 max-w-2xl">
              <label htmlFor={`note-${applicant.id}`} className={fieldLabel}>
                Note to them (sent with the decision)
              </label>
              <textarea
                id={`note-${applicant.id}`}
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={input}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={blocked}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onClick={() => send("accepted")}
              className={btnInk}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={blocked}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onClick={() => send("rejected")}
              className={btnSecondary}
            >
              Reject
            </button>
            {!writingNote && (
              <button
                type="button"
                onClick={() => setWritingNote(true)}
                className={quietAction}
              >
                Add a note
              </button>
            )}
          </div>
        </div>
      )}

      {decide.error && (
        <p role="alert" className={errorText}>
          {decide.error.message}
        </p>
      )}
    </li>
  );
}

function RosterRow({
  member,
  onChanged,
}: {
  member: RosterMember;
  onChanged: () => Promise<unknown>;
}) {
  const readOnly = useReadOnly();
  const [confirm, setConfirm] = useState(false);
  const remove = trpc.subteam.removeMember.useMutation({
    onSuccess: onChanged,
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          {member.name ?? member.email}
        </p>
        <p className={`${meta} break-all`}>
          {member.email}
          {member.decidedAt ? ` · since ${shortDate(member.decidedAt)}` : ""}
        </p>
        {remove.error && (
          <p role="alert" className={errorText}>
            {remove.error.message}
          </p>
        )}
      </div>

      {confirm ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">
            Take them off the subteam?
          </span>
          <button
            type="button"
            disabled={readOnly || remove.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => {
              remove.mutate({ applicationId: member.id });
              setConfirm(false);
            }}
            className={btnDanger}
          >
            Remove
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
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          onClick={() => setConfirm(true)}
          className={quietAction}
        >
          Remove
        </button>
      )}
    </li>
  );
}

const FILTERS: { value: SubteamApplicationStatus | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "removed", label: "Removed" },
];

function SubteamReview({
  subteam,
  onBack,
}: {
  subteam: SubteamRow;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  // Waiting first: that is the queue somebody opened this to work.
  const [filter, setFilter] = useState<SubteamApplicationStatus | null>(
    "pending",
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const archived = subteam.archivedAt !== null;

  const applicants = trpc.subteam.applicants.useQuery(
    {
      subteamId: subteam.id,
      status: filter ?? undefined,
      search: debouncedSearch.trim() || undefined,
    },
    { placeholderData: (previous) => previous },
  );
  const roster = trpc.subteam.roster.useQuery({ subteamId: subteam.id });

  // A decision moves a row between filters, onto the roster, and changes the
  // counts on the list behind this view.
  const refresh = () =>
    Promise.all([
      utils.subteam.applicants.invalidate({ subteamId: subteam.id }),
      utils.subteam.roster.invalidate({ subteamId: subteam.id }),
      utils.subteam.adminList.invalidate(),
    ]);

  const counts = applicants.data?.counts;
  const total = counts
    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
    : null;
  const rows = applicants.data?.applicants ?? [];
  const members = roster.data ?? [];

  return (
    <div className={page}>
      <button type="button" onClick={onBack} className={backLink}>
        ← All subteams
      </button>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={adminTitle}>{subteam.name}</h1>
          <SubteamChip
            isOpen={subteam.isOpen}
            archivedAt={subteam.archivedAt}
          />
        </div>
        {archived && (
          <p className={pageDek}>
            Archived, so decisions are paused. Restore it from the list to
            review again.
          </p>
        )}
      </header>

      <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={sectionTitle}>On the team</h2>
          <span className={`${meta} tabular-nums`}>{members.length}</span>
        </div>
        {roster.error ? (
          <p role="alert" className={errorText}>
            {roster.error.message}
          </p>
        ) : members.length > 0 ? (
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {members.map((member) => (
              <RosterRow key={member.id} member={member} onChanged={refresh} />
            ))}
          </ul>
        ) : (
          <p className={`${body} mt-3`}>
            {roster.isPending
              ? "Loading…"
              : "Nobody yet. Accepted applicants show up here."}
          </p>
        )}
      </section>

      <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={sectionTitle}>Applications</h2>
          {total !== null && (
            <span className={`${meta} tabular-nums`}>{total}</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={chip(filter === option.value)}
            >
              {option.label}
              {counts && option.value ? (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {counts[option.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <label htmlFor="applicant-search" className="sr-only">
          Search by name or email
        </label>
        <input
          id="applicant-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          placeholder="Search by name or email"
          className={`${input} mt-4 max-w-md`}
        />

        {applicants.error ? (
          <p role="alert" className={errorText}>
            {applicants.error.message}
          </p>
        ) : applicants.isPending ? (
          <p className={`${body} mt-6`}>Loading…</p>
        ) : rows.length > 0 ? (
          <ul className="mt-6 border-t border-[var(--border-subtle)]">
            {rows.map((applicant) => (
              <ApplicantRow
                key={applicant.id}
                applicant={applicant}
                archived={archived}
                onChanged={refresh}
              />
            ))}
          </ul>
        ) : (
          <p className={`${body} mt-6`}>
            {debouncedSearch.trim() || filter
              ? "Nothing matches that filter."
              : "Nobody has applied yet."}
          </p>
        )}
      </section>
    </div>
  );
}

export default function AdminSubteamsPage() {
  const { data: session, status } = useSession();
  const readOnly = useReadOnly();
  const [creating, setCreating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const list = trpc.subteam.adminList.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || list.isPending) return <LoadingScreen />;

  if (list.error) {
    return (
      <div className={page}>
        <h1 className={adminTitle}>Subteams</h1>
        <p role="alert" className="mt-3 text-[15px] text-[var(--danger)]">
          {list.error.message} Refresh the page to try again.
        </p>
      </div>
    );
  }

  const rows = list.data ?? [];
  const reviewing = rows.find((row) => row.id === reviewingId);
  if (reviewing) {
    return (
      <SubteamReview subteam={reviewing} onBack={() => setReviewingId(null)} />
    );
  }

  // Live ones first; archived stay reachable for their history.
  const active = rows.filter((row) => row.archivedAt === null);
  const archived = rows.filter((row) => row.archivedAt !== null);

  return (
    <div className={page}>
      <h1 className={adminTitle}>Subteams</h1>
      <p className={pageDek}>
        The groups members apply to join. Write the questions, open it, then
        accept people onto the team.
      </p>

      <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        {creating ? (
          <>
            <h2 className={`${sectionTitle} mb-5`}>New subteam</h2>
            <SubteamForm onDone={() => setCreating(false)} />
          </>
        ) : (
          <button
            type="button"
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => setCreating(true)}
            className={btnPrimary}
          >
            New subteam
          </button>
        )}
      </section>

      <section className="mt-10">
        {active.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {active.map((subteam) => (
              <SubteamListRow
                key={subteam.id}
                subteam={subteam}
                onReview={() => setReviewingId(subteam.id)}
              />
            ))}
          </div>
        ) : (
          <p className={`${body} max-w-xl`}>
            No subteams yet. Create one and open it when its questions are
            ready.
          </p>
        )}
      </section>

      {archived.length > 0 && (
        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <h2 className={sectionTitle}>Archived</h2>
          <div className="mt-2 divide-y divide-[var(--border-subtle)]">
            {archived.map((subteam) => (
              <SubteamListRow
                key={subteam.id}
                subteam={subteam}
                onReview={() => setReviewingId(subteam.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
