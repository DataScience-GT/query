"use client";

import type { ReactNode } from "react";
import { meta } from "@/components/portal/ui";
import { slotTime } from "./format";

export type BoardRoom = {
  id: string;
  name: string;
  buildingName: string | null;
  challengeLabel: string;
};

export type BoardRow = {
  key: string;
  roomId: string;
  startsAt: Date;
  entryTitle: string;
  challengeLabel: string;
};

/**
 * Appointments grouped by room or table, each in time order. Two columns on a
 * wide screen, one list on a phone. Used for the preview and the live board.
 */
export function RoomBoard<R extends BoardRow>({
  rooms,
  rows,
  windowStart,
  hideEmpty = false,
  roomDetail,
  rowDetail,
}: {
  rooms: BoardRoom[];
  rows: R[];
  windowStart: Date;
  /** Leave out rooms with nothing in `rows`, as when a filter is on. */
  hideEmpty?: boolean;
  roomDetail?: (room: BoardRoom) => ReactNode;
  rowDetail?: (row: R) => ReactNode;
}) {
  const byRoom = new Map<string, R[]>();
  for (const row of rows) {
    const list = byRoom.get(row.roomId);
    if (list) list.push(row);
    else byRoom.set(row.roomId, [row]);
  }

  return (
    <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
      {rooms.map((room) => {
        const booked = (byRoom.get(room.id) ?? []).sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
        );
        if (hideEmpty && booked.length === 0) return null;
        return (
          <section key={room.id} aria-label={room.name} className="min-w-0">
            <div className="border-b border-[var(--border-medium)] pb-2">
              <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">
                {room.name}
              </h4>
              <p className={`${meta} truncate`}>
                {[room.buildingName ?? "No building", room.challengeLabel].join(
                  " · ",
                )}
              </p>
              {roomDetail?.(room)}
            </div>
            {booked.length === 0 ? (
              <p className={`py-3 ${meta}`}>Nothing booked here.</p>
            ) : (
              <ul>
                {booked.map((row) => (
                  <li
                    key={row.key}
                    className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--border-subtle)] py-2.5"
                  >
                    <span className="text-[13px] leading-6 tabular-nums text-[var(--text-secondary)]">
                      {slotTime(row.startsAt, windowStart)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-6 text-[var(--text-primary)]">
                        {row.entryTitle}
                      </p>
                      <p className={`${meta} truncate`}>{row.challengeLabel}</p>
                      {rowDetail?.(row)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
