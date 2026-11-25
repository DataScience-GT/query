"use client";

import type { SavedRegistration } from "@/components/hackathon/RegistrationForm";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DiscordCard } from "@/components/hackathon/DiscordCard";
import { InterestForm } from "@/components/hackathon/InterestForm";
import { hackathonSlug, isHacklyticsName } from "@/lib/hackathon-slug";
import { isAdmitted } from "@/lib/hackathon-next-step";
import { trpc } from "@/lib/trpc";
import { venueDate } from "@/lib/venue-time";

import { Alert } from "@query/ui/Alert";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionTitle,
  status,
  textLink,
} from "@query/ui/classes";

// The form and what only it needs (the school and major lists, the resume
// upload, the field components) stay out of the first load. The load starts
// when someone reaches for the button that opens it, so the click finds it
// ready.
const loadRegistrationForm = () =>
  import("@/components/hackathon/RegistrationForm").then(
    (m) => m.RegistrationForm,
  );
const RegistrationForm = dynamic(loadRegistrationForm, {
  loading: () => <p className={body}>Loading…</p>,
});
const preloadRegistrationForm = {
  onPointerEnter: () => void loadRegistrationForm(),
  onFocus: () => void loadRegistrationForm(),
  onTouchStart: () => void loadRegistrationForm(),
};

// Statuses that can still back out. checked_in is on site, and a rejected or
// waitlisted application stays on record (withdrawing and re-applying would
// skip the decision); the server refuses all three anyway.
const WITHDRAWABLE = new Set(["pending", "approved"]);

