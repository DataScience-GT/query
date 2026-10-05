"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Copy, Mail } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { BootcampMaterialsTable } from "@/components/portal/BootcampMaterialsTable";
import type { BootcampMaterialRow } from "@/components/portal/BootcampMaterialsTable";
import { BootcampWorkshopModal } from "@/components/portal/BootcampWorkshopModal";
import type { BootcampWorkshopFormData } from "@/components/portal/BootcampWorkshopModal";
import { EventAttendanceModal } from "@/components/portal/EventAttendanceModal";
import { useEventQR } from "@/components/portal/EventQR";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  kicker,
  label,
  meta,
  pageDek,
  sectionTitle,
  status as statusDot,
  textLink,
} from "@/components/portal/ui";

/** Admin pages carry a smaller headline than member pages. */
const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]";

const th = "px-3 py-2.5 text-[13px] font-medium text-[var(--text-subtle)]";

/** `2026-fall` is how it is stored; nobody should have to read it that way. */
function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

/** `datetime-local` carries local wall-clock time rather than a UTC ISO value. */
function toLocalInput(date: Date) {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000,
  );
  return local.toISOString().slice(0, 16);
}

/** A mailto with the whole cohort BCC'd stops being clickable somewhere around
 *  2000 characters, and browsers differ on where. Past that, copying is the only
 *  thing that reliably works. */
const MAILTO_LIMIT = 1800;

function CohortEmails({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  const list = emails.join(", ");
  const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(","))}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(list);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked without a secure context or permission; the
      // addresses are on screen below either way.
      setCopied(false);
    }
  };

  return (
    <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={itemTitle}>Email the cohort</h2>
          <p className={`mt-1 ${body}`}>
            <span className="tabular-nums">{emails.length}</span> address
            {emails.length === 1 ? "" : "es"}, everyone enrolled this term.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={copy} className={btnSecondary}>
            <Copy aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {copied ? "Copied" : "Copy addresses"}
          </button>

          {mailto.length <= MAILTO_LIMIT && (
            <a href={mailto} className={btnSecondary}>
              <Mail aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              Open in mail app
            </a>
          )}
        </div>
      </div>

      {/* Selectable as well as copyable: a locked-down browser refuses the
          clipboard API, and this still works. */}
      <p className="mt-4 select-all break-words text-[13px] leading-relaxed text-[var(--text-subtle)]">
        {list}
      </p>

      <p aria-live="polite" className="sr-only">
        {copied ? "Addresses copied to the clipboard." : ""}
      </p>

      {mailto.length > MAILTO_LIMIT && (
        <p className={`mt-3 ${meta}`}>
          Too many addresses for a mail-app link. Copy them and paste them into
          BCC.
        </p>
      )}
    </section>
  );
}

function Stat({
  label: text,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <dt className={label}>{text}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums text-[var(--text-primary)] md:text-[36px]">
        {value}
      </dd>
    </div>
  );
}

