"use client";

import { useState } from "react";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { Modal } from "@query/ui/Modal";
import { Alert } from "@query/ui/Alert";
import {
  btnPrimary,
  fieldLabel,
  itemTitle,
  meta,
  textLink,
} from "@query/ui/classes";
import { FormInput } from "@query/ui/FormInput";

export interface BootcampWorkshopFormData {
  week: string;
  title: string;
  sessionDate: string;
  location: string;
  recordingUrl: string;
  materials: File | null;
  solution: File | null;
}

interface BootcampWorkshopModalProps {
  mode: "create" | "edit";
  initial?: Partial<BootcampWorkshopFormData> & {
    materialsFileName?: string | null;
    solutionFileName?: string | null;
  };
  onClose: () => void;
  onSubmit: (data: BootcampWorkshopFormData) => void;
  onRemoveFile?: (kind: "materials" | "solution") => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export function BootcampWorkshopModal({
  mode,
  initial,
  onClose,
  onSubmit,
  onRemoveFile,
  isSubmitting = false,
  error = null,
}: BootcampWorkshopModalProps) {
  const readOnly = useReadOnly();
  const [form, setForm] = useState<BootcampWorkshopFormData>({
    week: initial?.week ?? "",
    title: initial?.title ?? "",
    sessionDate: initial?.sessionDate ?? "",
    location: initial?.location ?? "",
    recordingUrl: initial?.recordingUrl ?? "",
    materials: null,
    solution: null,
  });

  const isValid =
    !!form.title.trim() &&
    Number.isInteger(Number(form.week)) &&
    Number(form.week) >= 1 &&
    Number(form.week) <= 52;

  return (
    <Modal onClose={onClose} maxWidth="2xl">
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h3 className={itemTitle}>
            {mode === "edit" ? "Edit workshop" : "Add a workshop"}
          </h3>
          <p className={`mt-1 ${meta}`}>
            Details, session time and the week&rsquo;s files.
          </p>
        </div>
        <button type="button" onClick={onClose} className={textLink}>
          Close
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
          <FormInput
            label="Week"
            id="workshop-week"
            type="number"
            min={1}
            max={52}
            value={form.week}
            // The session joins on the week, so it is fixed once created.
            disabled={mode === "edit"}
            onChange={(event) => setForm({ ...form, week: event.target.value })}
            className="tabular-nums"
          />
          <FormInput
            label="Workshop title"
            id="workshop-title"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormInput
            label="Session date"
            id="workshop-session-date"
            type="datetime-local"
            value={form.sessionDate}
            onChange={(event) =>
              setForm({ ...form, sessionDate: event.target.value })
            }
            hint="Leave blank for TBA. Clearing a saved date keeps its event, QR code and attendance, but detaches it from this workshop."
          />
          <FormInput
            label="Location (optional)"
            id="workshop-location"
            value={form.location}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
            placeholder="e.g., Klaus 2443"
          />
        </div>

        <FormInput
          label="Recording URL"
          id="workshop-recording"
          type="url"
          value={form.recordingUrl}
          onChange={(event) =>
            setForm({ ...form, recordingUrl: event.target.value })
          }
          placeholder="https://…"
        />

        {(["materials", "solution"] as const).map((kind) => {
          const existing =
            kind === "materials"
              ? initial?.materialsFileName
              : initial?.solutionFileName;
          return (
            <div
              key={kind}
              className="border-t border-[var(--border-subtle)] pt-5"
            >
              <label htmlFor={`workshop-${kind}`} className={fieldLabel}>
                {kind === "materials" ? "Materials ZIP" : "Solution ZIP"}
              </label>
              {existing && (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <span className="break-all text-[15px] text-[var(--text-muted)]">
                    {existing}
                  </span>
                  <button
                    type="button"
                    disabled={readOnly || isSubmitting}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    onClick={() => onRemoveFile?.(kind)}
                    className="text-sm font-semibold text-[var(--danger)] underline decoration-[var(--danger)]/40 decoration-2 underline-offset-[5px] transition-colors hover:decoration-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove file
                  </button>
                </div>
              )}
              <input
                id={`workshop-${kind}`}
                type="file"
                accept=".zip,application/zip"
                onChange={(event) =>
                  setForm({
                    ...form,
                    [kind]: event.target.files?.[0] ?? null,
                  })
                }
                className="mt-3 block w-full text-sm text-[var(--text-muted)] file:mr-4 file:cursor-pointer file:rounded-[var(--radius-sm)] file:border file:border-solid file:border-[var(--border-medium)] file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--text-primary)] hover:file:bg-[var(--bg-secondary)]"
              />
            </div>
          );
        })}

        {error && (
          <Alert size={14}>
            {error}
          </Alert>
        )}

        <div className="border-t border-[var(--border-subtle)] pt-5">
          <button
            type="button"
            disabled={readOnly || !isValid || isSubmitting}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => onSubmit(form)}
            className={`${btnPrimary} w-full sm:w-auto`}
          >
            {isSubmitting
              ? "Saving…"
              : mode === "edit"
                ? "Save workshop"
                : "Create workshop"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
