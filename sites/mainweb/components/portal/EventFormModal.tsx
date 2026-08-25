"use client";

import React, { useEffect, useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface EventFormData {
  title: string;
  description: string;
  location: string;
  eventDate: string;
  /** Empty means no cap. The column is nullable and the door gate only runs
   *  when a number is set. */
  maxCheckIns: string;
  /** Off lets non-members check themselves in — kickoffs, interest meetings. */
  membersOnly: boolean;
  /** Empty means this is an ordinary event, not a bootcamp session. */
  bootcampWeek: string;
  /** Refuses anyone not enrolled in this semester's bootcamp. */
  bootcampOnly: boolean;
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
  const [form, setForm] = useState<EventFormData>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    eventDate: initial?.eventDate ?? "",
    maxCheckIns: initial?.maxCheckIns ?? "",
    membersOnly: initial?.membersOnly ?? true,
    bootcampWeek: initial?.bootcampWeek ?? "",
    bootcampOnly: initial?.bootcampOnly ?? false,
  });

  // Auto-fill date/time when creating. An edit already carries the event's own
  // date, and overwriting it with "now" would silently reschedule it.
  useEffect(() => {
    if (initial?.eventDate) return;
    setForm((prev) => ({
      ...prev,
      eventDate: getCurrentDateTimeLocal(),
    }));
  }, [initial?.eventDate]);

  const handleSubmit = () => {
    onSubmit(form);
  };

  const isValid = form.title.trim() && form.eventDate;

  return (
    <ModalWrapper onClose={onClose} maxWidth="2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-3xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter">
            {mode === "edit" ? "Edit Event" : "Create Event"}
          </h3>
          <p className="text-xs font-mono text-accent uppercase tracking-widest">
            Configure QR Protocols
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-sm uppercase tracking-widest font-mono p-2 hover:bg-white/5 rounded"
        >
          [ Close Panel ]
        </button>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <label
            htmlFor="event-title-identifier"
            className="text-sm text-[var(--text-subtle)] uppercase tracking-widest font-mono block font-bold mb-2"
          >
            Event Title Identifier
          </label>
          <input
            id="event-title-identifier"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-6 py-4 text-[var(--text-primary)] text-base focus:border-accent focus:outline-none transition-ui font-mono"
            placeholder="e.g., Weekly Workshop 01"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label
            htmlFor="data-description"
            className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
          >
            Data Description
          </label>
          <textarea
            id="data-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-ui resize-none font-mono"
            rows={3}
            placeholder="System details…"
          />
        </div>

        {/* Location and Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label
              htmlFor="location-node"
              className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
            >
              Location Node
            </label>
            <input
              id="location-node"
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-ui font-mono"
              placeholder="e.g., Klaus 2443"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="temporal-stamp"
              className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
            >
              Temporal Stamp
            </label>
            <input
              id="temporal-stamp"
              type="datetime-local"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-ui font-mono"
            />
          </div>
        </div>

        {/* Capacity. The column and the door gate have always existed; the form
            hardcoded undefined, so the row lock, the "Event is full" refusal
            and the counter re-test never ran for anybody. */}
        <div className="space-y-2">
          <label
            htmlFor="capacity-limit"
            className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
          >
            Capacity (optional)
          </label>
          <input
            id="capacity-limit"
            type="number"
            min={1}
            value={form.maxCheckIns}
            onChange={(e) => setForm({ ...form, maxCheckIns: e.target.value })}
            className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-ui font-mono"
            placeholder="Leave empty for no limit"
          />
          <p className="text-[10px] font-mono text-[var(--text-subtle)]">
            Check-in refuses everyone past this number, counted at the door.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.membersOnly}
              onChange={(e) =>
                setForm({ ...form, membersOnly: e.target.checked })
              }
              className="h-4 w-4 accent-accent"
            />
            <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
              Members only
            </span>
          </label>
          <p className="text-[10px] font-mono text-[var(--text-subtle)]">
            Untick for a kickoff or interest meeting so non-members can scan
            themselves in. Officers can always check somebody in by hand.
          </p>
        </div>

        {/* A session is an ordinary event with a week on it, so it uses this
            same QR and check-in desk — no second form, no second scanner. */}
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-6">
          <label
            htmlFor="bootcamp-week"
            className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono block"
          >
            Bootcamp week (optional)
          </label>
          <input
            id="bootcamp-week"
            type="number"
            min={1}
            max={52}
            value={form.bootcampWeek}
            onChange={(e) => {
              const value = e.target.value;
              setForm((prev) => ({
                ...prev,
                bootcampWeek: value,
                // Ticking the box is the step people forget.
                bootcampOnly:
                  !prev.bootcampWeek.trim() && value.trim()
                    ? true
                    : prev.bootcampOnly,
              }));
            }}
            className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-ui font-mono"
            placeholder="Leave empty for a normal event"
          />
          <p className="text-[10px] font-mono text-[var(--text-subtle)]">
            Files this event as week N of the bootcamp running this semester,
            and puts its attendance on the bootcamp grid.
          </p>

          <label className="flex items-center gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={form.bootcampOnly}
              onChange={(e) =>
                setForm({ ...form, bootcampOnly: e.target.checked })
              }
              className="h-4 w-4 accent-accent"
            />
            <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
              Bootcamp members only
            </span>
          </label>
          <p className="text-[10px] font-mono text-[var(--text-subtle)]">
            Turns away anyone who has not paid for this semester&rsquo;s
            bootcamp. Officers can still check somebody in by hand.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300"
          >
            {error}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="w-full px-8 py-5 bg-accent text-black font-black text-base uppercase tracking-[0.2em] hover:bg-accent/90 transition-ui disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(16,185,129,0.3)] mt-6 rounded-none"
        >
          {isSubmitting
            ? "Processing…"
            : mode === "edit"
              ? "SAVE CHANGES"
              : "INITIALIZE EVENT"}
        </button>
      </div>
    </ModalWrapper>
  );
}
