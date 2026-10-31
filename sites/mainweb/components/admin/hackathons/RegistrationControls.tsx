"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  label,
  meta,
  sectionTitle,
  status as statusClass,
} from "@/components/portal/ui";
import {
  localTimeZone,
  toInputDate,
} from "@/components/admin/hackathons/constants";
import type { HackathonStatus } from "@/components/admin/hackathons/constants";

/**
 * Registration status + deadline controls for one hackathon.
 * Extracted from AttendeesTab; owns its own mutation so the parent stays lean.
 */
export function RegistrationControls({
  hackathonId,
  status,
}: {
  hackathonId: string;
  status: HackathonStatus;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const { data: hackathon } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });
  const editionStatus = hackathon?.status ?? status;

  const refresh = () => {
    utils.hackathon.getById.invalidate({ id: hackathonId });
    utils.hackathon.listAll.invalidate();
  };

  // Which of Open / Close is waiting on its inline "are you sure".
  const [confirming, setConfirming] = React.useState<"open" | "close" | null>(
    null,
  );

  const updateHackathon = trpc.hackathon.update.useMutation({
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
  });
  // The deadline saves on its own as a field is left, so it gets its own
  // saving / saved / error state apart from the Open and Close buttons.
  const saveDeadline = trpc.hackathon.update.useMutation({
    onSuccess: refresh,
  });

  const regDeadline = hackathon?.registrationDeadline
    ? new Date(hackathon.registrationDeadline)
    : null;
  // oxlint-disable-next-line react/purity
  const deadlinePassed = !!regDeadline && regDeadline < new Date();

  const registrationOpen =
    editionStatus === "open" || editionStatus === "in_progress";

  // Opening an edition that is in progress, finished or cancelled would rewind
  // it; only a draft, an announced edition or a closed one is ever opened here.
  const canOpen =
    editionStatus === "draft" ||
    editionStatus === "announced" ||
    editionStatus === "closed";

  /**
   * The interest list exists for one moment — this one — and nothing used to
   * send it, so the people who asked to be told found out from somewhere else
   * or not at all. Offered rather than automatic: the send is thousands of
   * messages through a consumer Gmail account, and an organiser should choose
   * when it starts.
   */
  const interestStatus = trpc.hackathon.registrationOpenEmailStatus.useQuery(
    { hackathonId },
    {
      enabled:
        editionStatus === "announced" ||
        editionStatus === "open" ||
        editionStatus === "in_progress",
    },
  );
  const { data: interestCount } = trpc.hackathon.interestCount.useQuery(
    { hackathonId },
    { enabled: editionStatus === "announced" },
  );

  const [notifyError, setNotifyError] = React.useState<string | null>(null);

  const notifyInterest = trpc.hackathon.notifyRegistrationOpen.useMutation({
    onSuccess: (result) => {
      setNotifyError(
        result.failed.length > 0
          ? `${result.failed.length} address(es) were rejected by the mail provider: ${result.failed.slice(0, 5).join(", ")}`
          : null,
      );
      interestStatus.refetch();
    },
    onError: (error) => setNotifyError(error.message),
  });

  const statusLabel = editionStatus
    ? editionStatus.charAt(0).toUpperCase() +
      editionStatus.slice(1).replace("_", " ")
    : "Unknown";

  return (
    <section>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div>
          <h2 className={sectionTitle}>Registration</h2>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className={label}>Status</dt>
              <dd className="mt-1">
                <span
                  className={statusClass(
                    editionStatus === "open" ? "accent" : "warning",
                  )}
                >
                  {statusLabel}
                </span>
              </dd>
            </div>
            <div className="sm:border-l sm:border-[var(--border-subtle)] sm:pl-8">
              <dt className={label}>Deadline</dt>
              <dd
                className={`mt-1 text-[15px] tabular-nums ${deadlinePassed ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}
              >
                {regDeadline ? regDeadline.toLocaleString() : "No deadline set"}
                {deadlinePassed ? " (passed)" : ""}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor={`reg-deadline-${hackathonId}`} className={fieldLabel}>
              Registration deadline ({localTimeZone()})
              <span
                role="status"
                className={`ml-2 font-normal ${saveDeadline.isError ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"}`}
              >
                {saveDeadline.isPending
                  ? "Saving…"
                  : saveDeadline.isError
                    ? "Not saved"
                    : saveDeadline.isSuccess
                      ? "Saved"
                      : ""}
              </span>
            </label>
            {/* Saved as the field is left, not on every keystroke of a
                datetime-local, which fires change per segment. Keyed on the
                saved value so a refetch (or a late first load) shows it. */}
            <input
              key={regDeadline?.toISOString() ?? "none"}
              id={`reg-deadline-${hackathonId}`}
              type="datetime-local"
              aria-label={`Registration deadline (${localTimeZone()})`}
              defaultValue={regDeadline ? toInputDate(regDeadline) : ""}
              onChange={() => saveDeadline.reset()}
              onBlur={(e) => {
                // A half-typed date reads as "", and saving that would clear
                // the deadline the organiser was only part-way through editing.
                if (e.target.validity.badInput) return;
                const value = e.target.value;
                if (value === (regDeadline ? toInputDate(regDeadline) : "")) {
                  return;
                }
                saveDeadline.mutate({
                  id: hackathonId,
                  registrationDeadline: value ? new Date(value) : null,
                });
              }}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={`min-h-11 ${input.replace("w-full", "w-auto")}`}
            />
          </div>
          {canOpen &&
            (confirming === "open" ? (
              <div className="flex flex-col gap-2">
                <span className={meta}>
                  {deadlinePassed
                    ? "Applications open again and the deadline moves to the event end."
                    : "Applications open to everyone."}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateHackathon.mutate({
                        id: hackathonId,
                        status: "open",
                        // A passed deadline blocks signups even when status is
                        // open, so reopening must also push the deadline out.
                        ...(deadlinePassed && hackathon?.endDate
                          ? {
                              registrationDeadline: new Date(
                                hackathon.endDate,
                              ),
                            }
                          : {}),
                      })
                    }
                    disabled={readOnly || updateHackathon.isPending}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={btnPrimary}
                  >
                    {updateHackathon.isPending ? "Opening…" : "Yes, open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={updateHackathon.isPending}
                    className={btnSecondary}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setConfirming("open")}
                  disabled={readOnly || updateHackathon.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={btnPrimary}
                >
                  {deadlinePassed ? "Reopen registration" : "Open registration"}
                </button>
                {deadlinePassed && (
                  <span className={meta}>
                    Also moves the deadline to the event end
                  </span>
                )}
              </div>
            ))}
          {editionStatus === "open" &&
            (confirming === "close" ? (
              <div className="flex flex-col gap-2">
                <span className={meta}>
                  New applications stop. Existing ones are kept.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateHackathon.mutate({
                        id: hackathonId,
                        status: "closed",
                      })
                    }
                    disabled={readOnly || updateHackathon.isPending}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={btnDanger}
                  >
                    {updateHackathon.isPending ? "Closing…" : "Yes, close"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={updateHackathon.isPending}
                    className={btnSecondary}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming("close")}
                disabled={readOnly || updateHackathon.isPending}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnDanger}
              >
                Close registration
              </button>
            ))}
        </div>
      </div>

      {(updateHackathon.isError || saveDeadline.isError) && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[13px] text-[var(--danger)]"
        >
          {updateHackathon.isError
            ? updateHackathon.error.message
            : `The deadline was not saved: ${saveDeadline.error?.message}`}
        </p>
      )}

      {editionStatus === "announced" && (
        <div className="mt-6 pt-5 border-t border-[var(--border-subtle)]">
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
            Interest list for this edition
          </p>
          <p className={`mt-1 max-w-2xl ${body}`}>
            {interestCount === undefined
              ? "Checking this edition's list…"
              : interestCount === 0
                ? "Nobody has joined yet. The public form writes to this hackathon."
                : `${interestCount} ${interestCount === 1 ? "person is" : "people are"} on this edition's list. Applications stay empty until you open registration. The Email tab has the roster.`}
          </p>
        </div>
      )}

      {registrationOpen && (interestStatus.data?.total ?? 0) > 0 && (
        <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">
              Interest list
            </p>
            <p className={`mt-1 tabular-nums ${meta}`}>
              {interestStatus.data?.pending ?? 0} waiting to be told ·{" "}
              {interestStatus.data?.sent ?? 0} already emailed
              {(interestStatus.data?.pending ?? 0) > 500
                ? " · sends 500 at a time, press again to continue"
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNotifyError(null);
              notifyInterest.mutate({ hackathonId });
            }}
            disabled={
              readOnly ||
              notifyInterest.isPending ||
              (interestStatus.data?.pending ?? 0) === 0
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            {notifyInterest.isPending
              ? "Sending…"
              : (interestStatus.data?.pending ?? 0) === 0
                ? "Everyone notified"
                : `Email ${interestStatus.data?.pending} interested`}
          </button>
        </div>
      )}

      {notifyError && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[13px] text-[var(--danger)]"
        >
          {notifyError}
        </p>
      )}
    </section>
  );
}
