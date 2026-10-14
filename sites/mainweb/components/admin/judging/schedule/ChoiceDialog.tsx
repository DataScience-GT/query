"use client";

import { useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { ModalWrapper } from "@/components/portal/ModalWrapper";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  status,
  textLink,
} from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import { clock, slotTime } from "./format";

/** What the dialog places: a booked appointment, or a presentation with none. */
export type ChoiceTarget =
  | { kind: "move"; appointmentId: string }
  | {
      kind: "assign";
      entryId: string;
      challengeId: string;
      entryTitle: string;
      challengeLabel: string;
    };

const SHOWN_AT_FIRST = 12;

/**
 * The open slots for one presentation, best first, with the first marked as
 * the suggestion and picked to begin with.
 */
export function ChoiceDialog({
  hackathonId,
  target,
  windowStart,
  sameBuildingBreakMinutes,
  onClose,
}: {
  hackathonId: string;
  target: ChoiceTarget;
  windowStart: Date;
  sameBuildingBreakMinutes: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [picked, setPicked] = useState<string | null>(null);
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const moving = target.kind === "move";
  const moveChoices = trpc.judging.schedule.moveChoices.useQuery(
    target.kind === "move"
      ? { hackathonId, appointmentId: target.appointmentId }
      : skipToken,
    { retry: false },
  );
  const assignChoices = trpc.judging.schedule.assignChoices.useQuery(
    target.kind === "assign"
      ? {
          hackathonId,
          entryId: target.entryId,
          challengeId: target.challengeId,
        }
      : skipToken,
    { retry: false },
  );
  const choicesQuery = moving ? moveChoices : assignChoices;

  const done = async () => {
    await utils.judging.schedule.get.invalidate({ hackathonId });
    onClose();
  };
  // A refusal over a slot that just filled, or a stale revision: the board
  // and the choices are out of date, so both reload under the message.
  const reloadOnConflict = (error: { data?: { code?: string } | null }) => {
    if (error.data?.code !== "CONFLICT") return;
    setPicked(null);
    void utils.judging.schedule.get.invalidate({ hackathonId });
    void choicesQuery.refetch();
  };
  const move = trpc.judging.schedule.move.useMutation({
    onSuccess: done,
    onError: reloadOnConflict,
  });
  const assign = trpc.judging.schedule.assign.useMutation({
    onSuccess: done,
    onError: reloadOnConflict,
  });
  const pending = move.isPending || assign.isPending;
  const saveError = move.error ?? assign.error;

  const choices = choicesQuery.data?.choices ?? [];
  const keyOf = (c: { roomId: string; startsAt: Date }) =>
    `${c.roomId}@${c.startsAt.toISOString()}`;
  const selectedKey = picked ?? (choices[0] ? keyOf(choices[0]) : null);
  const selected = choices.find((c) => keyOf(c) === selectedKey) ?? null;
  const acknowledged = !!selected && acknowledgedFor === selectedKey;
  const visible = showAll ? choices : choices.slice(0, SHOWN_AT_FIRST);

  const title =
    moveChoices.data?.appointment.entryTitle ??
    (target.kind === "assign" ? target.entryTitle : "Appointment");
  const challengeLabel =
    moveChoices.data?.appointment.challengeLabel ??
    (target.kind === "assign" ? target.challengeLabel : "");
  const current = moveChoices.data?.appointment;

  function confirm() {
    if (!selected) return;
    const destination = {
      hackathonId,
      roomId: selected.roomId,
      startsAt: selected.startsAt,
      acknowledgeReducedBreaks: acknowledged,
    };
    if (target.kind === "move" && current) {
      move.mutate({
        ...destination,
        appointmentId: target.appointmentId,
        revision: current.revision,
      });
    } else if (target.kind === "assign") {
      assign.mutate({
        ...destination,
        entryId: target.entryId,
        challengeId: target.challengeId,
      });
    }
  }

  return (
    <ModalWrapper
      onClose={() => {
        if (!pending) onClose();
      }}
      maxWidth="lg"
      label={moving ? "Move appointment" : "Book an appointment"}
    >
      <div className="space-y-6">
        <div>
          <p className={label}>
            {moving ? "Move appointment" : "Book an appointment"}
          </p>
          <h2 className={`${itemTitle} mt-1 break-words`}>{title}</h2>
          <p className={`mt-1 ${meta}`}>
            {[
              challengeLabel,
              current
                ? `now ${current.roomName}, ${slotTime(current.startsAt, windowStart)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {choicesQuery.isLoading ? (
          <p className={body} role="status">
            Finding open slots…
          </p>
        ) : choicesQuery.error ? (
          <ErrorLine>
            {trpcErrorMessage(choicesQuery.error, "Could not load open slots.")}
          </ErrorLine>
        ) : choices.length === 0 ? (
          <p className={body}>
            No open slot at a staffed room or table. Only those with a judge
            seen in the last 15 minutes are offered; seat a judge at a{" "}
            {challengeLabel} room or table, then try again.
          </p>
        ) : (
          <fieldset>
            <legend className={`${label} mb-2`}>
              {plural(choices.length, "open slot")}, best first
            </legend>
            <ul className="border-t border-[var(--border-subtle)]">
              {visible.map((choice, i) => {
                const key = keyOf(choice);
                return (
                  <li
                    key={key}
                    className="border-b border-[var(--border-subtle)]"
                  >
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                      <input
                        type="radio"
                        name="schedule-choice"
                        value={key}
                        checked={key === selectedKey}
                        onChange={() => {
                          move.reset();
                          assign.reset();
                          setPicked(key);
                        }}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-3">
                          <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                            {slotTime(choice.startsAt, windowStart)} to{" "}
                            {clock(choice.endsAt)}
                          </span>
                          {i === 0 && (
                            <span className="text-[13px] font-semibold text-accent">
                              Suggested
                            </span>
                          )}
                        </span>
                        <span className={`block truncate ${meta}`}>
                          {[choice.roomName, choice.buildingName]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {choice.reducedBreaks > 0 && (
                          <span className={`mt-1 ${status("warning")}`}>
                            Cuts{" "}
                            {plural(choice.reducedBreaks, "building change")} to
                            the {sameBuildingBreakMinutes}-minute break
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {choices.length > visible.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`${textLink} mt-3`}
              >
                Show all {choices.length}
              </button>
            )}
          </fieldset>
        )}

        {selected && selected.reducedBreaks > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) =>
                setAcknowledgedFor(e.target.checked ? selectedKey : null)
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Book it with the shorter break
          </label>
        )}

        {saveError && (
          <ErrorLine>
            {trpcErrorMessage(saveError, "Could not book that slot.")}
          </ErrorLine>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={confirm}
            disabled={
              readOnly ||
              pending ||
              !selected ||
              (selected.reducedBreaks > 0 && !acknowledged)
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {pending ? "Saving…" : moving ? "Move here" : "Book here"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
