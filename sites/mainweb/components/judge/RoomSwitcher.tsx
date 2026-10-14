"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  btnSecondary,
  label,
  meta,
  sectionRule,
  status,
  textLink,
} from "@/components/portal/ui";
import { roomPlace } from "./desk";

/**
 * Where a member judge says they are sitting. Organisers schedule by room, so
 * the seat decides which presentations come first and whether a timed
 * evaluation can start.
 */
export function RoomSwitcher({
  hackathonId,
  onDone,
}: {
  hackathonId: string;
  /** After a move, with whether the judge changed rooms at all. */
  onDone: (moved: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const rooms = trpc.judging.desk.rooms.useQuery({ hackathonId });

  const settle = async () => {
    await Promise.all([
      utils.judging.desk.context.invalidate({ hackathonId }),
      utils.judging.desk.rooms.invalidate({ hackathonId }),
      utils.judging.desk.projects.invalidate({ hackathonId }),
      utils.judging.desk.announcements.invalidate({ hackathonId }),
    ]);
    onDone(true);
  };
  const onError = (e: Parameters<typeof trpcErrorMessage>[0]) =>
    setError(trpcErrorMessage(e, "The move did not go through. Try again."));

  const join = trpc.judging.desk.joinRoom.useMutation({
    onSuccess: settle,
    onError,
  });
  const leave = trpc.judging.desk.leaveRoom.useMutation({
    onSuccess: settle,
    onError,
  });
  const busy = join.isPending || leave.isPending;
  const current = rooms.data?.currentRoomId ?? null;
  const currentKind =
    rooms.data?.rooms.find((room) => room.id === current)?.kind ?? "room";

  return (
    <section
      className={`mt-6 ${sectionRule}`}
      aria-label="Pick your room or table"
    >
      <h2 className={label}>Pick the room or table you are at</h2>

      {rooms.isPending ? (
        <p role="status" className={`mt-3 ${meta}`}>
          Loading rooms and tables…
        </p>
      ) : rooms.error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {trpcErrorMessage(rooms.error, "Rooms and tables did not load.")}{" "}
          Close this and try again.
        </p>
      ) : rooms.data.rooms.length === 0 ? (
        <p className={`mt-3 ${meta}`}>
          Organisers have not opened any rooms or tables yet. You can still
          judge projects without one.
        </p>
      ) : (
        <ul className="mt-3 border-t border-[var(--border-subtle)]">
          {rooms.data.rooms.map((room) => {
            const here = room.id === current;
            return (
              <li
                key={room.id}
                className="border-b border-[var(--border-subtle)]"
              >
                <button
                  type="button"
                  disabled={busy || here}
                  onClick={() => {
                    setError(null);
                    join.mutate({ hackathonId, roomId: room.id });
                  }}
                  className="flex w-full min-h-11 items-center gap-4 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--text-primary)]">
                      {roomPlace(room.name, room.buildingName)}
                    </span>
                    <span className={`block ${meta}`}>
                      {room.challengeLabel}
                    </span>
                  </span>
                  {here && (
                    <span className={status("accent")}>You are here</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {current && (
          <button
            type="button"
            className={`${btnSecondary} min-h-11`}
            disabled={busy}
            onClick={() => {
              setError(null);
              leave.mutate({ hackathonId });
            }}
          >
            {leave.isPending ? "Leaving…" : `Leave this ${currentKind}`}
          </button>
        )}
        <button
          type="button"
          className={`${textLink} min-h-11`}
          onClick={() => onDone(false)}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
