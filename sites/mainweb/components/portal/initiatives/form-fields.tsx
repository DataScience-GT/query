"use client";

/**
 * The initiative fields, shared by the leader's create/edit form and the
 * member's proposal form. A proposal becomes the initiative on approval, so
 * the two have to ask for exactly the same things — keeping two copies is how
 * a field ends up collected in one and silently dropped in the other.
 */

export type InitiativeDraft = {
  title: string;
  summary: string;
  description: string;
  commitment: string;
  maxMembers: string;
};

export const emptyDraft: InitiativeDraft = {
  title: "",
  summary: "",
  description: "",
  commitment: "",
  maxMembers: "",
};

export function draftFrom(row?: {
  title: string;
  summary: string | null;
  description: string | null;
  commitment: string | null;
  maxMembers: number | null;
}): InitiativeDraft {
  if (!row) return emptyDraft;
  return {
    title: row.title,
    summary: row.summary ?? "",
    description: row.description ?? "",
    commitment: row.commitment ?? "",
    maxMembers: row.maxMembers?.toString() ?? "",
  };
}

/** Empty strings become undefined, which the router stores as an explicit null. */
export function toInput(draft: InitiativeDraft) {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim() || undefined,
    description: draft.description.trim() || undefined,
    commitment: draft.commitment.trim() || undefined,
    maxMembers: draft.maxMembers ? Number(draft.maxMembers) : null,
  };
}

const field =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

export function InitiativeFields({
  draft,
  onChange,
}: {
  draft: InitiativeDraft;
  onChange: (draft: InitiativeDraft) => void;
}) {
  const set = (key: keyof InitiativeDraft) => (value: string) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-3">
      <input
        required
        maxLength={200}
        placeholder="Title"
        value={draft.title}
        onChange={(e) => set("title")(e.target.value)}
        className={field}
      />
      <input
        maxLength={300}
        placeholder="One line — what a member reads before opening it"
        value={draft.summary}
        onChange={(e) => set("summary")(e.target.value)}
        className={field}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          maxLength={120}
          placeholder="Time commitment, e.g. 3-4 hrs/week"
          value={draft.commitment}
          onChange={(e) => set("commitment")(e.target.value)}
          className={field}
        />
        <input
          type="number"
          min={1}
          placeholder="Team size (blank = no limit)"
          value={draft.maxMembers}
          onChange={(e) => set("maxMembers")(e.target.value)}
          className={field}
        />
      </div>
      <textarea
        rows={5}
        maxLength={4000}
        placeholder="What you want to build, and who you need"
        value={draft.description}
        onChange={(e) => set("description")(e.target.value)}
        className={field}
      />
    </div>
  );
}
