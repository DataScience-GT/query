"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  body,
  btnDanger,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  sectionRule,
  textLink,
} from "@/components/portal/ui";
import {
  ICON_STROKE,
  deskLabel,
  deskMeta,
  deskStatus,
  iconButton,
} from "./desk";
import type { ShortlistSection } from "./desk";

type Row = ShortlistSection["entries"][number];

/** A select that sizes to its options, for inline row controls. */
const inlineSelect =
  "min-h-11 max-w-[12rem] rounded-[var(--radius-sm)] border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 text-[15px] text-[var(--text-primary)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)] disabled:opacity-60";

function moved<T>(list: readonly T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type Actions = {
  moveSection: (from: number, step: -1 | 1) => void;
  renameSection: (sectionId: string, title: string, done: () => void) => void;
  removeSection: (sectionId: string) => void;
  add: (sectionId: string, entryId: string) => void;
  remove: (rowId: string) => void;
  moveTo: (rowId: string, sectionId: string) => void;
  moveRow: (section: ShortlistSection, from: number, step: -1 | 1) => void;
  setNote: (rowId: string, note: string, done: () => void) => void;
};

/**
 * A member judge's private shortlist for deliberation: sections they name,
 * holding projects they finished judging, in their order, with a note each.
 */
export function Shortlist({
  hackathonId,
  judgingState,
}: {
  hackathonId: string;
  judgingState: "draft" | "open" | "closed";
}) {
  const utils = trpc.useUtils();
  const list = trpc.judging.desk.deliberation.list.useQuery({ hackathonId });
  const mine = trpc.judging.desk.myEvaluations.useQuery({ hackathonId });
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const refresh = () => {
    setError(null);
    return utils.judging.desk.deliberation.list.invalidate({ hackathonId });
  };
  const onError = (e: Parameters<typeof trpcErrorMessage>[0]) =>
    setError(trpcErrorMessage(e, "That change did not save. Try again."));
  const settled = { onSuccess: refresh, onError };

  const addSection = trpc.judging.desk.deliberation.addSection.useMutation({
    onSuccess: () => {
      setNewTitle("");
      return refresh();
    },
    onError,
  });
  const renameSection =
    trpc.judging.desk.deliberation.renameSection.useMutation(settled);
  const removeSection =
    trpc.judging.desk.deliberation.removeSection.useMutation(settled);
  const reorderSections =
    trpc.judging.desk.deliberation.reorderSections.useMutation(settled);
  const add = trpc.judging.desk.deliberation.add.useMutation(settled);
  const remove = trpc.judging.desk.deliberation.remove.useMutation(settled);
  const move = trpc.judging.desk.deliberation.move.useMutation(settled);
  const reorder = trpc.judging.desk.deliberation.reorder.useMutation(settled);
  const setNote = trpc.judging.desk.deliberation.setNote.useMutation(settled);

  const writable = judgingState === "open";
  const busy = [
    addSection,
    renameSection,
    removeSection,
    reorderSections,
    add,
    remove,
    move,
    reorder,
    setNote,
  ].some((m) => m.isPending);
  const sections = list.data ?? [];

  // A project judged for two challenges is still one project to rank. One
  // with a score counts, as placings count it, so it can go on the shortlist.
  const finished = new Map<string, string>();
  for (const row of mine.data ?? []) {
    if (row.score !== null && !row.withdrawn) {
      finished.set(row.entryId, row.title);
    }
  }

  const actions: Actions = {
    moveSection: (from, step) =>
      reorderSections.mutate({
        hackathonId,
        sectionIds: moved(
          sections.map((s) => s.id),
          from,
          from + step,
        ),
      }),
    renameSection: (sectionId, title, done) =>
      renameSection.mutate(
        { hackathonId, sectionId, title },
        { onSuccess: done },
      ),
    removeSection: (sectionId) =>
      removeSection.mutate({ hackathonId, sectionId }),
    add: (sectionId, entryId) =>
      add.mutate({ hackathonId, sectionId, entryId }),
    remove: (rowId) => remove.mutate({ hackathonId, rowId }),
    moveTo: (rowId, sectionId) =>
      move.mutate({ hackathonId, rowId, sectionId }),
    moveRow: (section, from, step) =>
      reorder.mutate({
        hackathonId,
        sectionId: section.id,
        rowIds: moved(
          section.entries.map((row) => row.id),
          from,
          from + step,
        ),
      }),
    setNote: (rowId, note, done) =>
      setNote.mutate({ hackathonId, rowId, note }, { onSuccess: done }),
  };

  return (
    <div className="mt-8">
      <p className={body}>
        Only you see this. Sort the projects you finished into sections, put
        them in order, and keep a note on each for deliberation.
      </p>
      {!writable && (
        <p className={`mt-3 ${deskStatus("warning")}`}>
          {judgingState === "closed"
            ? "Judging is closed, so your shortlist is read-only."
            : "You can change your shortlist once judging opens."}
        </p>
      )}
      {finished.size === 0 && mine.data && (
        <p className={`mt-3 ${deskMeta}`}>
          Submit a complete evaluation and that project can go on your
          shortlist.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      {list.isPending ? (
        <p role="status" className={`mt-8 ${deskMeta}`}>
          Loading your shortlist…
        </p>
      ) : list.error ? (
        <div role="alert" className="mt-8">
          <p className={body}>
            {trpcErrorMessage(list.error, "Your shortlist did not load.")}
          </p>
          <button
            type="button"
            className={`${btnSecondary} mt-3 min-h-11`}
            onClick={() => void list.refetch()}
          >
            Try again
          </button>
        </div>
      ) : sections.length === 0 ? (
        <p className={`mt-8 ${body}`}>
          No sections yet. Add one below, such as &ldquo;Top three&rdquo; or
          &ldquo;Maybe&rdquo;.
        </p>
      ) : (
        sections.map((section, position) => (
          <SectionBlock
            key={section.id}
            section={section}
            position={position}
            count={sections.length}
            others={sections.filter((s) => s.id !== section.id)}
            finished={finished}
            disabled={!writable || busy}
            actions={actions}
          />
        ))
      )}

      {writable && (
        <form
          className={`mt-10 ${sectionRule}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) {
              addSection.mutate({ hackathonId, title: newTitle });
            }
          }}
        >
          <label htmlFor="new-section" className={fieldLabel}>
            New section
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="new-section"
              className={`${input} min-h-11 min-w-0 flex-1 basis-48`}
              maxLength={80}
              placeholder="Top three"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button
              type="submit"
              className={`${btnSecondary} min-h-11`}
              disabled={!newTitle.trim() || busy}
            >
              {addSection.isPending ? "Adding…" : "Add section"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  position,
  count,
  others,
  finished,
  disabled,
  actions,
}: {
  section: ShortlistSection;
  position: number;
  count: number;
  others: ShortlistSection[];
  finished: Map<string, string>;
  disabled: boolean;
  actions: Actions;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const listed = new Set(section.entries.map((row) => row.entryId));
  const addable = [...finished].filter(([entryId]) => !listed.has(entryId));
  const size = section.entries.length;

  return (
    <section className={`mt-8 ${sectionRule}`} aria-label={section.title}>
      {renaming ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) {
              actions.renameSection(section.id, title, () =>
                setRenaming(false),
              );
            }
          }}
        >
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor={`section-${section.id}`} className={fieldLabel}>
              Section name
            </label>
            <input
              id={`section-${section.id}`}
              className={`${input} min-h-11`}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={`${btnSecondary} min-h-11`}
            disabled={disabled || !title.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className={`${textLink} min-h-11`}
            onClick={() => {
              setTitle(section.title);
              setRenaming(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <h2 className={`min-w-0 flex-1 break-words ${itemTitle}`}>
            {section.title}
          </h2>
          <div className="-mr-2 -mt-1.5 flex shrink-0">
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${section.title} up`}
              disabled={disabled || position === 0}
              onClick={() => actions.moveSection(position, -1)}
            >
              <ArrowUp
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${section.title} down`}
              disabled={disabled || position === count - 1}
              onClick={() => actions.moveSection(position, 1)}
            >
              <ArrowDown
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Rename ${section.title}`}
              disabled={disabled}
              onClick={() => {
                setTitle(section.title);
                setRenaming(true);
              }}
            >
              <Pencil
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Delete ${section.title}`}
              disabled={disabled}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="mt-3">
          <p className={body}>
            Delete &ldquo;{section.title}&rdquo;
            {size > 0
              ? ` and the ${size === 1 ? "project" : `${size} projects`} in it, notes included`
              : ""}
            ? Your evaluations stay as they are.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className={`${btnDanger} min-h-11`}
              disabled={disabled}
              onClick={() => actions.removeSection(section.id)}
            >
              Delete section
            </button>
            <button
              type="button"
              className={`${textLink} min-h-11`}
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      )}

      {size === 0 ? (
        <p className={`mt-3 ${deskMeta}`}>No projects in this section yet.</p>
      ) : (
        <ol className="mt-3 border-t border-[var(--border-subtle)]">
          {section.entries.map((row, index) => (
            <ShortlistRow
              key={row.id}
              row={row}
              position={index}
              section={section}
              others={others}
              disabled={disabled}
              actions={actions}
            />
          ))}
        </ol>
      )}

      {addable.length > 0 && !disabled && (
        <div className="mt-4">
          <label htmlFor={`add-${section.id}`} className={deskLabel}>
            Add a project you judged
          </label>
          <select
            id={`add-${section.id}`}
            className={`${input} mt-1.5 min-h-11`}
            value=""
            onChange={(e) => {
              if (e.target.value) actions.add(section.id, e.target.value);
            }}
          >
            <option value="">Choose a project</option>
            {addable.map(([entryId, projectTitle]) => (
              <option key={entryId} value={entryId}>
                {projectTitle}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

function ShortlistRow({
  row,
  position,
  section,
  others,
  disabled,
  actions,
}: {
  row: Row;
  position: number;
  section: ShortlistSection;
  others: ShortlistSection[];
  disabled: boolean;
  actions: Actions;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(row.note);

  return (
    <li className="border-b border-[var(--border-subtle)] py-3">
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums text-[var(--text-muted)]">
          {position + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-[family-name:var(--font-display)] text-[19px] font-semibold leading-snug text-[var(--text-primary)]">
            {row.title}
          </p>
          {row.withdrawn && (
            <p className={`mt-1 ${deskStatus("neutral")}`}>
              Withdrawn by organisers
            </p>
          )}

          {editing ? (
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                actions.setNote(row.id, note, () => setEditing(false));
              }}
            >
              <label htmlFor={`note-${row.id}`} className="sr-only">
                Note on {row.title}
              </label>
              <textarea
                id={`note-${row.id}`}
                className={`${input} min-h-20 resize-y`}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className={`${btnSecondary} min-h-11`}
                  disabled={disabled}
                >
                  Save note
                </button>
                <button
                  type="button"
                  className={`${textLink} min-h-11`}
                  onClick={() => {
                    setNote(row.note);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {row.note && (
                <p className={`mt-1 whitespace-pre-line break-words ${body}`}>
                  {row.note}
                </p>
              )}
              {!disabled && (
                <button
                  type="button"
                  className={`${textLink} min-h-11`}
                  onClick={() => {
                    setNote(row.note);
                    setEditing(true);
                  }}
                >
                  {row.note ? "Edit note" : "Add a note"}
                </button>
              )}
            </>
          )}

          <div className="-ml-2 mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${row.title} up`}
              disabled={disabled || position === 0}
              onClick={() => actions.moveRow(section, position, -1)}
            >
              <ArrowUp
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${row.title} down`}
              disabled={disabled || position === section.entries.length - 1}
              onClick={() => actions.moveRow(section, position, 1)}
            >
              <ArrowDown
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            {others.length > 0 && (
              <select
                aria-label={`Move ${row.title} to another section`}
                className={inlineSelect}
                value=""
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.value) actions.moveTo(row.id, e.target.value);
                }}
              >
                <option value="">Move to section</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.title}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={iconButton}
              aria-label={`Remove ${row.title} from ${section.title}`}
              disabled={disabled}
              onClick={() => actions.remove(row.id)}
            >
              <X
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
