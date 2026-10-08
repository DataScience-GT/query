"use client";

import { useEffect, useState } from "react";
import { apiBase } from "../../../../lib/api";

type Snapshot = {
  eventId: string;
  phase: string;
  pollSeconds: number;
  projects: { id: string; tableNumber: number | null; looks: number }[];
  placements: { projectId: string; projectName?: string; placement: number | null }[];
  prizes: { title: string; place: number; track: string; amount: number | null }[];
};

export function LiveBoard({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    const pull = async () => {
      const response = await fetch(`${apiBase}/v1/live/${orgSlug}/${eventSlug}`);
      if (!response.ok || stop) return;
      const next = (await response.json()) as Snapshot;
      setSnapshot(next);
      if (!socket) {
        socket = new WebSocket(
          `${apiBase.replace(/^http/, "ws")}/ws?channel=event:${next.eventId}:board`,
        );
        socket.onopen = () => setLive(true);
        socket.onclose = () => {
          setLive(false);
          socket = undefined;
        };
        socket.onmessage = () => {
          void pull();
        };
      }
      clearTimeout(timer);
      timer = setTimeout(() => void pull(), (next.pollSeconds || 5) * 1000);
    };

    void pull();
    return () => {
      stop = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [orgSlug, eventSlug]);

  if (!snapshot) return <p>Loading the floor.</p>;
  return (
    <section>
      <p>
        {live ? "Live" : "Polling"} · {snapshot.phase}
      </p>
      {(snapshot.prizes ?? []).length > 0 ? (
        <>
          <h2>Prizes</h2>
          <ul>
            {(snapshot.prizes ?? []).map((row) => (
              <li key={`${row.track}-${row.place}`}>
                {row.track}: {row.place}. {row.title}
                {row.amount !== null ? ` (${row.amount})` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {snapshot.phase === "published" ? (
        <ol>
          {snapshot.placements.map((row) => (
            <li key={`${row.projectId}-${row.placement}`}>
              {row.placement}. {row.projectName || row.projectId}
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {snapshot.projects.map((row) => (
            <li key={row.id}>
              Table {row.tableNumber}: {row.looks} looks
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
