"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { btnSecondary, sectionRule, textLink } from "@/components/portal/ui";
import {
  deskLabel,
  deskMeta,
  deskStatus,
  roomPlace,
  stationGroups,
} from "./desk";

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
  // Shown beside the control that failed: Leave sits below a long list.
  const [error, setError] = useState<{
    from: "join" | "leave";
    text: string;
  } | null>(null);
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
  const onError =
    (from: "join" | "leave") => (e: Parameters<typeof trpcErrorMessage>[0]) =>
      setError({
        from,
        text: trpcErrorMessage(e, "The move did not go through. Try again."),
      });

  const join = trpc.judging.desk.joinRoom.useMutation({
    onSuccess: settle,
    onError: onError("join"),
  });
  const leave = trpc.judging.desk.leaveRoom.useMutation({
    onSuccess: settle,
    onError: onError("leave"),
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
      <h2 className={deskLabel}>Pick the room or table you are at</h2>

      {/* Above the list: a long one pushes it off a phone's screen. */}
      <div className="mt-2">
        <button
          type="button"
          className={`${textLink} min-h-11`}
          onClick={() => onDone(false)}
        >
          Cancel
        </button>
      </div>

      {error?.from === "join" && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {error.text}
        </p>
      )}

      {rooms.isPending ? (
        <p role="status" className={`mt-3 ${deskMeta}`}>
          Loading rooms and tables…
        </p>
      ) : rooms.error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {trpcErrorMessage(rooms.error, "Rooms and tables did not load.")}{" "}
          Close this and try again.
        </p>
      ) : rooms.data.rooms.length === 0 ? (
        <p className={`mt-3 ${deskMeta}`}>
          Organisers have not opened any rooms or tables yet. You can still
          judge projects without one.
        </p>
      ) : (
        stationGroups(rooms.data.rooms).map((group) => (
          <div key={group.heading ?? "first"} className="mt-8">
            {group.heading && (
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                {group.heading}
              </h3>
            )}
            <ul className="mt-2 border-t border-[var(--border-subtle)]">
              {group.stations.map((room) => {
                const here = room.id === current;
                const content = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[var(--text-primary)]">
                        {group.heading === room.buildingName
                          ? room.name
                          : roomPlace(room.name, room.buildingName)}
                      </span>
                      <span className={`block ${deskMeta}`}>
                        {room.challengeLabel}
                      </span>
                    </span>
                    {here && (
                      <span className={`shrink-0 ${deskStatus("accent")}`}>
                        You are here
                      </span>
                    )}
                  </>
                );
                return (
                  <li
                    key={room.id}
                    className="border-b border-[var(--border-subtle)]"
                  >
                    {/* Not a disabled button: that fades the row that says where you are. */}
                    {here ? (
                      <div
                        aria-current="true"
                        className="flex w-full min-h-11 items-center gap-4 py-3"
                      >
                        {content}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          join.mutate({ hackathonId, roomId: room.id });
                        }}
                        className="flex w-full min-h-11 items-center gap-4 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      {current && (
        <div className="mt-8">
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
          {error?.from === "leave" && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {error.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