export function InfoTab({
  hackathon,
  isRegistered,
  myReg,
}: {
  hackathon: {
    id: string;
    name: string;
    description?: string | null;
    prizes?: { place: string; amount: number; description?: string }[] | null;
    rules?: string | null;
    startDate: string | Date;
    endDate: string | Date;
    registrationDeadline?: string | Date | null;
    websiteUrl?: string | null;
    status: string;
    maxParticipants?: number | null;
    currentParticipants: number;
    theme?: string | null;
    tracks?: string[] | null;
  };
  isRegistered: boolean;
  myReg?: {
    registrationStatus: string;
    teamId?: string | null;
    attendanceConfirmedAt?: string | Date | null;
  } | null;
}) {
  // The form stands in for the overview while open: a new registration, or
  // an edit of the existing, pending application with its saved answers.
  const [form, setForm] = useState<{ saved?: SavedRegistration } | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [updated, setUpdated] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // What they told the interest list, for the form to offer.
  const interest = trpc.hackathon.myInterest.useQuery(
    { hackathonId: hackathon.id },
    { enabled: hackathon.status === "open" && !isRegistered },
  );

  const utils = trpc.useUtils();
  const router = useRouter();

  const withdrawMutation = trpc.hackathon.withdrawRegistration.useMutation({
    onSuccess: () => {
      setConfirmWithdraw(false);
      setWithdrawError("");
      // success would otherwise keep the registered view up after this
      // session's own registration is withdrawn.
      setSuccess(false);
      setUpdated(false);
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
      utils.hackathon.list.invalidate();
      utils.hackathon.getById.invalidate({ id: hackathon.id });
      // An accepted hacker has "My <edition>" in the sidebar, which the portal
      // layout draws on the server from these registrations.
      router.refresh();
    },
    onError: (e) => setWithdrawError(e.message),
  });

  const confirmMutation = trpc.hackathon.confirmAttendance.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
    },
  });

  // Opens the form on what was submitted. Read fresh rather than from cache:
  // the answers being edited must be the saved ones, not an older copy.
  async function openEdit() {
    setEditError("");
    setLoadingEdit(true);
    void loadRegistrationForm();
    try {
      const record = await utils.hackathon.myParticipantRecord.fetch(
        { hackathonId: hackathon.id },
        { staleTime: 0 },
      );
      if (!record) {
        setEditError("Couldn't find your application. Refresh the page.");
        return;
      }
      setUpdated(false);
      setForm({ saved: record });
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Couldn't load your application.",
      );
    } finally {
      setLoadingEdit(false);
    }
  }

  const isFull = !!(
    hackathon.maxParticipants &&
    hackathon.currentParticipants >= hackathon.maxParticipants
  );
  const deadlinePassed = !!(
    hackathon.registrationDeadline &&
    // oxlint-disable-next-line react/purity
    new Date(hackathon.registrationDeadline) < new Date()
  );
  // Full no longer blocks applying: capacity counts accepted people only, and
  // organisers waitlist anyone past it.
  const canRegister =
    hackathon.status === "open" && !isRegistered && !deadlinePassed;
  // A fresh registration starts pending; myReg lags a refetch behind success.
  const regStatus = myReg?.registrationStatus ?? "pending";
  // The server refuses an edit once an organiser has decided or registration
  // has closed; offering it only while it can work saves a dead end.
  const canEdit =
    isRegistered &&
    regStatus === "pending" &&
    hackathon.status === "open" &&
    !deadlinePassed;
  // confirmMutation covers the refetch that follows the click.
  const attendanceConfirmed =
    !!myReg?.attendanceConfirmedAt || confirmMutation.isSuccess;
  const registered = isRegistered || success;
  // The header badge and the next-step strip already say where an application
  // stands, so this column holds only what can be done about it. Decided or
  // waiting with nothing to do, it is not drawn.
  const hasStatusActions = isAdmitted(regStatus) || canEdit;
  const showsStatus = success || updated || !registered || hasStatusActions;
  // The register line carries the deadline, so the facts list skips it then.
  const registerOffered = !registered && canRegister;

  return (
    <div className="space-y-10">
      {!form && showsStatus && (
        <section>
          {success && (
            <p className="border-accent mb-6 border-l-2 pl-3 text-[15px] text-[var(--text-primary)]">
              Registration received. An organizer will review it; your status
              updates here.
            </p>
          )}

          {updated && (
            <p className="border-accent mb-6 border-l-2 pl-3 text-[15px] text-[var(--text-primary)]">
              Application updated.
            </p>
          )}

          {registered && hasStatusActions ? (
            <div className="flex flex-col items-start gap-2">
              {regStatus === "approved" &&
                (attendanceConfirmed ? (
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className={status("success")}>Confirmed</span>
                    <span className={meta}>
                      Organizers know you&apos;re coming.
                    </span>
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        confirmMutation.mutate({ hackathonId: hackathon.id })
                      }
                      disabled={confirmMutation.isPending}
                      className={btnPrimary}
                    >
                      {confirmMutation.isPending ? "Confirming…" : "I'm coming"}
                    </button>
                    <p className={meta}>
                      Let organizers know you&apos;ll be there.
                    </p>
                    {confirmMutation.isError && (
                      <Alert>{confirmMutation.error.message}</Alert>
                    )}
                  </div>
                ))}
              {isAdmitted(regStatus) && (
                <DiscordCard
                  hackathonId={hackathon.id}
                  bloom={isHacklyticsName(hackathon.name)}
                />
              )}
              {canEdit && (
                <div className="flex flex-col items-start gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    {...preloadRegistrationForm}
                    disabled={loadingEdit}
                    className={btnSecondary}
                  >
                    {loadingEdit ? "Loading…" : "Edit application"}
                  </button>
                  <p className={meta}>
                    Fix a typo or add a link until an organizer reviews it.
                  </p>
                  {editError && <Alert>{editError}</Alert>}
                </div>
              )}
              {regStatus === "checked_in" && (
                <Link
                  href={`/submit?id=${hackathon.id}`}
                  className={btnPrimary}
                >
                  Submit your project
                </Link>
              )}
            </div>
          ) : registered ? null : canRegister && !deadlinePassed ? (
            <div>
              <h2 className={sectionTitle}>Register</h2>
              <p className={`mt-2 ${body}`}>
                Five steps: personal info, school, experience, logistics, and a few just-for-fun questions.
                {hackathon.registrationDeadline
                  ? ` Closes ${venueDate(hackathon.registrationDeadline)}.`
                  : ""}
              </p>
              {isFull && (
                <p className={`mt-2 ${body}`}>
                  All seats are taken. You can still apply; new applicants are
                  waitlisted until a seat opens.
                </p>
              )}
              <button
                type="button"
                onClick={() => setForm({})}
                {...preloadRegistrationForm}
                className={`mt-6 w-full sm:w-auto ${btnPrimary}`}
              >
                Start registration
              </button>
            </div>
          ) : hackathon.status === "announced" ? (
            /* Announced is not closed — the closed message below reads as "you
               missed it". Join against THIS edition's id, not a bounce to
               /hacklytics which follows whichever event getUpcoming picks. */
            <InterestForm
              hackathonId={hackathon.id}
              callbackPath={`/hackathons/${hackathonSlug(hackathon.name)}`}
            />
          ) : (
            <p className={body}>Registration is closed.</p>
          )}
        </section>
      )}

      {/* With the form open it is the only thing in the panel. */}
      {!form && (
        <>
          {hackathon.description && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <h3 className={itemTitle}>About</h3>
              <p className={`mt-2 max-w-2xl whitespace-pre-wrap ${body}`}>
                {hackathon.description}
              </p>
            </section>
          )}

          {hackathon.prizes && hackathon.prizes.length > 0 && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <h3 className={itemTitle}>Prizes</h3>
              <dl className="mt-3 max-w-2xl">
                {hackathon.prizes.map(
                  (
                    p: { place: string; amount: number; description?: string },
                    i: number,
                  ) => (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-6 border-b border-[var(--border-subtle)] py-3"
                    >
                      <dt className="min-w-0">
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                          {p.place}
                        </span>
                        {p.description && (
                          <span className={`block ${meta}`}>
                            {p.description}
                          </span>
                        )}
                      </dt>
                      <dd className="shrink-0 font-[family-name:var(--font-display)] text-[22px] font-semibold text-[var(--text-primary)] tabular-nums">
                        ${p.amount.toLocaleString()}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </section>
          )}

          {hackathon.rules && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <h3 className={itemTitle}>Rules</h3>
              <ul className="mt-2 max-w-2xl space-y-3">
                {hackathon.rules
                  .split("\n")
                  .map((rule) => rule.trim())
                  .filter(Boolean)
                  .map((rule, i) => (
                    <li key={i} className={body}>
                      {rule}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {((hackathon.registrationDeadline && !registerOffered) ||
            hackathon.websiteUrl) && (
            <dl className="grid max-w-2xl grid-cols-1 gap-x-10 gap-y-4 border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0 sm:grid-cols-2">
              {hackathon.registrationDeadline && !registerOffered && (
                <div>
                  <dt className={label}>
                    {deadlinePassed
                      ? "Registration closed"
                      : "Registration closes"}
                  </dt>
                  <dd className="mt-0.5 text-[15px] text-[var(--text-primary)]">
                    {venueDate(hackathon.registrationDeadline)}
                  </dd>
                </div>
              )}
              {hackathon.websiteUrl && (
                <div>
                  <dt className={label}>Website</dt>
                  <dd className="mt-0.5">
                    <a
                      href={hackathon.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={textLink}
                    >
                      Event website
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* Last, away from the status and the confirm button. */}
          {registered && WITHDRAWABLE.has(regStatus) && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <div className="flex flex-col items-start gap-3">
                {regStatus === "approved" && !confirmWithdraw && (
                  <p className={body}>
                    Can&apos;t make it? Withdraw so a waitlisted hacker can have
                    your seat.
                  </p>
                )}
                {/* On a team the server refuses until you leave it, so say
                    that up front rather than after two clicks. */}
                {myReg?.teamId ? (
                  <p className={meta}>To withdraw, leave your team first.</p>
                ) : confirmWithdraw ? (
                  <div className="flex w-full flex-col gap-3">
                    <p className={body}>
                      Withdraw your registration? You can apply again while
                      registration is open.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          withdrawMutation.mutate({ hackathonId: hackathon.id })
                        }
                        disabled={withdrawMutation.isPending}
                        className={btnDanger}
                      >
                        {withdrawMutation.isPending
                          ? "Withdrawing…"
                          : "Withdraw"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmWithdraw(false);
                          setWithdrawError("");
                        }}
                        disabled={withdrawMutation.isPending}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmWithdraw(true)}
                    className={btnDanger}
                  >
                    Withdraw registration
                  </button>
                )}
                {withdrawError && <Alert>{withdrawError}</Alert>}
              </div>
            </section>
          )}
        </>
      )}

      {form && (
        <RegistrationForm
          hackathonId={hackathon.id}
          hackathonName={hackathon.name}
          startDate={hackathon.startDate}
          endDate={hackathon.endDate}
          tracks={hackathon.tracks}
          interest={interest.data}
          saved={form.saved}
          onRegistered={() => {
            setSuccess(true);
            setForm(null);
          }}
          onUpdated={() => {
            setUpdated(true);
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  );
}
