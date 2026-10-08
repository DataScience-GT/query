"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/panel";

type Snapshot = {
  eventId: string;
  phase: string;
  pollSeconds: number;
  projects: { id: string; tableNumber: number | null; looks: number }[];
  placements: {
    projectId: string;
    projectName?: string;
    placement: number | null;
  }[];
  prizes: {
    title: string;
    place: number;
    track: string;
    amount: number | null;
  }[];
};

export function LiveBoard({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pull = async () => {
      clearTimeout(timer);
      const response = await fetch(
        `${apiBase}/v1/live/${orgSlug}/${eventSlug}`,
      );
      if (!response.ok || stop) return;
      const next = (await response.json()) as Snapshot;
      setSnapshot(next);
      // Only live judging changes minute to minute. Polling any other phase,
      // or a tab nobody is looking at, keeps the database awake for nothing:
      // Neon suspends only after five idle minutes, and those minutes are the
      // monthly compute allowance.
      if (
        next.phase === "judging_live" &&
        document.visibilityState === "visible"
      ) {
        timer = setTimeout(
          () => void pull(),
          Math.max(next.pollSeconds || 5, 5) * 1000,
        );
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };

    void pull();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orgSlug, eventSlug, reload]);

  if (!snapshot) return <p>Loading the floor.</p>;
  return (
    <section>
      <p>
        {snapshot.phase}
        {snapshot.phase === "judging_live" ? null : (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Refresh
            </button>
          </>
        )}
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
