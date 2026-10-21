"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  NoticeLine,
  plural,
  iconButton,
  useRefreshJudging,
} from "@/components/admin/judging/shared";

type Visibility = "public" | "optional" | "private";
type Item =
  | { kind: "rating"; label: string; description?: string }
  | {
      kind: "response";
      label: string;
      description?: string;
      required: boolean;
      guestVisibility: Visibility;
    };

const VISIBILITY: { id: Visibility; label: string }[] = [
  { id: "public", label: "Shown to the team" },
  { id: "optional", label: "The guest judge chooses" },
  { id: "private", label: "Organisers only" },
];

/**
 * The questions judges answer. Edited as a whole and saved in one go, and
 * only before anyone scores against it.
 */
export function RubricSection({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const rubric = trpc.judging.admin.getRubric.useQuery({ hackathonId });
  // null until the organiser changes something; until then the saved rubric
  // is what shows.
  const [draft, setDraft] = useState<Item[] | null>(null);

  const save = trpc.judging.admin.saveRubric.useMutation({
    onSuccess: () => {
      setDraft(null);
      void refresh();
    },
  });

  const saved: Item[] = (rubric.data?.items ?? []).map((item) =>
    item.kind === "rating"
      ? {
          kind: "rating",
          label: item.label,
          description: item.description ?? undefined,
        }
      : {
          kind: "response",
          label: item.label,
          description: item.description ?? undefined,
          required: item.required,
          guestVisibility: item.guestVisibility ?? "public",
        },
  );
  const lockedBecause = rubric.data?.lockedBecause ?? null;
  // A lock that lands mid-edit wins: what shows is what judges will use.
  const items = lockedBecause ? saved : (draft ?? saved);
  const editable = !lockedBecause && !readOnly;
  const edit = (next: Item[]) => {
    save.reset();
    setDraft(next);
  };
  const patch = (index: number, change: Partial<Item>) =>
    edit(
      items.map((item, i) =>
        i === index ? ({ ...item, ...change } as Item) : item,
      ),
    );
  const move = (index: number, delta: -1 | 1) => {
    const next = [...items];
    const other = index + delta;
    [next[index], next[other]] = [next[other], next[index]];
    edit(next);
  };

  const ratings = items.filter((i) => i.kind === "rating").length;
  const blank = items.some((i) => !i.label.trim());

  if (rubric.isLoading) return <p className={body}>Loading the rubric…</p>;
  if (rubric.isError) {
    return (
      <p className={body}>
        {trpcErrorMessage(rubric.error, "Could not load the rubric.")}{" "}
        <button type="button" onClick={() => rubric.refetch()} className={textLink}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className={sectionTitle}>Rubric</h2>
        <p className={`mt-1 max-w-2xl ${meta}`}>
          Ratings are scored 1 to 5 and always required; a project&apos;s
          score is their mean. Written responses from member judges are shown
          to the team; for guest judges you choose.
        </p>
      </div>

      {lockedBecause && (
        <div>
          <p className={status("warning")}>Locked</p>
          <p className={`mt-1 max-w-2xl ${body}`}>{lockedBecause}</p>
        </div>
      )}

      <section className={sectionRule}>
        <h3 className={label}>
          {plural(ratings, "rating")} · {plural(items.length - ratings, "response")}
        </h3>
        {items.length === 0 ? (
          <p className={`mt-3 ${body}`}>
            No questions yet. Add at least one rating; judging cannot open
            without one.
          </p>
        ) : (
          <ol className="mt-3 border-t border-[var(--border-subtle)]">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex gap-3 border-b border-[var(--border-subtle)] py-4"
              >
                {editable && (
                  <div className="flex flex-col -my-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Move up"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className={iconButton}
                    >
                      <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      className={iconButton}
                    >
                      <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={label}>
                    {item.kind === "rating" ? "Rating, 1 to 5" : "Written response"}
                  </p>
                  {editable ? (
                    <div className="mt-2 space-y-3">
                      <div>
                        <label htmlFor={`rubric-label-${index}`} className="sr-only">
                          Question
                        </label>
                        <input
                          id={`rubric-label-${index}`}
                          type="text"
                          maxLength={120}
                          value={item.label}
                          onChange={(e) => patch(index, { label: e.target.value })}
                          placeholder={
                            item.kind === "rating"
                              ? "Technical difficulty"
                              : "What should the team work on next?"
                          }
                          className={input}
                        />
                      </div>
                      <div>
                        <label htmlFor={`rubric-description-${index}`} className={fieldLabel}>
                          Guidance for judges (optional)
                        </label>
                        <textarea
                          id={`rubric-description-${index}`}
                          rows={2}
                          maxLength={500}
                          value={item.description ?? ""}
                          onChange={(e) =>
                            patch(index, { description: e.target.value })
                          }
                          className={`${input} resize-y`}
                        />
                      </div>
                      {item.kind === "response" && (
                        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
                            <input
                              type="checkbox"
                              checked={item.required}
                              onChange={(e) =>
                                patch(index, { required: e.target.checked })
                              }
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Required
                          </label>
                          <div className="sm:w-64">
                            <label
                              htmlFor={`rubric-visibility-${index}`}
                              className={fieldLabel}
                            >
                              Guest judges&apos; answers
                            </label>
                            <select
                              id={`rubric-visibility-${index}`}
                              value={item.guestVisibility}
                              onChange={(e) =>
                                patch(index, {
                                  guestVisibility: e.target.value as Visibility,
                                })
                              }
                              className={input}
                            >
                              {VISIBILITY.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">
                        {item.label}
                      </p>
                      {item.description && (
                        <p className={`mt-0.5 ${body}`}>{item.description}</p>
                      )}
                      {item.kind === "response" && (
                        <p className={`mt-0.5 ${meta}`}>
                          {item.required ? "Required" : "Optional"} · guest
                          answers:{" "}
                          {VISIBILITY.find(
                            (v) => v.id === item.guestVisibility,
                          )?.label.toLowerCase()}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {editable && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.label || "this question"}`}
                    onClick={() => edit(items.filter((_, i) => i !== index))}
                    className={`${iconButton} -my-1 shrink-0`}
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => edit([...items, { kind: "rating", label: "" }])}
              disabled={items.length >= 30}
              className={btnSecondary}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add rating
            </button>
            <button
              type="button"
              onClick={() =>
                edit([
                  ...items,
                  {
                    kind: "response",
                    label: "",
                    required: true,
                    guestVisibility: "public",
                  },
                ])
              }
              disabled={items.length >= 30}
              className={btnSecondary}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add written response
            </button>
          </div>
        )}
      </section>

      {!lockedBecause && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() =>
              save.mutate({
                hackathonId,
                items: items.map((item) => ({
                  ...item,
                  label: item.label.trim(),
                  description: item.description?.trim() || undefined,
                })),
              })
            }
            disabled={readOnly || !draft || blank || save.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {save.isPending ? "Saving…" : "Save rubric"}
          </button>
          {draft && (
            <button
              type="button"
              onClick={() => {
                save.reset();
                setDraft(null);
              }}
              className={btnSecondary}
            >
              Discard changes
            </button>
          )}
          {draft && blank && (
            <p className={meta}>Every question needs a label.</p>
          )}
        </div>
      )}
      {save.error && (
        <ErrorLine>{trpcErrorMessage(save.error, "Could not save the rubric.")}</ErrorLine>
      )}
      {save.isSuccess && !draft && <NoticeLine>Rubric saved.</NoticeLine>}
    </div>
  );
}
