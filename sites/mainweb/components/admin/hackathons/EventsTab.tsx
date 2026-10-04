"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { Calendar, Clock, MapPin, Plus } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
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
  color: string;
  bg: string;
}[] = [
  {
    value: "workshop",
    label: "Workshop",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/25",
  },
  {
    value: "meal",
    label: "Meal",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/25",
  },
  {
    value: "ceremony",
    label: "Ceremony",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/25",
  },
  {
    value: "activity",
    label: "Activity",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/25",
  },
  {
    value: "sponsor_session",
    label: "Sponsor",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/25",
  },
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
    <div className="animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Schedule
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {events?.length || 0} session
            {events?.length !== 1 ? "s" : ""} this edition — workshops, meals,
            ceremonies.{" "}
            <Link href="/admin" className="text-accent hover:underline">
              Club meetings are on Club Hub
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New event
        </button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editingId) && (
        <LiquidGlass printed className="p-6 mb-6">
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">
            {editingId ? "Edit event" : "New event"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name + Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                <label
                  htmlFor="event-name"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
                  Event name
                </label>
                <input
                  id="event-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Opening Ceremony"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                />
              </div>
              <div>
                <label
                  htmlFor="type"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
                  Type
                </label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as EventType })
                  }
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui min-w-[160px]"
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
              <label
                htmlFor="description"
                className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
              >
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Optional description…"
                rows={2}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui resize-none"
              />
            </div>

            {/* Location + Points Row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                <label
                  htmlFor="location"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
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
                  placeholder="e.g. Room 101, Main Hall"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                />
              </div>
            </div>

            {/* Start / End Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="start-time"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
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
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                />
              </div>
              <div>
                <label
                  htmlFor="end-time"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
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
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-sm text-red-400 text-sm">
                {trpcErrorMessage(error, "Could not save this event.")}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
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
                className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </form>
        </LiquidGlass>
      )}

      {/* Event List */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">
          Loading events…
        </p>
      ) : !events || events.length === 0 ? (
        <LiquidGlass
          printed
          className="p-8 text-center flex flex-col items-center gap-3"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            No schedule yet. Add workshops, meals, and ceremonies for this
            weekend. Club meetings belong on Club Hub, not here.
          </p>
        </LiquidGlass>
      ) : (
        <div className="space-y-3">
          {events.map((event: NonNullable<typeof events>[number]) => {
            const typeMeta = getTypeMeta(event.type);
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            const isActive = editingId === event.id;

            return (
              <LiquidGlass
                key={event.id}
                printed
                className={`p-5 transition-ui ${isActive ? "border-accent/40 bg-accent/5" : "hover:border-[var(--border-hover)]"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${typeMeta.color} ${typeMeta.bg}`}
                      >
                        {typeMeta.label}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] truncate">
                      {event.name}
                    </h4>
                    {event.description && (
                      <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-1">
                        {event.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                        {event.location}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
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
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(event)}
                      className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                    >
                      Edit
                    </button>
                    {deleteConfirm === event.id ? (
                      <div className="flex flex-col items-end gap-2">
                        {deleteBlocked && (
                          <p
                            role="alert"
                            className="text-[11px] text-amber-300 max-w-xs text-right"
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
                            disabled={deleteMutation.isPending}
                            className="px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          >
                            {deleteMutation.isPending
                              ? "…"
                              : deleteBlocked
                                ? "Delete anyway"
                                : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirm(null);
                              setDeleteBlocked(null);
                            }}
                            className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                          >
                            No
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
                        className="px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </LiquidGlass>
            );
          })}
        </div>
      )}
    </div>
  );
}