export default function AdminBootcampPage() {
  const { data: session, status } = useSession();
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<BootcampMaterialRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const attendance = trpc.bootcamp.attendance.useQuery(
    { term },
    { enabled: !!session },
  );
  const workshops = trpc.bootcamp.adminWorkshops.useQuery(
    { term },
    { enabled: !!session },
  );
  const createWorkshop = trpc.bootcamp.createWorkshop.useMutation();
  const updateWorkshop = trpc.bootcamp.updateWorkshop.useMutation();
  const upsertSession = trpc.bootcamp.upsertSession.useMutation();

  // Session check-in lives here rather than on the Club Hub: a session is
  // still an event underneath, with the same QR and door, but staff run it
  // from the bootcamp page.
  const qr = useEventQR();
  const [attendanceFor, setAttendanceFor] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const toggleCheckIn = trpc.events.toggleCheckIn.useMutation({
    onSuccess: () => utils.bootcamp.attendance.invalidate(),
  });
  const setPublished = trpc.bootcamp.setPublished.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.bootcamp.adminWorkshops.invalidate(),
        utils.bootcamp.workshops.invalidate(),
      ]);
    },
  });

  const upload = async (
    workshopId: string,
    kind: "materials" | "solution",
    file: File,
  ) => {
    const response = await fetch(
      `/api/bootcamp/materials/${workshopId}/${kind}`,
      {
        method: "POST",
        headers: { "x-bootcamp-filename": encodeURIComponent(file.name) },
        body: file,
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `Upload failed (${response.status})`);
    }
  };

  const saveWorkshop = async (form: BootcampWorkshopFormData) => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const wasEditing = !!selected;
    // What the form opened with, so an untouched date or room is not rewritten.
    const initialDate = selected?.eventDate
      ? toLocalInput(new Date(selected.eventDate))
      : "";
    const initialLocation = selected?.location ?? "";
    const dateChanged = form.sessionDate !== initialDate;
    const locationChanged = form.location.trim() !== initialLocation;

    let workshopId: string;
    try {
      const fields = {
        title: form.title.trim(),
        recordingUrl: form.recordingUrl.trim() || null,
      };
      const saved = selected
        ? await updateWorkshop.mutateAsync({
            workshopId: selected.id,
            ...fields,
          })
        : await createWorkshop.mutateAsync({
            ...fields,
            week: Number(form.week),
            // The term being viewed, not the live one: adding a week while
            // filtered to a past cohort must land in that cohort. Undefined
            // until the officer picks one, which the server reads as current.
            term,
          });
      workshopId = saved.id;
      // A create followed by a failed upload must retry as an edit; otherwise
      // the second save collides with the draft row that already succeeded.
      setSelected({
        ...saved,
        eventDate: selected?.eventDate ?? null,
        location: selected?.location ?? null,
      });
    } catch (cause) {
      setError(
        `Workshop details were not saved: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
      setIsSaving(false);
      return;
    }

    try {
      // A blank date on a new row means TBA, not "detach week N's session".
      if (dateChanged || (locationChanged && form.sessionDate)) {
        await upsertSession.mutateAsync({
          workshopId,
          sessionDate: form.sessionDate ? new Date(form.sessionDate) : null,
          ...(locationChanged ? { location: form.location.trim() || null } : {}),
        });
      }
      // Session writes affect the material join, attendance views, and every
      // event list that can expose the new QR-backed club event.
      await Promise.all([
        utils.bootcamp.adminWorkshops.invalidate(),
        utils.bootcamp.workshops.invalidate(),
        utils.bootcamp.attendance.invalidate(),
        utils.bootcamp.myProgress.invalidate(),
        utils.events.listAll.invalidate(),
        utils.events.list.invalidate(),
        utils.events.myEvents.invalidate(),
        utils.events.myStats.invalidate(),
      ]);
    } catch (cause) {
      setError(
        `Workshop details were saved, but its session event was not: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
      setIsSaving(false);
      return;
    }

    try {
      if (form.materials) {
        await upload(workshopId, "materials", form.materials);
      }
      if (form.solution) {
        await upload(workshopId, "solution", form.solution);
      }
    } catch (cause) {
      await utils.bootcamp.adminWorkshops.invalidate();
      setError(
        `Workshop details were saved, but a ZIP upload failed: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
      setIsSaving(false);
      return;
    }

    await Promise.all([
      utils.bootcamp.adminWorkshops.invalidate(),
      utils.bootcamp.workshops.invalidate(),
    ]);
    setNotice(wasEditing ? "Workshop updated." : "Workshop created as a draft.");
    setIsSaving(false);
    setModalOpen(false);
    setSelected(null);
  };

  const removeFile = async (kind: "materials" | "solution") => {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    // A network failure otherwise leaves isSaving set and the modal stuck.
    const response = await fetch(
      `/api/bootcamp/materials/${selected.id}/${kind}`,
      { method: "DELETE" },
    ).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? `Could not remove ${kind}.`);
      setIsSaving(false);
      return;
    }
    setSelected({
      ...selected,
      ...(kind === "materials"
        ? {
            materialsKey: null,
            materialsFileName: null,
            materialsSizeBytes: null,
          }
        : {
            solutionKey: null,
            solutionFileName: null,
            solutionSizeBytes: null,
          }),
    });
    await utils.bootcamp.adminWorkshops.invalidate();
    setNotice(`${kind === "materials" ? "Materials" : "Solution"} ZIP removed.`);
    setIsSaving(false);
  };

  const deleteWorkshop = async (row: BootcampMaterialRow) => {
    if (
      !window.confirm(
        `Delete week ${row.week}, its metadata, materials ZIP, and solution ZIP? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/bootcamp/materials/${row.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not delete workshop.");
      return;
    }
    await Promise.all([
      utils.bootcamp.adminWorkshops.invalidate(),
      utils.bootcamp.workshops.invalidate(),
    ]);
    setNotice(`Week ${row.week} deleted.`);
  };

  if (status === "loading" || attendance.isPending || workshops.isPending) {
    return <LoadingScreen message="Loading bootcamp…" />;
  }

  if (attendance.error || workshops.error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <p role="alert" className="text-[15px] text-[var(--danger)]">
          The bootcamp did not load:{" "}
          {attendance.error?.message ?? workshops.error?.message} Reload the
          page to try again.
        </p>
      </div>
    );
  }

  const data = attendance.data;
  const { sessions, members, stats } = data;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20 text-[var(--text-muted)]">
      <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 md:px-12 md:py-14">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className={kicker}>{termLabel(data.term)}</p>
            <h1 className={`mt-2 ${adminTitle}`}>Bootcamp</h1>
            <p className={pageDek}>
              Who is enrolled, who turned up, and what each week hands out.
            </p>
          </div>

          {/* Attendance outlives its semester, so past terms stay reachable. */}
          {data.terms.length > 1 && (
            <div className="w-full sm:w-48">
              <label htmlFor="bootcamp-term" className={fieldLabel}>
                Term
              </label>
              <select
                id="bootcamp-term"
                value={data.term}
                onChange={(event) => setTerm(event.target.value)}
                className={input}
              >
                {data.terms.map((option) => (
                  <option key={option} value={option}>
                    {termLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-4">
          <Stat label="Enrolled" value={stats.enrolled} />
          <Stat
            label="Sessions held"
            value={`${stats.sessionsHeld}/${stats.sessionsPlanned}`}
          />
          <Stat label="Average attendance" value={stats.averageAttendance} />
          <Stat
            label="Turnout"
            value={
              stats.enrolled && stats.sessionsHeld
                ? `${Math.round((stats.averageAttendance / stats.enrolled) * 100)}%`
                : "—"
            }
          />
        </dl>

        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className={sectionTitle}>Workshop materials</h2>
              <p className={`mt-1 ${meta}`}>
                What members download each week. New weeks start as drafts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setError(null);
                setModalOpen(true);
              }}
              className={btnPrimary}
            >
              Add workshop
            </button>
          </div>

          {error && !modalOpen && (
            <p role="alert" className="mb-4 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {notice && (
            <p className={`mb-4 ${statusDot("success")}`} role="status">
              {notice}
            </p>
          )}

          <BootcampMaterialsTable
            rows={workshops.data ?? []}
            term={termLabel(data.term)}
            isUpdating={setPublished.isPending}
            onEdit={(row) => {
              setSelected(row);
              setError(null);
              setModalOpen(true);
            }}
            onDelete={deleteWorkshop}
            onSetPublished={async (row, isPublished) => {
              setError(null);
              setNotice(null);
              try {
                await setPublished.mutateAsync({
                  workshopId: row.id,
                  isPublished,
                });
                setNotice(
                  `Week ${row.week} ${isPublished ? "published" : "returned to draft"}.`,
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not change publication status.",
                );
              }
            }}
          />
        </section>

        {members.length > 0 && (
          <CohortEmails emails={members.map((member) => member.email)} />
        )}

        {qr.modal}
        {attendanceFor && (
          <EventAttendanceModal
            eventId={attendanceFor.id}
            eventTitle={attendanceFor.title}
            onClose={() => setAttendanceFor(null)}
          />
        )}

        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <h2 className={sectionTitle}>Session check-in</h2>
          <p className={`mt-1 ${meta}`}>
            Show the QR code at the door, then close check-in when the session
            ends.
          </p>

          {sessions.length > 0 && (
            <ul className="mt-5 border-t border-[var(--border-subtle)]">
              {sessions.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 border-b border-[var(--border-subtle)] py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`${label} tabular-nums`}>
                        Week {row.week}
                      </span>
                      <span className="text-[17px] font-semibold text-[var(--text-primary)]">
                        {row.title}
                      </span>
                      <span
                        className={statusDot(
                          row.checkInEnabled ? "accent" : "neutral",
                        )}
                      >
                        {row.checkInEnabled ? "Check-in open" : "Check-in closed"}
                      </span>
                    </div>
                    <p className={`mt-1 ${meta}`}>
                      {row.location || "No room set"} ·{" "}
                      {new Date(row.eventDate).toLocaleDateString()} ·{" "}
                      <span className="tabular-nums">{row.attendance}</span>{" "}
                      checked in
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void qr.show(row)}
                      disabled={qr.generatingFor === row.qrCode}
                      className={`${btnSecondary} min-h-11`}
                    >
                      {qr.generatingFor === row.qrCode
                        ? "Generating…"
                        : "Show QR code"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toggleCheckIn.mutate({
                          eventId: row.id,
                          enabled: !row.checkInEnabled,
                        })
                      }
                      disabled={toggleCheckIn.isPending}
                      className={`${btnSecondary} min-h-11`}
                    >
                      {row.checkInEnabled ? "Close check-in" : "Open check-in"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAttendanceFor({ id: row.id, title: row.title })
                      }
                      className={`${textLink} min-h-11`}
                    >
                      Attendance
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className={`mt-10 ${itemTitle}`}>Attendance by member</h3>

          {sessions.length === 0 ? (
            <p className={`mt-3 max-w-2xl ${body}`}>
              No sessions are scheduled for {termLabel(data.term)}. Give a
              workshop a session date under Workshop materials, and its QR code,
              check-in controls and attendance column appear here.
            </p>
          ) : members.length === 0 ? (
            <p className={`mt-3 max-w-2xl ${body}`}>
              Nobody has enrolled in this bootcamp yet. Members enrol by adding
              the bootcamp to their membership payment, and they appear here as
              soon as it clears.
            </p>
          ) : (
            /* Twelve weeks will not fit a phone; scrolling beats squeezing. */
            <div className="mt-4 overflow-x-auto border-y border-[var(--border-subtle)]">
              <table className="w-full border-collapse text-[15px]">
                <caption className="sr-only">
                  Bootcamp attendance for {termLabel(data.term)}: one row per
                  enrolled member, one column per session.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th
                      scope="col"
                      className={`sticky left-0 z-10 bg-[var(--bg-primary)] pl-0 text-left ${th}`}
                    >
                      Member
                    </th>
                    {sessions.map((row) => (
                      <th
                        key={row.id}
                        scope="col"
                        title={`${row.title} · ${row.attendance} checked in`}
                        className={`text-center tabular-nums ${th}`}
                      >
                        W{row.week}
                      </th>
                    ))}
                    <th scope="col" className={`pr-0 text-right ${th}`}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const attended = new Set(member.attendedEventIds);
                    return (
                      <tr
                        key={member.userId}
                        className="group border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--bg-secondary)]"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-[var(--bg-primary)] py-3 pr-3 text-left font-normal transition-colors group-hover:bg-[var(--bg-secondary)]"
                        >
                          <span className="block font-semibold text-[var(--text-primary)]">
                            {member.name}
                          </span>
                          <span className="block text-[13px] text-[var(--text-subtle)]">
                            {member.email}
                          </span>
                        </th>

                        {sessions.map((row) => (
                          <td key={row.id} className="px-3 py-3 text-center">
                            {attended.has(row.id) ? (
                              <>
                                <Check
                                  aria-hidden="true"
                                  strokeWidth={1.75}
                                  className="mx-auto h-4 w-4 text-[var(--success)]"
                                />
                                <span className="sr-only">
                                  Attended week {row.week}
                                </span>
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true" className="text-[var(--text-subtle)]">
                                  ·
                                </span>
                                <span className="sr-only">
                                  {row.past ? "Missed" : "Not held yet"} week{" "}
                                  {row.week}
                                </span>
                              </>
                            )}
                          </td>
                        ))}

                        <td className="py-3 pl-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                          {member.attendedCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 bg-[var(--bg-primary)] pl-0 text-left ${th}`}
                    >
                      Checked in
                    </th>
                    {sessions.map((row) => (
                      <td
                        key={row.id}
                        className="px-3 py-2.5 text-center text-[13px] tabular-nums text-[var(--text-muted)]"
                      >
                        {row.attendance}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {sessions.length > 0 && (
            <p className={`mt-4 max-w-2xl ${meta}`}>
              A session counts anyone who scanned in, member of this bootcamp or
              not, so a per-session total can run ahead of the rows above. Fix a
              wrong check-in from that session&rsquo;s Attendance list.
            </p>
          )}
        </section>

        {modalOpen && (
          <BootcampWorkshopModal
            mode={selected ? "edit" : "create"}
            initial={
              selected
                ? {
                    week: String(selected.week),
                    title: selected.title,
                    sessionDate: selected.eventDate
                      ? toLocalInput(new Date(selected.eventDate))
                      : "",
                    location: selected.location ?? "",
                    recordingUrl: selected.recordingUrl ?? "",
                    materialsFileName: selected.materialsFileName,
                    solutionFileName: selected.solutionFileName,
                  }
                : undefined
            }
            isSubmitting={isSaving}
            error={error}
            onRemoveFile={removeFile}
            onSubmit={saveWorkshop}
            onClose={() => {
              if (isSaving) return;
              setModalOpen(false);
              setSelected(null);
              setError(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
