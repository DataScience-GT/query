"use client";

import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  chip,
  input,
  itemTitle,
  label,
  meta,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  plural,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Challenge } from "@/components/admin/judging/shared";

type Entry =
  RouterOutputs["judging"]["admin"]["listEntries"]["entries"][number];

const PAGE_SIZE = 50;

const SOURCES = [
  { id: "all", label: "All sources" },
  { id: "devpost", label: "Devpost" },
  { id: "portal", label: "Portal" },
] as const;

const STATUSES = [
  { id: "live", label: "Live" },
  { id: "removed", label: "Removed" },
  { id: "all", label: "Both" },
] as const;

/** The projects in judging, with their challenges and remove/restore. */
export function EntriesList({ hackathonId }: { hackathonId: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("all");
  const [state, setState] = useState<(typeof STATUSES)[number]["id"]>("live");
  const [challengeId, setChallengeId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const entries = trpc.judging.admin.listEntries.useQuery(
    {
      hackathonId,
      search: query || undefined,
      source,
      status: state,
      challengeId: challengeId || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { placeholderData: keepPreviousData },
  );
  const challenges = trpc.judging.admin.listChallenges.useQuery({
    hackathonId,
  });

  const tree = (challenges.data?.challenges ?? []).filter((c) => !c.parentId);
  const data = entries.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!query || source !== "all" || state !== "live" || !!challengeId;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className={itemTitle}>Projects in judging</h3>
        {data && (
          <p className={`${meta} tabular-nums`}>
            {plural(data.total, filtered ? "match" : "project", filtered ? "matches" : "projects")}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search projects"
            placeholder="Title, member name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${input} pl-9`}
          />
        </div>
        <select
          aria-label="Filter by challenge"
          value={challengeId}
          onChange={(e) => {
            setChallengeId(e.target.value);
            setPage(1);
          }}
          className={input}
        >
          <option value="">Every challenge</option>
          {tree
            .filter((c) => !c.isGroup)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          {tree
            .filter((c) => c.isGroup)
            .map((group) => (
              <optgroup key={group.id} label={group.label}>
                <option value={group.id}>Anywhere in {group.label}</option>
                {(challenges.data?.challenges ?? [])
                  .filter((c) => c.parentId === group.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SOURCES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={source === option.id}
            onClick={() => {
              setSource(option.id);
              setPage(1);
            }}
            className={chip(source === option.id)}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-[var(--border-subtle)]" aria-hidden="true" />
        {STATUSES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={state === option.id}
            onClick={() => {
              setState(option.id);
              setPage(1);
            }}
            className={chip(state === option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {entries.isLoading ? (
          <p className={body}>Loading projects…</p>
        ) : entries.isError || !data ? (
          <p className={body}>
            {trpcErrorMessage(entries.error, "Could not load the projects.")}{" "}
            <button
              type="button"
              onClick={() => entries.refetch()}
              className={textLink}
            >
              Try again
            </button>
          </p>
        ) : data.entries.length === 0 ? (
          <p className={`border-t border-[var(--border-subtle)] pt-6 ${body}`}>
            {filtered
              ? "No project matches. Clear the search or pick another filter."
              : "No projects yet. Import the Devpost export or promote portal submissions above."}
          </p>
        ) : (
          <ul
            className={`border-t border-[var(--border-subtle)] transition-opacity ${
              entries.isPlaceholderData ? "opacity-60" : ""
            }`}
          >
            {data.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                challenges={challenges.data?.challenges ?? []}
              />
            ))}
          </ul>
        )}
      </div>

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className={`${meta} tabular-nums`}>
            {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={btnSecondary}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className={btnSecondary}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  challenges,
}: {
  entry: Entry;
  challenges: Challenge[];
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    setError(null);
    void refresh();
  };
  const setChallenges = trpc.judging.admin.setEntryChallenges.useMutation({
    onSuccess: () => {
      setEditing(false);
      done();
    },
    onError: (e) => setError(trpcErrorMessage(e, "Could not save the challenges.")),
  });
  const remove = trpc.judging.admin.removeEntry.useMutation({
    onSuccess: done,
    onError: (e) => setError(trpcErrorMessage(e, "Could not remove the project.")),
  });
  const restore = trpc.judging.admin.restoreEntry.useMutation({
    onSuccess: done,
    onError: (e) => setError(trpcErrorMessage(e, "Could not restore the project.")),
  });

  const optIns = entry.challenges.filter((c) => c.isOptIn);
  const derived = entry.challenges.filter((c) => !c.isOptIn);
  const linked = entry.members.filter((m) => m.linked).length;
  const removed = !!entry.deletedAt;
  const busy = setChallenges.isPending || remove.isPending || restore.isPending;

  const openEditor = () => {
    setChosen(new Set(optIns.map((c) => c.challengeId)));
    setError(null);
    setEditing(true);
  };

  return (
    <li className="border-b border-[var(--border-subtle)] py-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className={`flex flex-wrap items-center gap-x-2 ${label}`}>
            {entry.source === "devpost" ? "Devpost" : "Portal"}
            {removed && <span className={status("danger")}>Removed</span>}
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[var(--text-primary)] break-words">
            {entry.title}
            {entry.submissionUrl && (
              <a
                href={entry.submissionUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${entry.title} on Devpost`}
                className="ml-2 inline-flex align-middle text-[var(--text-subtle)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
          </p>
          <p className={`mt-1 ${meta}`}>
            {entry.members.length === 0
              ? "No members listed"
              : `${entry.members.map((m) => m.name).join(", ")} · ${linked} of ${entry.members.length} linked`}
          </p>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {optIns.length > 0
              ? optIns.map((c) => c.label).join(" · ")
              : "No challenges chosen"}
            {derived.length > 0 && (
              <span className="text-[var(--text-subtle)]">
                {" "}
                · also in {derived.map((c) => c.label).join(", ")}
              </span>
            )}
          </p>
          {(entry.appointments > 0 || entry.completeEvaluations > 0) && (
            <p className={`mt-1 ${meta} tabular-nums`}>
              {plural(entry.appointments, "presentation")} scheduled ·{" "}
              {plural(entry.completeEvaluations, "evaluation")} complete
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!removed && (
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : openEditor())}
              aria-expanded={editing}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnSecondary}
            >
              Challenges
            </button>
          )}
          {removed ? (
            <button
              type="button"
              onClick={() => restore.mutate({ entryId: entry.id })}
              disabled={readOnly || busy}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnSecondary}
            >
              {restore.isPending ? "Restoring…" : "Restore"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    `Take ${entry.title} out of judging? ${
                      entry.source === "portal"
                        ? "The team cannot resubmit it from the portal while it is removed."
                        : "Importing the Devpost file again will not bring it back; restore it here instead."
                    }`,
                  )
                )
                  return;
                remove.mutate({ entryId: entry.id });
              }}
              disabled={readOnly || busy || entry.appointments > 0}
              title={
                readOnly
                  ? READ_ONLY_TITLE
                  : entry.appointments > 0
                    ? "On the saved schedule. Drop the schedule before removing it."
                    : undefined
              }
              className={btnDanger}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}

      {editing && (
        <ChallengePicker
          challenges={challenges}
          chosen={chosen}
          onToggle={(id) =>
            setChosen((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          saving={setChallenges.isPending}
          readOnly={readOnly}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSave={() =>
            setChallenges.mutate({
              entryId: entry.id,
              challengeIds: [...chosen],
            })
          }
        />
      )}
    </li>
  );
}

/**
 * Opt-ins only. Groups and general challenges are not choices: a project is
 * in a group through its challenges, and in every general challenge anyway.
 */
function ChallengePicker({
  challenges,
  chosen,
  onToggle,
  saving,
  readOnly,
  onCancel,
  onSave,
}: {
  challenges: Challenge[];
  chosen: Set<string>;
  onToggle: (id: string) => void;
  saving: boolean;
  readOnly: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const choosable = challenges.filter((c) => !c.isGroup && !c.isGeneral);
  const groups = [
    {
      id: "top",
      label: "Top level",
      items: choosable.filter((c) => !c.parentId),
    },
    ...challenges
      .filter((c) => c.isGroup)
      .map((group) => ({
        id: group.id,
        label: group.label,
        items: choosable.filter((c) => c.parentId === group.id),
      })),
  ].filter((group) => group.items.length > 0);

  return (
    <div className="mt-4 border-l-2 border-accent pl-4">
      {groups.length === 0 ? (
        <p className={body}>
          No challenges to choose from yet. Add them on{" "}
          <a href="#challenges" className={textLink}>
            Challenges
          </a>
          .
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups.map((group) => (
            <fieldset key={group.id}>
              <legend className={label}>{group.label}</legend>
              <div className="mt-1">
                {group.items.map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <p className={`mt-3 ${meta}`}>
        A challenge this project has presented in or been scored in cannot be
        taken away.
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={readOnly || saving}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnInk}
        >
          {saving ? "Saving…" : "Save challenges"}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}
