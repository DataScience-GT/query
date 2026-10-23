"use client";

import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { btnSecondary, label, meta, body } from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import type { SolvedPreview } from "./format";

type Advice = SolvedPreview["advice"][number];

/**
 * What the organiser could change to improve a preview, each with a button
 * that does it. `onChanged` runs after one has, so the preview can be solved
 * again with the new rooms.
 */
export function PlanAdvice({
  hackathonId,
  advice,
  onChanged,
}: {
  hackathonId: string;
  advice: Advice[];
  onChanged: () => void;
}) {
  if (advice.length === 0) return null;
  return (
    <div className="max-w-3xl space-y-3">
      <h3 className={label}>Ways to improve this schedule</h3>
      <ul className="border-t border-[var(--border-subtle)]">
        {advice.map((a) => (
          <AdviceItem
            key={a.message}
            hackathonId={hackathonId}
            advice={a}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

function AdviceItem({
  hackathonId,
  advice,
  onChanged,
}: {
  hackathonId: string;
  advice: Advice;
  onChanged: () => void;
}) {
  const readOnly = useReadOnly();
  const archive = trpc.judging.admin.archiveRooms.useMutation({
    onSuccess: onChanged,
  });
  const addTables = trpc.judging.admin.createTables.useMutation({
    onSuccess: onChanged,
  });
  const addRoom = trpc.judging.admin.createRoom.useMutation({
    onSuccess: onChanged,
  });
  const pending =
    archive.isPending || addTables.isPending || addRoom.isPending;
  const error = archive.error ?? addTables.error ?? addRoom.error;
  const { action } = advice;

  const run = () => {
    if (!action) return;
    if (action.type === "archiveTables") {
      archive.mutate({ hackathonId, roomIds: action.roomIds });
    } else if (action.type === "addTables") {
      addTables.mutate({
        hackathonId,
        challengeId: action.challengeId,
        buildingId: action.buildingId,
        count: action.count,
      });
    } else {
      addRoom.mutate({
        hackathonId,
        name: action.name,
        kind: "room",
        challengeId: action.challengeId,
        buildingId: action.buildingId,
      });
    }
  };

  const buttonLabel = !action
    ? null
    : action.type === "archiveTables"
      ? `Archive ${plural(action.roomIds.length, "table")}`
      : action.type === "addTables"
        ? `Add ${plural(action.count, "table")}`
        : "Add room";

  return (
    <li className="space-y-2 border-b border-[var(--border-subtle)] py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={`min-w-0 flex-1 basis-80 ${body}`}>{advice.message}</p>
        {buttonLabel && (
          <button
            type="button"
            onClick={run}
            disabled={readOnly || pending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            {pending ? "Working…" : buttonLabel}
          </button>
        )}
      </div>
      {action?.type === "addRoom" && (
        <p className={meta}>It will be called {action.name}.</p>
      )}
      {error && (
        <ErrorLine>
          {trpcErrorMessage(error, "Could not make that change.")}
        </ErrorLine>
      )}
    </li>
  );
}
