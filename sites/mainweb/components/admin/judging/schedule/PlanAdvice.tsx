"use client";

import { useState } from "react";
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
  const addRoom = trpc.judging.admin.createRoom.useMutation();
  const [adding, setAdding] = useState(false);
  const pending = archive.isPending || addTables.isPending || adding;
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
      void addRooms(action.rooms);
    }
  };

  // One at a time, stopping at the first that fails; what was added still
  // changes the preview.
  async function addRooms(
    rooms: { challengeId: string; buildingId: string; name: string }[],
  ) {
    setAdding(true);
    addRoom.reset();
    let added = 0;
    try {
      for (const room of rooms) {
        await addRoom.mutateAsync({ hackathonId, kind: "room", ...room });
        added += 1;
      }
    } catch {
      // Shown from addRoom.error.
    }
    setAdding(false);
    if (added > 0) onChanged();
  }

  const buttonLabel = !action
    ? null
    : action.type === "archiveTables"
      ? `Archive ${plural(action.roomIds.length, "table")}`
      : action.type === "addTables"
        ? `Add ${plural(action.count, "table")}`
        : action.rooms.length === 1
          ? "Add room"
          : `Add ${action.rooms.length} rooms`;

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
      {action?.type === "addRooms" && (
        <p className={meta}>
          {action.rooms.length === 1 ? "It will be called " : "They will be called "}
          {action.rooms.map((r) => r.name).join(", ")}.
        </p>
      )}
      {error && (
        <ErrorLine>
          {trpcErrorMessage(error, "Could not make that change.")}
        </ErrorLine>
      )}
    </li>
  );
}
