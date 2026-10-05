"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { Plus } from "lucide-react";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
import { toInputDate } from "@/components/admin/hackathons/constants";

type EventType =
  | "workshop"
  | "meal"
  | "ceremony"
  | "activity"
  | "sponsor_session";

const EVENT_TYPES: {
  value: EventType;
  label: string;
}[] = [
  { value: "workshop", label: "Workshop" },
  { value: "meal", label: "Meal" },
  { value: "ceremony", label: "Ceremony" },
  { value: "activity", label: "Activity" },
  { value: "sponsor_session", label: "Sponsor" },
];

function getTypeMeta(type: string) {
  return EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[0];
}

interface EventFormData {
  name: string;
  description: string;
  type: EventType;
  location: string;
  startTime: string;
  endTime: string;
}

const emptyForm: EventFormData = {
  name: "",
  description: "",
  type: "workshop",
  location: "",
  startTime: "",
  endTime: "",
};

export function EventsTab({ hackathonId }: { hackathonId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  /** Server's refusal message when the event already has check-ins. */
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const { data: events, isLoading } = trpc.hackathon.getEvents.useQuery({
    hackathonId,
  });

  const createMutation = trpc.hackathon.createEvent.useMutation({
    onSuccess: () => {
      utils.hackathon.getEvents.invalidate({ hackathonId });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = trpc.hackathon.updateEvent.useMutation({
    onSuccess: () => {
      utils.hackathon.getEvents.invalidate({ hackathonId });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = trpc.hackathon.deleteEvent.useMutation({
    onSuccess: () => {
      utils.hackathon.getEvents.invalidate({ hackathonId });
      setDeleteConfirm(null);
      setDeleteBlocked(null);
    },
    // The server refuses when people have already scanned in, and says how
    // many. Overriding is only offered once that count has been shown.
    onError: (error) =>
      setDeleteBlocked(
        error.data?.code === "CONFLICT"
          ? error.message
          : `Could not delete: ${error.message}`,
      ),
  });

  function openEdit(event: NonNullable<typeof events>[number]) {
    // The form is shared, so a rejection left over from the previous open would
    // otherwise greet the user on a form they have not submitted yet.
    createMutation.reset();
    updateMutation.reset();
    setEditingId(event.id);
    setForm({
      name: event.name,
      description: event.description || "",
      type: event.type as EventType,
      location: event.location,
      startTime: toInputDate(event.startTime),
      endTime: toInputDate(event.endTime),
    });
    setShowCreate(false);
  }

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setShowCreate(true);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (editingId) {
      updateMutation.mutate({
        eventId: editingId,
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        location: form.location,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
      });
    } else {
      createMutation.mutate({
        hackathonId,
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        location: form.location,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div>
          <h2 className={sectionTitle}>Schedule</h2>
          <p className={`mt-1 ${body}`}>
            <span className="tabular-nums">{events?.length || 0}</span> session
            {events?.length !== 1 ? "s" : ""} this edition: workshops, meals,
            ceremonies.{" "}
            <Link href="/admin" className={textLink}>
              Club meetings are on Club hub
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnPrimary}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New event
        </button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editingId) && (
        <section className="border-y border-[var(--border-subtle)] py-6">
          <h3 className={`${itemTitle} mb-5`}>
            {editingId ? "Edit event" : "New event"}
          </h3>
          <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
            {/* Name + Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                <label htmlFor="event-name" className={fieldLabel}>
                  Event name
                </label>
                <input
                  id="event-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Opening ceremony"
                  className={input}
                />
              </div>
              <div>
                <label htmlFor="type" className={fieldLabel}>
                  Type
                </label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as EventType })
                  }
                  className={`${input} min-w-[160px]`}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className={fieldLabel}>
                Description (optional)
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What happens, who it is for"
                rows={2}
                className={`${input} resize-none`}
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className={fieldLabel}>
                Location
              </label>
              <input
                id="location"
                type="text"
                required
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
                placeholder="Room 101, Main Hall"
                className={input}
              />
            </div>

            {/* Start / End Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="start-time" className={fieldLabel}>
                  Start
                </label>
                <input
                  id="start-time"
                  type="datetime-local"
                  required
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                  className={input}
                />
              </div>
              <div>
                <label htmlFor="end-time" className={fieldLabel}>
                  End
                </label>
                <input
                  id="end-time"
                  type="datetime-local"
                  required
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                  className={input}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <p
                role="alert"
                className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
              >
                {trpcErrorMessage(error, "Could not save this event.")}
              </p>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={readOnly || isPending}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnPrimary}
              >
                {isPending
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Create event"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Event List */}
      {isLoading ? (
        <p className={`py-12 ${body}`}>Loading events…</p>
      ) : !events || events.length === 0 ? (
        <p className={`border-t border-[var(--border-subtle)] pt-6 ${body}`}>
          No schedule yet. Add workshops, meals and ceremonies for this
          weekend; club meetings belong on Club hub.
        </p>
      ) : (
        <ul className="border-t border-[var(--border-subtle)]">
          {events.map((event: NonNullable<typeof events>[number]) => {
            const typeMeta = getTypeMeta(event.type);
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            const isActive = editingId === event.id;

            return (
              <li
                key={event.id}
                className={`border-b border-[var(--border-subtle)] py-4 transition-colors ${
                  isActive
                    ? "border-l-2 border-l-accent pl-4"
                    : "hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <p className={label}>
                      {typeMeta.label}
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span className="tabular-nums">
                        {start.toLocaleDateString()}{" "}
                        {start.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {end.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    <h4 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)] truncate">
                      {event.name}
                    </h4>
                    {event.description && (
                      <p className={`mt-0.5 line-clamp-1 ${body}`}>
                        {event.description}
                      </p>
                    )}
                    <p className={`mt-1 ${meta}`}>{event.location}</p>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(event)}
                      disabled={readOnly}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnSecondary}
                    >
                      Edit
                    </button>
                    {deleteConfirm === event.id ? (
                      <div className="flex flex-col items-end gap-2">
                        {deleteBlocked && (
                          <p
                            role="alert"
                            className="text-[13px] text-[var(--warning)] max-w-xs text-right"
                          >
                            {deleteBlocked}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              deleteMutation.mutate({
                                eventId: event.id,
                                // Only after the refusal has been read.
                                force: !!deleteBlocked,
                              })
                            }
                            disabled={readOnly || deleteMutation.isPending}
                            title={readOnly ? READ_ONLY_TITLE : undefined}
                            className={btnDanger}
                          >
                            {deleteMutation.isPending
                              ? "Deleting…"
                              : deleteBlocked
                                ? "Delete anyway"
                                : "Delete event"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirm(null);
                              setDeleteBlocked(null);
                            }}
                            className={btnSecondary}
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteBlocked(null);
                          setDeleteConfirm(event.id);
                        }}
                        disabled={readOnly}
                        title={readOnly ? READ_ONLY_TITLE : undefined}
                        className={btnDanger}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
