"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import {
  canViewAdmin,
  READ_ONLY_TITLE,
  usePortalContext,
  useReadOnly,
} from "@/lib/use-portal-context";
import { useState } from "react";
import Link from "next/link";
import { useEventQR } from "@/components/portal/EventQR";
import { EventFormModal } from "@/components/portal/EventFormModal";
import { EventAttendanceModal } from "@/components/portal/EventAttendanceModal";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  chip,
  itemTitle,
  meta,
  object,
  page,
  pageDek,
  sectionRule,
  status,
  textLink,
} from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

const inlineLink =
  "font-semibold text-[var(--text-primary)] underline decoration-accent underline-offset-4 hover:decoration-[var(--text-primary)]";

type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  eventDate: Date;
  qrCode: string;
  checkInEnabled: boolean;
  currentCheckIns: number;
  maxCheckIns: number | null;
};

export default function AdminPage() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const qr = useEventQR();
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [attendanceEvent, setAttendanceEvent] = useState<Event | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: portalContext } = usePortalContext();
  const readOnly = useReadOnly();
  const { data: allEvents, isLoading: eventsLoading } =
    trpc.events.listAll.useQuery(undefined, {
      enabled: !!session && canViewAdmin(portalContext),
    });
  // Bootcamp sessions have their own check-in controls on /admin/bootcamp.
  const events = allEvents?.filter((e) => e.bootcampWeek == null);

  type StatusFilter = "all" | "open" | "closed";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: (newEvent) => {
      if (newEvent) {
        utils.events.listAll.invalidate();
        setShowCreateEvent(false);
        void qr.show(newEvent);
      }
    },
  });

  const toggleCheckInMutation = trpc.events.toggleCheckIn.useMutation({
    onSuccess: () => utils.events.listAll.invalidate(),
  });

  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: () => {
      utils.events.listAll.invalidate();
      qr.hide();
    },
  });

  // Editing rather than delete-and-recreate: deleting takes every check-in
  // already collected with it, and mints a QR nobody's printed sign matches.
  const updateEventMutation = trpc.events.update.useMutation({
    onSuccess: () => {
      utils.events.listAll.invalidate();
      setEditingEvent(null);
      setEditError(null);
    },
    onError: (error) => setEditError(error.message),
  });

  type EventForm = {
    title: string;
    description: string;
    location: string;
    eventDate: string;
    maxCheckIns: string;
  };

  // Empty means no cap — the column is nullable and the door gate only runs
  // when a number is set. The form used to hardcode undefined, so capacity was
  // unreachable from anywhere in the product.
  const parseCapacity = (value: string) => {
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : undefined;
  };

  const handleCreateEvent = (formData: EventForm) => {
    createEventMutation.mutate({
      title: formData.title,
      description: formData.description || undefined,
      location: formData.location || undefined,
      eventDate: new Date(formData.eventDate),
      maxCheckIns: parseCapacity(formData.maxCheckIns),
    });
  };

  const handleEditEvent = (formData: EventForm) => {
    if (!editingEvent) return;
    setEditError(null);
    updateEventMutation.mutate({
      eventId: editingEvent.id,
      title: formData.title,
      description: formData.description || null,
      location: formData.location || null,
      eventDate: new Date(formData.eventDate),
      maxCheckIns: parseCapacity(formData.maxCheckIns) ?? null,
    });
  };

  /** `datetime-local` wants local wall-clock, not the UTC ISO string. */
  const toLocalInput = (date: Date) => {
    const local = new Date(
      date.getTime() - new Date(date).getTimezoneOffset() * 60 * 1000,
    );
    return local.toISOString().slice(0, 16);
  };

  return (
    <>
      {showCreateEvent && (
        <EventFormModal
          onClose={() => setShowCreateEvent(false)}
          onSubmit={handleCreateEvent}
          isSubmitting={createEventMutation.isPending}
        />
      )}

      {editingEvent && (
        <EventFormModal
          mode="edit"
          initial={{
            title: editingEvent.title,
            description: editingEvent.description ?? "",
            location: editingEvent.location ?? "",
            eventDate: toLocalInput(new Date(editingEvent.eventDate)),
            maxCheckIns: editingEvent.maxCheckIns
              ? String(editingEvent.maxCheckIns)
              : "",
          }}
          onClose={() => {
            setEditingEvent(null);
            setEditError(null);
          }}
          onSubmit={handleEditEvent}
          isSubmitting={updateEventMutation.isPending}
          error={editError}
        />
      )}

      {attendanceEvent && (
        <EventAttendanceModal
          eventId={attendanceEvent.id}
          eventTitle={attendanceEvent.title}
          onClose={() => setAttendanceEvent(null)}
        />
      )}

      {qr.modal}

      <div className={page}>
        <header>
          <h1 className={adminTitle}>Club check-ins</h1>
          <p className={pageDek}>
            Club meetings and workshops. Bootcamp sessions are managed on the{" "}
            <Link href="/admin/bootcamp" className={inlineLink}>
              bootcamp page
            </Link>
            , and Hacklytics weekend events live on the hackathon dashboard.
          </p>
        </header>

        <section className="mt-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              role="group"
              aria-label="Filter events by check-in"
              className="flex flex-wrap gap-2"
            >
              {(["all", "open", "closed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  aria-pressed={statusFilter === f}
                  className={`${chip(statusFilter === f)} tabular-nums`}
                >
                  {f === "all"
                    ? `All (${events?.length ?? 0})`
                    : f === "open"
                      ? `Open (${events?.filter((e) => e.checkInEnabled).length ?? 0})`
                      : `Closed (${events?.filter((e) => !e.checkInEnabled).length ?? 0})`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/scan/club" className={btnSecondary}>
                Scan passes
              </Link>
              <button
                type="button"
                onClick={() => setShowCreateEvent(true)}
                disabled={readOnly}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnPrimary}
              >
                New event
              </button>
            </div>
          </div>

          {eventsLoading ? (
            <div className="space-y-4" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-secondary)]"
                />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <div className={sectionRule}>
              <p className={body}>
                Club events you create show up here, each with its own check-in
                QR code.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateEvent(true)}
                disabled={readOnly}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={`${textLink} mt-4 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Create the first event
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {events
                .filter((e) =>
                  statusFilter === "all"
                    ? true
                    : statusFilter === "open"
                      ? e.checkInEnabled
                      : !e.checkInEnabled,
                )
                .map((event) => (
                  <li key={event.id} className={`${object} p-5 sm:p-6`}>
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h2 className={itemTitle}>{event.title}</h2>
                          <span
                            className={status(
                              event.checkInEnabled ? "accent" : "neutral",
                            )}
                          >
                            {event.checkInEnabled
                              ? "Check-in open"
                              : "Check-in closed"}
                          </span>
                        </div>
                        {event.description && (
                          <p className={`${body} mt-2`}>{event.description}</p>
                        )}
                        <p className={`${meta} mt-2 tabular-nums`}>
                          {event.location || "No location"} ·{" "}
                          {new Date(event.eventDate).toLocaleDateString()} ·{" "}
                          <span className="font-semibold text-[var(--text-primary)]">
                            {event.currentCheckIns} check-ins
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <button
                          type="button"
                          onClick={() => void qr.show(event)}
                          disabled={qr.generatingFor === event.qrCode}
                          className={btnSecondary}
                        >
                          {qr.generatingFor === event.qrCode
                            ? "Generating…"
                            : "QR code"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            toggleCheckInMutation.mutate({
                              eventId: event.id,
                              enabled: !event.checkInEnabled,
                            })
                          }
                          disabled={readOnly}
                          title={readOnly ? READ_ONLY_TITLE : undefined}
                          className={btnSecondary}
                        >
                          {event.checkInEnabled
                            ? "Close check-in"
                            : "Open check-in"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttendanceEvent(event)}
                          className={textLink}
                        >
                          Attendance
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEvent(event)}
                          disabled={readOnly}
                          title={readOnly ? READ_ONLY_TITLE : undefined}
                          className={`${textLink} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                event.currentCheckIns > 0
                                  ? `Delete this event? Its ${event.currentCheckIns} check-in(s) are deleted with it and cannot be recovered.`
                                  : "Delete this event?",
                              )
                            ) {
                              deleteEventMutation.mutate({ eventId: event.id });
                            }
                          }}
                          disabled={readOnly}
                          title={readOnly ? READ_ONLY_TITLE : undefined}
                          className={btnDanger}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
