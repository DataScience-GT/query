"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { ModalWrapper } from "@/components/portal/ModalWrapper";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
} from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import { slotTime } from "./format";

/**
 * Who grades one appointment: a select of the judges who may grade it there,
 * those already grading something else at that time left out of reach.
 */
export function JudgeDialog({
  hackathonId,
  appointmentId,
  windowStart,
  onClose,
}: {
  hackathonId: string;
  appointmentId: string;
  windowStart: Date;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [picked, setPicked] = useState<string | null>(null);

  const query = trpc.judging.schedule.judgeChoices.useQuery(
    { hackathonId, appointmentId },
    { retry: false },
  );
  const refresh = () => utils.judging.schedule.get.invalidate({ hackathonId });
  const save = trpc.judging.schedule.setAssignedJudge.useMutation({
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    // Someone else took the judge, or the presentation started: both the
    // board and the choices are out of date.
    onError: () => {
      void refresh();
      void query.refetch();
    },
  });

  const data = query.data;
  const current = data?.appointment.assignedJudgeId ?? "";
  const selected = picked ?? current;
  const choices = data?.choices ?? [];

  return (
    <ModalWrapper
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      maxWidth="lg"
      label="Choose a judge"
    >
      <div className="space-y-6">
        <div>
          <p className={label}>Choose a judge</p>
          <h2 className={`${itemTitle} mt-1 break-words`}>
            {data?.appointment.entryTitle ?? "Appointment"}
          </h2>
          {data && (
            <p className={`mt-1 ${meta}`}>
              {[
                data.appointment.challengeLabel,
                data.appointment.roomName,
                slotTime(data.appointment.startsAt, windowStart),
              ].join(" · ")}
            </p>
          )}
        </div>

        {query.isLoading ? (
          <p className={body} role="status">
            Finding judges…
          </p>
        ) : query.error ? (
          <ErrorLine>
            {trpcErrorMessage(query.error, "Could not load the judges.")}
          </ErrorLine>
        ) : (
          <div>
            <label htmlFor="judge-pick" className={fieldLabel}>
              Judge
            </label>
            <select
              id="judge-pick"
              value={selected}
              disabled={save.isPending || !data?.appointment.canAssignJudge}
              onChange={(e) => {
                save.reset();
                setPicked(e.target.value);
              }}
              className={input}
            >
              <option value="">No judge</option>
              {choices.map((choice) => (
                <option
                  key={choice.judgeId}
                  value={choice.judgeId}
                  disabled={choice.booked && choice.judgeId !== current}
                >
                  {choice.name}
                  {choice.kind === "guest" ? " (guest)" : ""} ·{" "}
                  {plural(choice.load, "presentation")}
                  {choice.booked
                    ? ` · grading ${choice.bookedWith ?? "another project"} then`
                    : ""}
                </option>
              ))}
            </select>
            {data && !data.appointment.canAssignJudge ? (
              <p className={`mt-2 ${meta}`}>
                This presentation has started, or a judge has begun on it, so
                its judge stays.
              </p>
            ) : choices.length === 0 ? (
              <p className={`mt-2 ${meta}`}>
                No judge can grade this yet. A guest grades only at their own
                room or table, and a table judge appears once they have joined.
              </p>
            ) : null}
          </div>
        )}

        {save.error && (
          <ErrorLine>
            {trpcErrorMessage(save.error, "Could not set the judge.")}
          </ErrorLine>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              save.mutate({
                hackathonId,
                appointmentId,
                judgeId: selected === "" ? null : selected,
              })
            }
            disabled={
              readOnly ||
              save.isPending ||
              !data?.appointment.canAssignJudge ||
              selected === current
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {save.isPending ? "Saving…" : "Save judge"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
