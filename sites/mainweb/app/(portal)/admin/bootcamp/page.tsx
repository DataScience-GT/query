"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GraduationCap, Check, Copy, Mail } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { BootcampMaterialsTable } from "@/components/portal/BootcampMaterialsTable";
import type { BootcampMaterialRow } from "@/components/portal/BootcampMaterialsTable";
import { BootcampWorkshopModal } from "@/components/portal/BootcampWorkshopModal";
import type { BootcampWorkshopFormData } from "@/components/portal/BootcampWorkshopModal";
import { trpc } from "@/lib/trpc";

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
    <section className="mb-8 border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
            Email the cohort
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {emails.length} address{emails.length === 1 ? "" : "es"}, everyone
            enrolled this term.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-2 border border-[var(--border-subtle)] bg-white/5 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-white/10"
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy addresses"}
          </button>

          {mailto.length <= MAILTO_LIMIT && (
            <a
              href={mailto}
              className="flex items-center gap-2 border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent transition-colors hover:bg-accent/20"
            >
              <Mail aria-hidden="true" className="h-3.5 w-3.5" />
              Open in mail app
            </a>
          )}
        </div>
      </div>

      {/* Selectable as well as copyable: a locked-down browser refuses the
          clipboard API, and this still works. */}
      <p className="mt-4 select-all break-words font-mono text-xs text-[var(--text-subtle)]">
        {list}
      </p>

      <p aria-live="polite" className="sr-only">
        {copied ? "Addresses copied to the clipboard." : ""}
      </p>

      {mailto.length > MAILTO_LIMIT && (
        <p className="mt-3 text-xs text-[var(--text-subtle)]">
          Too many addresses for a mail-app link. Copy them and paste into BCC.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">
        {value}
      </p>
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
    const response = await fetch(
      `/api/bootcamp/materials/${selected.id}/${kind}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
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
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
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
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-sm text-red-300">
          {attendance.error?.message ?? workshops.error?.message}
        </p>
      </div>
    );
  }

  const data = attendance.data;
  const { sessions, members, stats } = data;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20 text-[var(--text-muted)]">
      <main className="mx-auto max-w-7xl px-6 pt-12 md:pt-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-6 w-6 text-accent" />
              <h1 className="text-3xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
                Bootcamp
              </h1>
            </div>
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--text-subtle)]">
              {termLabel(data.term)} · who is enrolled and who turned up
            </p>
          </div>

          {/* Attendance outlives its semester, so past terms stay reachable. */}
          {data.terms.length > 1 && (
            <div>
              <label
                htmlFor="bootcamp-term"
                className="block font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
              >
                Term
              </label>
              <select
                id="bootcamp-term"
                value={data.term}
                onChange={(event) => setTerm(event.target.value)}
                className="mt-2 border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2 font-mono text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
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

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>

        <section className="mb-8 border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                Published resources
              </p>
              <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
                Workshop materials
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setError(null);
                setModalOpen(true);
              }}
              className="bg-accent px-5 py-3 font-mono text-xs font-black uppercase tracking-widest text-black transition-ui hover:bg-accent/90"
            >
              Add workshop
            </button>
          </div>

          {error && !modalOpen && (
            <p role="alert" className="mb-4 text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-4 text-sm text-accent" role="status">
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

        {sessions.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-8">
            <p className="font-bold text-[var(--text-primary)]">
              No sessions scheduled for {termLabel(data.term)}.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              A bootcamp session is an ordinary event with a bootcamp week set
              on it, so it takes attendance through the same QR and the same
              check-in desk. Create one from the{" "}
              <Link
                href="/admin"
                className="font-bold text-accent hover:underline"
              >
                Club Hub
              </Link>
              .
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-8">
            <p className="font-bold text-[var(--text-primary)]">
              Nobody has bought into this bootcamp yet.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Members enrol by adding the bootcamp to their membership payment.
              They appear here the moment that clears.
            </p>
          </div>
        ) : (
          /* Twelve weeks will not fit a phone; scrolling beats squeezing. */
          <div className="overflow-x-auto border border-[var(--border-subtle)]">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Bootcamp attendance for {termLabel(data.term)}: one row per
                enrolled member, one column per session.
              </caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-white/5">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
                    Member
                  </th>
                  {sessions.map((row) => (
                    <th
                      key={row.id}
                      scope="col"
                      title={`${row.title} · ${row.attendance} checked in`}
                      className="px-3 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                    >
                      W{row.week}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
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
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-normal"
                      >
                        <span className="block font-bold text-[var(--text-primary)]">
                          {member.name}
                        </span>
                        <span className="block text-xs text-[var(--text-subtle)]">
                          {member.email}
                        </span>
                      </th>

                      {sessions.map((row) => (
                        <td key={row.id} className="px-3 py-3 text-center">
                          {attended.has(row.id) ? (
                            <>
                              <Check
                                aria-hidden="true"
                                className="mx-auto h-4 w-4 text-emerald-400"
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

                      <td className="px-4 py-3 text-right font-mono font-bold text-[var(--text-primary)]">
                        {member.attendedCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-subtle)] bg-white/5">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--bg-primary)] px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
                  >
                    Checked in
                  </th>
                  {sessions.map((row) => (
                    <td
                      key={row.id}
                      className="px-3 py-3 text-center font-mono text-xs text-[var(--text-muted)]"
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
          <p className="mt-4 text-xs text-[var(--text-subtle)]">
            A session counts anyone who scanned in, member of this bootcamp or
            not, so a per-session total can run ahead of the rows above. Fix a
            wrong check-in from the event&rsquo;s attendance list on the Club
            Hub.
          </p>
        )}

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
