"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
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
  dot: string;
}[] = [
  {
    value: "workshop",
    label: "Workshop",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    dot: "bg-purple-400",
  },
  {
    value: "meal",
    label: "Meal",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    dot: "bg-orange-400",
  },
  {
    value: "ceremony",
    label: "Ceremony",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    dot: "bg-yellow-400",
  },
  {
    value: "activity",
    label: "Activity",
    color: "text-green-400",
    bg: "bg-green-500/10",
    dot: "bg-green-400",
  },
  {
    value: "sponsor_session",
    label: "Sponsor",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    dot: "bg-blue-400",
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
          <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight">
            Weekend Itinerary
          </h2>
          <p className="text-xs text-[var(--text-subtle)] font-mono mt-1">
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
          className="px-5 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-bold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_var(--accent)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]"
        >
          + New Event
        </button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editingId) && (
        <LiquidGlass className="p-6 mb-6 border-t-4 border-t-accent/50">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
            {editingId ? "Edit Event" : "Create Event"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name + Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                <label
                  htmlFor="event-name"
                  className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
                >
                  Event Name
                </label>
                <input
                  id="event-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Opening Ceremony"
                  className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] placeholder:text-gray-600 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="type"
                  className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
                >
                  Type
                </label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as EventType })
                  }
                  className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors min-w-[160px]"
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
                className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
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
                className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] placeholder:text-gray-600 focus:outline-none focus:border-accent/50 transition-colors resize-none"
              />
            </div>

            {/* Location + Points Row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                <label
                  htmlFor="location"
                  className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
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
                  className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] placeholder:text-gray-600 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
            </div>

            {/* Start / End Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="start-time"
                  className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
                >
                  Start Time
                </label>
                <input
                  id="start-time"
                  type="datetime-local"
                  required
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                  className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="end-time"
                  className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold block mb-1.5"
                >
                  End Time
                </label>
                <input
                  id="end-time"
                  type="datetime-local"
                  required
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                  className="w-full bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-none text-red-400 text-sm">
                {trpcErrorMessage(error, "Could not save this event.")}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-bold text-sm rounded-none active:scale-[0.98] transition-transform disabled:opacity-50 shadow-[4px_4px_0_0_var(--accent)]"
              >
                {isPending
                  ? "Saving…"
                  : editingId
                    ? "Save Changes"
                    : "Create Event"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-muted)] font-medium text-sm rounded-none hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </LiquidGlass>
      )}

      {/* Event List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <p className="text-gray-600 font-mono text-sm uppercase tracking-wider animate-pulse">
            Loading events...
          </p>
        </div>
      ) : !events || events.length === 0 ? (
        <LiquidGlass className="p-16 text-center">
          <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-[var(--border-subtle)]">
            <svg
              className="w-8 h-8 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-[var(--text-primary)] font-semibold mb-1">
            No itinerary yet
          </h3>
          <p className="text-text-muted text-sm font-mono">
            Add workshops, meals, and ceremonies for this weekend. Club
            meetings belong on Club Hub, not here.
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
                className={`p-5 transition-ui ${isActive ? "border-accent/40 bg-accent/5" : "hover:border-white/20"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-bold ${typeMeta.color} ${typeMeta.bg}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-sm ${typeMeta.dot}`}
                        />
                        {typeMeta.label}
                      </span>
                    </div>
                    <h4 className="text-[var(--text-primary)] font-bold text-base truncate">
                      {event.name}
                    </h4>
                    {event.description && (
                      <p className="text-[var(--text-subtle)] text-sm mt-1 line-clamp-1">
                        {event.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--text-subtle)] font-mono">
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {event.location}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
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
                      className="px-4 py-2.5 border border-[var(--border-subtle)] text-[var(--text-muted)] text-sm font-medium rounded-none hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
                    >
                      Edit
                    </button>
                    {deleteConfirm === event.id ? (
                      <div className="flex flex-col items-end gap-2">
                        {deleteBlocked && (
                          <p
                            role="alert"
                            className="text-[11px] font-mono text-amber-300 max-w-xs text-right"
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
                            className="px-4 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold rounded-none hover:bg-red-500/30 transition-colors disabled:opacity-50"
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
                            className="px-4 py-2.5 border border-[var(--border-subtle)] text-[var(--text-subtle)] text-sm rounded-none hover:bg-white/5 transition-colors"
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
                        className="px-4 py-2.5 border border-red-500/10 text-red-400/60 text-sm font-medium rounded-none hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
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
