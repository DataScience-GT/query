"use client";

import React, { useState } from "react";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { ModalWrapper } from "./ModalWrapper";
import {
  btnPrimary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
} from "./ui";

const closeButton =
  "shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]";

interface EventFormData {
  title: string;
  description: string;
  location: string;
  eventDate: string;
  /** Empty means no cap. The column is nullable and the door gate only runs
   *  when a number is set. */
  maxCheckIns: string;
}

interface EventFormModalProps {
  onClose: () => void;
  onSubmit: (data: EventFormData) => void;
  isSubmitting?: boolean;
  /** Present when editing: prefills the form and relabels the action. */
  initial?: Partial<EventFormData>;
  mode?: "create" | "edit";
  error?: string | null;
}

function getCurrentDateTimeLocal(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export function EventFormModal({
  onClose,
  onSubmit,
  isSubmitting = false,
  initial,
  mode = "create",
  error = null,
}: EventFormModalProps) {
  const readOnly = useReadOnly();
  const [form, setForm] = useState<EventFormData>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    // Auto-fill date/time when creating. An edit already carries the event's
    // own date, and overwriting it with "now" would silently reschedule it.
    eventDate: initial?.eventDate || getCurrentDateTimeLocal(),
    maxCheckIns: initial?.maxCheckIns ?? "",
  });

  const handleSubmit = () => {
    onSubmit(form);
  };

  const isValid = form.title.trim() && form.eventDate;

  return (
    <ModalWrapper onClose={onClose} maxWidth="2xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h3 className={itemTitle}>
            {mode === "edit" ? "Edit event" : "New event"}
          </h3>
          <p className={`${meta} mt-1`}>
            Members check in by scanning the event&apos;s QR code.
          </p>
        </div>
        <button type="button" onClick={onClose} className={closeButton}>
          Close
        </button>
      </div>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="event-title-identifier" className={fieldLabel}>
            Title
          </label>
          <input
            id="event-title-identifier"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={input}
            placeholder="e.g., Weekly workshop 1"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="data-description" className={fieldLabel}>
            Description
          </label>
          <textarea
            id="data-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={`${input} resize-none`}
            rows={3}
            placeholder="What members should know before they come"
          />
        </div>

        {/* Location and Date */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="location-node" className={fieldLabel}>
              Location
            </label>
            <input
              id="location-node"
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={input}
              placeholder="e.g., Klaus 2443"
            />
          </div>

          <div>
            <label htmlFor="temporal-stamp" className={fieldLabel}>
              Date and time
            </label>
            <input
              id="temporal-stamp"
              type="datetime-local"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              className={input}
            />
          </div>
        </div>

        {/* Capacity. The column and the door gate have always existed; the form
            hardcoded undefined, so the row lock, the "Event is full" refusal
            and the counter re-test never ran for anybody. */}
        <div>
          <label htmlFor="capacity-limit" className={fieldLabel}>
            Capacity (optional)
          </label>
          <input
            id="capacity-limit"
            type="number"
            min={1}
            value={form.maxCheckIns}
            onChange={(e) => setForm({ ...form, maxCheckIns: e.target.value })}
            className={`${input} tabular-nums`}
            placeholder="Leave empty for no limit"
          />
          <p className={fieldHint}>
            Check-in turns people away once this many have checked in.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-[var(--danger-glow)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={readOnly || !isValid || isSubmitting}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`${btnPrimary} mt-2 w-full`}
        >
          {isSubmitting
            ? mode === "edit"
              ? "Saving…"
              : "Creating…"
            : mode === "edit"
              ? "Save changes"
              : "Create event"}
        </button>
      </div>
    </ModalWrapper>
  );
}
