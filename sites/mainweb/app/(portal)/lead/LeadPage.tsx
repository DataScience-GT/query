"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  InitiativeChip,
  initiativeState,
  seatLabel,
} from "@/components/portal/initiatives/chips";
import {
  InitiativeFields,
  draftFrom,
  toInput,
} from "@/components/portal/initiatives/form-fields";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  chip,
  itemTitle,
  kicker,
  label,
  meta,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";
import { trpc } from "@/lib/trpc";
import { loginHref } from "@/lib/safe-callback";
import type { RouterOutputs } from "@query/api";

type LeadInitiative = RouterOutputs["initiative"]["listMine"][number];

const statuses = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

const errorText = "text-sm text-[var(--danger)]";
const quietAction =
  "text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50";

function InitiativeForm({
  initiative,
  onDone,
}: {
  initiative?: LeadInitiative;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => draftFrom(initiative));

  const done = async () => {
    await utils.initiative.listMine.invalidate();
    onDone();
  };

  const create = trpc.initiative.create.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = trpc.initiative.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const pending = create.isPending || update.isPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const values = toInput(draft);
        if (initiative) update.mutate({ ...values, id: initiative.id });
        else create.mutate(values);
      }}
    >
      <h2 className={`${itemTitle} mb-4`}>
        {initiative ? `Edit ${initiative.title}` : "New project"}
      </h2>

      <InitiativeFields draft={draft} onChange={setDraft} />

      {error && <p className={`${errorText} mt-3`}>{error}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : initiative ? "Save changes" : "Create draft"}
        </button>
        <button type="button" onClick={onDone} className={btnSecondary}>
          Cancel
        </button>
      </div>

      {!initiative && (
        <p className={`${meta} mt-3`}>
          It starts as a draft. Nothing reaches members until you open it.
        </p>
      )}
    </form>
  );
}

function InitiativeRow({ initiative }: { initiative: LeadInitiative }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // The applicants screen reads getById, so invalidating only the list leaves
  // it serving a stale initiative.
  const refresh = async () => {
    await Promise.all([
      utils.initiative.listMine.invalidate(),
      utils.initiative.getById.invalidate({ id: initiative.id }),
    ]);
  };

  const setStatus = trpc.initiative.setStatus.useMutation({
    onSuccess: refresh,
  });
  const archive = trpc.initiative.setArchived.useMutation({
    onSuccess: refresh,
  });

  if (editing) {
    return (
      <InitiativeForm
        initiative={initiative}
        onDone={() => setEditing(false)}
      />
    );
  }

  const state = initiativeState(initiative);
  const archived = state === "archived";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className={itemTitle}>{initiative.title}</h3>
            <InitiativeChip state={state} />
          </div>
          {initiative.summary && (
            <p className={`${body} mt-1`}>{initiative.summary}</p>
          )}
          <p className={`${meta} mt-1`}>
            {seatLabel(initiative.accepted, initiative.maxMembers)}
            {initiative.pending > 0
              ? ` · ${initiative.pending} waiting on you`
              : " · nobody waiting"}
          </p>
          {!initiative.isMine && (
            <p className={`${meta} mt-1`}>Led by {initiative.leaderName}</p>
          )}
        </div>

        <Link
          href={`/lead/${initiative.id}`}
          className={`${initiative.pending > 0 ? btnSecondary : textLink} shrink-0`}
        >
          {initiative.pending > 0
            ? `Review ${initiative.pending} application${initiative.pending === 1 ? "" : "s"}`
            : "Applications"}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="group"
          aria-label="Status"
          className="flex flex-wrap items-center gap-2"
        >
          <span className={label}>Status</span>
          {statuses.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={initiative.status === option.value}
              disabled={archived || setStatus.isPending}
              onClick={() =>
                setStatus.mutate({ id: initiative.id, status: option.value })
              }
              className={`${chip(initiative.status === option.value)} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className={textLink}
        >
          Edit
        </button>

        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {confirmArchive ? (
            <>
              <span className="text-sm text-[var(--text-muted)]">
                {archived ? "Restore this project?" : "Archive this project?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  archive.mutate({
                    id: initiative.id,
                    archived: !archived,
                  });
                  setConfirmArchive(false);
                }}
                className={archived ? btnSecondary : btnDanger}
              >
                {archived ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className={quietAction}
            >
              {archived ? "Restore" : "Archive"}
            </button>
          )}
        </div>
      </div>

      {(setStatus.error ?? archive.error) && (
        <p className={`${errorText} mt-3`}>
          {(setStatus.error ?? archive.error)?.message}
        </p>
      )}
    </>
  );
}

export default function LeadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // Queries wait on the session, so a signed-out visitor otherwise sits on
  // the loading screen forever.
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);
  const [creating, setCreating] = useState(false);

  const listing = trpc.initiative.listMine.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || listing.isPending) return <LoadingScreen />;

  if (listing.error) {
    const forbidden = listing.error.data?.code === "FORBIDDEN";
    return (
      <div className={page}>
        <h1 className={pageTitle}>
          {forbidden
            ? "This page is for project leaders"
            : "Your projects did not load"}
        </h1>
        <p className={pageDek}>
          {forbidden
            ? "Pitch a project from the projects page. If it is approved, you lead it and manage it here."
            : `${listing.error.message} Refresh the page to try again.`}
        </p>
        <Link href="/initiatives" className={`${textLink} mt-6`}>
          Browse projects instead
        </Link>
      </div>
    );
  }

  const initiatives = listing.data ?? [];
  const waiting = initiatives.reduce((total, row) => total + row.pending, 0);

  return (
    <div className={page}>
      <Link
        href="/initiatives"
        className="text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]"
      >
        ← Club projects
      </Link>

      <header className="mt-6 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className={kicker}>Projects you lead</p>
          <h1 className={`${pageTitle} mt-2`}>
            {waiting > 0
              ? `${waiting} application${waiting === 1 ? "" : "s"} waiting on you`
              : "Nothing waiting on you"}
          </h1>
          <p className={pageDek}>
            Open a project to members, review who applies, and keep the team
            list current.
          </p>
        </div>

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`${btnPrimary} shrink-0 self-start md:self-auto`}
          >
            New project
          </button>
        )}
      </header>

      {creating && (
        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <InitiativeForm onDone={() => setCreating(false)} />
        </section>
      )}

      {initiatives.length > 0 ? (
        <ul className="mt-10 border-t border-[var(--border-subtle)]">
          {initiatives.map((initiative) => (
            <li
              key={initiative.id}
              className="border-b border-[var(--border-subtle)] py-6"
            >
              <InitiativeRow initiative={initiative} />
            </li>
          ))}
        </ul>
      ) : (
        !creating && (
          <div className="mt-10 border-t border-[var(--border-subtle)] pt-6">
            <p className={`${body} max-w-xl`}>
              You have no projects yet. A new one starts as a draft, so you can
              write it up now and open it to members when you are ready.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={`${textLink} mt-4`}
            >
              Start a draft
            </button>
          </div>
        )
      )}
    </div>
  );
}
