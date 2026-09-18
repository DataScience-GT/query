"use client";

import { useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

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
    <ModalWrapper onClose={onClose} maxWidth="2xl">
      <div className="mb-8 flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h3 className="text-3xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
            {mode === "edit" ? "Edit Workshop" : "Create Workshop"}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
            Metadata and weekly files
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 font-mono text-xs uppercase tracking-widest text-[var(--text-subtle)] transition-ui hover:bg-white/5 hover:text-[var(--text-primary)]"
        >
          [ Close ]
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-[8rem_1fr]">
          <div>
            <label
              htmlFor="workshop-week"
              className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
            >
              Week
            </label>
            <input
              id="workshop-week"
              type="number"
              min={1}
              max={52}
              value={form.week}
              // The session joins on the week, so it is fixed once created.
              disabled={mode === "edit"}
              onChange={(event) => setForm({ ...form, week: event.target.value })}
              className="mt-2 w-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-4 py-3 font-mono text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </div>
          <div>
            <label
              htmlFor="workshop-title"
              className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
            >
              Workshop title
            </label>
            <input
              id="workshop-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="mt-2 w-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label
              htmlFor="workshop-session-date"
              className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
            >
              Session date
            </label>
            <input
              id="workshop-session-date"
              type="datetime-local"
              value={form.sessionDate}
              onChange={(event) =>
                setForm({ ...form, sessionDate: event.target.value })
              }
              className="mt-2 w-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-4 py-3 font-mono text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Leave blank for TBA. Clearing a saved date keeps its event, QR,
              and attendance, but removes it from this workshop.
            </p>
          </div>
          <div>
            <label
              htmlFor="workshop-location"
              className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
            >
              Location (optional)
            </label>
            <input
              id="workshop-location"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
              placeholder="e.g., Klaus 2443"
              className="mt-2 w-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="workshop-recording"
            className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
          >
            Recording URL
          </label>
          <input
            id="workshop-recording"
            type="url"
            value={form.recordingUrl}
            onChange={(event) =>
              setForm({ ...form, recordingUrl: event.target.value })
            }
            placeholder="https://…"
            className="mt-2 w-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
          />
        </div>

        {(["materials", "solution"] as const).map((kind) => {
          const existing =
            kind === "materials"
              ? initial?.materialsFileName
              : initial?.solutionFileName;
          return (
            <div
              key={kind}
              className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5"
            >
              <label
                htmlFor={`workshop-${kind}`}
                className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
              >
                {kind} ZIP
              </label>
              {existing && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
                  <span>{existing}</span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => onRemoveFile?.(kind)}
                    className="font-mono text-xs font-bold uppercase tracking-widest text-red-300 transition-ui hover:text-red-200 disabled:opacity-50"
                  >
                    Remove
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
                className="mt-3 block w-full text-sm text-[var(--text-muted)] file:mr-4 file:border file:border-accent/40 file:bg-accent/10 file:px-4 file:py-2 file:font-bold file:text-accent"
              />
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!isValid || isSubmitting}
          onClick={() => onSubmit(form)}
          className="w-full bg-accent px-8 py-4 font-black uppercase tracking-widest text-black transition-ui hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? "Saving…"
            : mode === "edit"
              ? "Save workshop"
              : "Create workshop"}
        </button>
      </div>
    </ModalWrapper>
  );
}
