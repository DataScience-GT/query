"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnInk,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  MODE_HINT,
  MODE_LABEL,
  plural,
  stationCount,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Challenge, Overview } from "@/components/admin/judging/shared";

type Mode = Challenge["mode"];

type Draft = {
  label: string;
  isGroup: boolean;
  /** "" is the top level. */
  parentId: string;
  mode: Mode;
  importLabelMatch: string;
  isGeneral: boolean;
};

const EMPTY: Draft = {
  label: "",
  isGroup: false,
  parentId: "",
  mode: "scheduled",
  importLabelMatch: "",
  isGeneral: false,
};

const fromChallenge = (c: Challenge): Draft => ({
  label: c.label,
  isGroup: c.isGroup,
  parentId: c.parentId ?? "",
  mode: c.mode,
  importLabelMatch: c.importLabelMatch ?? "",
  isGeneral: c.isGeneral,
});

/** The challenge tree: groups one level deep, modes, import matching. */
export function ChallengesSection({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const challenges = trpc.judging.admin.listChallenges.useQuery({ hackathonId });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null,
  );

  const initialize = trpc.judging.admin.initializeGroups.useMutation({
    onSuccess: () => void refresh(),
  });
  const create = trpc.judging.admin.createChallenge.useMutation({
    onSuccess: () => {
      setCreating(false);
      void refresh();
    },
  });
  const update = trpc.judging.admin.updateChallenge.useMutation({
    onSuccess: () => {
      setEditingId(null);
      void refresh();
    },
  });
  const remove = trpc.judging.admin.deleteChallenge.useMutation({
    onSuccess: () => {
      setRowError(null);
      void refresh();
    },
    onError: (e, input) =>
      setRowError({
        id: input.challengeId,
        message: trpcErrorMessage(e, "Could not delete the challenge."),
      }),
  });

  const list = challenges.data?.challenges ?? [];
  const locked = challenges.data?.structureLocked ?? false;
  const roots = list.filter((c) => !c.parentId);
  const groups = roots.filter((c) => c.isGroup);

  const describe = (c: Challenge) => {
    const parts: string[] = [];
    if (c.isGroup) parts.push("Group");
    if (c.isGeneral) parts.push("Every project");
    parts.push(
      c.parentId
        ? `${MODE_LABEL[c.effectiveMode ?? c.mode]}, from its group`
        : `${MODE_LABEL[c.mode]}: ${MODE_HINT[c.mode].toLowerCase()}`,
    );
    if (c.importLabelMatch) {
      parts.push(`Collects imported labels containing “${c.importLabelMatch}”`);
    }
    return parts.join(" · ");
  };

  const counts = (c: Challenge) =>
    [
      c.isGroup || c.isGeneral
        ? plural(c.entries, "project")
        : `${c.optIns} opted in`,
      c.children > 0 ? plural(c.children, "challenge") : null,
      !c.parentId ? stationCount(c.rooms, c.tables) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const row = (c: Challenge) => {
    const inUse = c.optIns > 0 || c.children > 0 || c.rooms > 0;
    const children = list.filter((child) => child.parentId === c.id);
    return (
      <li key={c.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[var(--text-primary)] break-words">
              {c.label}
            </p>
            <p className={`mt-0.5 ${meta}`}>{describe(c)}</p>
            <p className={`mt-0.5 ${meta} tabular-nums`}>{counts(c)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                update.reset();
                setCreating(false);
                setEditingId(editingId === c.id ? null : c.id);
              }}
              aria-expanded={editingId === c.id}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnSecondary}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Delete ${c.label}?`)) return;
                remove.mutate({ challengeId: c.id });
              }}
              disabled={readOnly || inUse || remove.isPending}
              title={
                readOnly
                  ? READ_ONLY_TITLE
                  : inUse
                    ? "Still in use by projects, challenges, rooms or tables."
                    : undefined
              }
              className={btnDanger}
            >
              Delete
            </button>
          </div>
        </div>
        {rowError?.id === c.id && (
          <div className="pb-4">
            <ErrorLine>{rowError.message}</ErrorLine>
          </div>
        )}
        {editingId === c.id && (
          <ChallengeForm
            initial={fromChallenge(c)}
            editing={c}
            groups={groups.filter((g) => g.id !== c.id)}
            locked={locked}
            pending={update.isPending}
            error={update.error ? trpcErrorMessage(update.error, "Could not save.") : null}
            readOnly={readOnly}
            onCancel={() => setEditingId(null)}
            onSubmit={(draft) => {
              const parentId = draft.parentId || null;
              const match = draft.importLabelMatch.trim() || null;
              update.mutate({
                challengeId: c.id,
                label: draft.label.trim() !== c.label ? draft.label.trim() : undefined,
                parentId: parentId !== c.parentId ? parentId : undefined,
                mode: !parentId && draft.mode !== c.mode ? draft.mode : undefined,
                importLabelMatch:
                  c.isGroup && match !== c.importLabelMatch ? match : undefined,
                isGeneral:
                  draft.isGeneral !== c.isGeneral ? draft.isGeneral : undefined,
              });
            }}
          />
        )}
        {children.length > 0 && (
          <ul className="mb-4 ml-2 border-l border-[var(--border-subtle)] pl-5">
            {children.map(row)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div>
          <h2 className={sectionTitle}>Challenges</h2>
          <p className={`mt-1 max-w-2xl ${meta}`}>
            Projects opt into challenges. A group holds challenges one level
            deep and lends them its mode; a room or table judges a top-level
            challenge or group.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            create.reset();
            setEditingId(null);
            setCreating(!creating);
          }}
          aria-expanded={creating}
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`${btnSecondary} shrink-0`}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New challenge
        </button>
      </div>

      {!overview.config.groupsInitializedAt && (
        <section className="border-l-2 border-accent pl-4">
          <h3 className={itemTitle}>Starter groups</h3>
          <p className={`mt-1 max-w-2xl ${body}`}>
            General (every project, scheduled) and MLH Challenges
            (collects imported labels containing “MLH”, unscheduled). Importing
            or promoting projects creates them too.
          </p>
          <button
            type="button"
            onClick={() => initialize.mutate({ hackathonId })}
            disabled={readOnly || initialize.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`mt-4 ${btnPrimary}`}
          >
            {initialize.isPending ? "Creating…" : "Create starter groups"}
          </button>
          {initialize.error && (
            <div className="mt-3">
              <ErrorLine>
                {trpcErrorMessage(initialize.error, "Could not create the groups.")}
              </ErrorLine>
            </div>
          )}
        </section>
      )}

      {locked && (
        <div>
          <p className={status("warning")}>Grouping fixed</p>
          <p className={`mt-1 ${meta}`}>
            A schedule is saved or judges have scored, so groups, modes and
            general are fixed. Labels can still be renamed.
          </p>
        </div>
      )}

      {creating && (
        <section className="border-y border-[var(--border-subtle)] py-6">
          <h3 className={`${itemTitle} mb-5`}>New challenge</h3>
          <ChallengeForm
            initial={EMPTY}
            groups={groups}
            locked={locked}
            pending={create.isPending}
            error={create.error ? trpcErrorMessage(create.error, "Could not create it.") : null}
            readOnly={readOnly}
            onCancel={() => setCreating(false)}
            onSubmit={(draft) =>
              create.mutate({
                hackathonId,
                label: draft.label.trim(),
                isGroup: draft.isGroup,
                parentId: draft.isGroup || draft.isGeneral ? null : draft.parentId || null,
                mode: draft.mode,
                importLabelMatch: draft.isGroup
                  ? draft.importLabelMatch.trim() || null
                  : null,
                isGeneral: draft.isGeneral,
              })
            }
          />
        </section>
      )}

      <section className={sectionRule}>
        {challenges.isLoading ? (
          <p className={body}>Loading challenges…</p>
        ) : challenges.isError ? (
          <p className={body}>
            {trpcErrorMessage(challenges.error, "Could not load the challenges.")}{" "}
            <button
              type="button"
              onClick={() => challenges.refetch()}
              className={textLink}
            >
              Try again
            </button>
          </p>
        ) : roots.length === 0 ? (
          <p className={body}>
            No challenges yet. Create the starter groups, or import projects
            and their Devpost prizes become challenges.
          </p>
        ) : (
          <>
            <h3 className={label}>{plural(list.length, "challenge")}</h3>
            <ul className="mt-2 border-t border-[var(--border-subtle)]">
              {roots.map(row)}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function ChallengeForm({
  initial,
  editing,
  groups,
  locked,
  pending,
  error,
  readOnly,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  /** The challenge being edited; absent when creating. */
  editing?: Challenge;
  groups: Challenge[];
  locked: boolean;
  pending: boolean;
  error: string | null;
  readOnly: boolean;
  onCancel: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // Only renaming survives the lock; the rest reshapes a saved schedule.
  const frozen = !!editing && locked;
  const topLevel = draft.isGroup || draft.isGeneral || !draft.parentId;
  const id = editing?.id ?? "new";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.label.trim()) onSubmit(draft);
      }}
      className={`max-w-2xl space-y-5 ${editing ? "mb-4 border-l-2 border-accent pl-4" : ""}`}
    >
      {!editing && (
        <fieldset>
          <legend className={fieldLabel}>Kind</legend>
          <div className="flex flex-wrap gap-x-6">
            {[
              { value: false, text: "Challenge", hint: "Projects opt into it" },
              { value: true, text: "Group", hint: "Holds challenges" },
            ].map((option) => (
              <label
                key={option.text}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] text-[var(--text-primary)]"
              >
                <input
                  type="radio"
                  name="challenge-kind"
                  checked={draft.isGroup === option.value}
                  onChange={() =>
                    set({ isGroup: option.value, parentId: "", importLabelMatch: "" })
                  }
                  className="accent-[var(--accent)]"
                />
                {option.text}
                <span className="text-[13px] text-[var(--text-subtle)]">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor={`challenge-label-${id}`} className={fieldLabel}>
          Label
        </label>
        <input
          id={`challenge-label-${id}`}
          type="text"
          required
          maxLength={255}
          value={draft.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder={draft.isGroup ? "Sponsor challenges" : "Best use of data"}
          className={input}
        />
        {!draft.isGroup && (
          <p className={fieldHint}>
            Match the Devpost prize name so imports file projects here.
          </p>
        )}
      </div>

      {!draft.isGroup && !draft.isGeneral && (
        <div>
          <label htmlFor={`challenge-parent-${id}`} className={fieldLabel}>
            Group
          </label>
          <select
            id={`challenge-parent-${id}`}
            value={draft.parentId}
            disabled={frozen}
            onChange={(e) => set({ parentId: e.target.value })}
            className={input}
          >
            <option value="">None: top level</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {topLevel ? (
        <div>
          <label htmlFor={`challenge-mode-${id}`} className={fieldLabel}>
            Mode
          </label>
          <select
            id={`challenge-mode-${id}`}
            value={draft.mode}
            disabled={frozen}
            onChange={(e) => set({ mode: e.target.value as Mode })}
            className={input}
          >
            {(Object.keys(MODE_LABEL) as Mode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}: {MODE_HINT[mode].toLowerCase()}
              </option>
            ))}
          </select>
          {draft.isGroup && (
            <p className={fieldHint}>The challenges in this group take it too.</p>
          )}
        </div>
      ) : (
        <p className={meta}>Takes its group&apos;s mode.</p>
      )}

      {draft.isGroup && (
        <div>
          <label htmlFor={`challenge-match-${id}`} className={fieldLabel}>
            Collect imported labels containing (optional)
          </label>
          <input
            id={`challenge-match-${id}`}
            type="text"
            maxLength={100}
            value={draft.importLabelMatch}
            onChange={(e) => set({ importLabelMatch: e.target.value })}
            placeholder="MLH"
            className={input}
          />
          <p className={fieldHint}>
            A new label from an import goes into the first group whose text it
            contains, ignoring case.
          </p>
        </div>
      )}

      {(draft.isGroup || !draft.parentId) && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={draft.isGeneral}
            disabled={frozen}
            onChange={(e) =>
              set({ isGeneral: e.target.checked, parentId: e.target.checked ? "" : draft.parentId })
            }
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[15px] text-[var(--text-primary)]">
              General
            </span>
            <span className={`block ${meta}`}>
              Every project is judged in it, whatever it opted into.
            </span>
          </span>
        </label>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={readOnly || pending || !draft.label.trim()}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnInk}
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
