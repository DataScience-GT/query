"use client";

import { useEffect, useState } from "react";
import { apiBase } from "../../../../lib/api";
import type { PublicEvent } from "../../../../lib/api";
import { Editors } from "./editors";

const phases = [
  "setup",
  "submissions_open",
  "submissions_closed",
  "judging_live",
  "judging_closed",
  "published",
  "archived",
] as const;

export function Console({ event, ticket }: { event: PublicEvent; ticket?: string }) {
  const [token, setToken] = useState(ticket ?? "");
  const [message, setMessage] = useState(event.phase);
  const [floor, setFloor] = useState<{
    tables: { tableNumber: number | null; looks: number }[];
    judges: { name: string; state: string; overtime: boolean; tableNumber: number | null }[];
  } | null>(null);
  const [cards, setCards] = useState<
    { id: string; name: string; tableNumber: number | null; zoneName: string | null }[]
  >([]);
  const [logs, setLogs] = useState<{ id: string; kind: string }[]>([]);
  const [runId, setRunId] = useState("");
  const [inspected, setInspected] = useState<
    {
      projectId: string;
      projectName: string;
      trackId: string;
      placement: number | null;
      score: number;
      rubricComponent: number;
      pairwiseComponent: number;
    }[]
  >([]);
  const [trackName, setTrackName] = useState("");
  const [judgeId, setJudgeId] = useState("");

  async function post(path: string, body: unknown) {
    const response = await fetch(`${apiBase}/trpc/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      error?: { message?: string };
      result?: { data?: { runId?: string; assigned?: number } };
    };
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "Request failed");
    }
    return payload.result?.data;
  }

  useEffect(() => {
    if (!token) return;
    let stop = false;
    const pull = async () => {
      const response = await fetch(`${apiBase}/v1/floor/${event.eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok || stop) return;
      setFloor(
        (await response.json()) as {
          tables: { tableNumber: number | null; looks: number }[];
          judges: { name: string; state: string; overtime: boolean; tableNumber: number | null }[];
        },
      );
    };
    void pull();
    const timer = setInterval(() => void pull(), 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token, event.eventId]);

  return (
    <main style={{ maxWidth: 40 * 16, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>{event.name}</h1>
      <p>Current phase: {message}</p>
      {floor ? (
        <section>
          <h2>Floor</h2>
          <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", padding: 0, listStyle: "none" }}>
            {floor.tables.map((table) => (
              <li
                key={table.tableNumber ?? "none"}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: `hsl(24 40% ${Math.max(42, 92 - table.looks * 8)}%)`,
                }}
              >
                {table.tableNumber}: {table.looks}
              </li>
            ))}
          </ul>
          <ul>
            {floor.judges.map((person) => (
              <li key={person.name}>
                {person.name}: {person.state}
                {person.tableNumber !== null ? ` · table ${person.tableNumber}` : ""}
                {person.overtime ? " · overtime" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <label>
        Organizer token
        <input
          value={token}
          onChange={(change) => {
            const target = change.target;
            setToken(target && "value" in target ? String(target.value) : "");
          }}
          style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem" }}
        />
      </label>
      {phases.map((phase) => (
        <button
          key={phase}
          type="button"
          style={{ margin: "0.25rem" }}
          onClick={async () => {
            try {
              await post("event.setPhase", { eventId: event.eventId, phase });
              setMessage(phase);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Phase was not changed");
            }
          }}
        >
          {phase}
        </button>
      ))}
      <button
        type="button"
        style={{ display: "block", marginTop: "1rem" }}
        onClick={async () => {
          try {
            const computed = await post("results.compute", { eventId: event.eventId });
            setRunId(computed?.runId ?? "");
            setMessage(computed?.runId ? `Results computed. Run ${computed.runId}` : "Results computed.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Compute failed");
          }
        }}
      >
        Compute results
      </button>
      <button
        type="button"
        style={{ display: "block", marginTop: "0.5rem" }}
        onClick={async () => {
          try {
            await post("results.publish", { eventId: event.eventId, runId });
            setMessage("Published.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Publish failed");
          }
        }}
      >
        Publish
      </button>
      <button
        type="button"
        style={{ display: "block", marginTop: "0.5rem" }}
        onClick={async () => {
          if (!runId) {
            setMessage("Compute a run first.");
            return;
          }
          const response = await fetch(`${apiBase}/v1/results/run/${runId}`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            setMessage("Could not load that run.");
            return;
          }
          setInspected(
            (await response.json()) as {
              projectId: string;
              projectName: string;
              trackId: string;
              placement: number | null;
              score: number;
              rubricComponent: number;
              pairwiseComponent: number;
            }[],
          );
        }}
      >
        Inspect run
      </button>
      {inspected.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Project</th>
              <th>Score</th>
              <th>Rubric</th>
              <th>Pairwise</th>
            </tr>
          </thead>
          <tbody>
            {inspected.map((row) => (
              <tr key={`${row.projectId}-${row.trackId}`}>
                <td>{row.placement}</td>
                <td>{row.projectName}</td>
                <td>{row.score}</td>
                <td>{row.rubricComponent}</td>
                <td>{row.pairwiseComponent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button
        type="button"
        style={{ display: "block", marginTop: "0.5rem" }}
        onClick={async () => {
          try {
            await post("results.unpublish", { eventId: event.eventId });
            setMessage("Unpublished. The event is back to judging closed.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unpublish failed");
          }
        }}
      >
        Unpublish
      </button>
      <button
        type="button"
        style={{ display: "block", marginTop: "0.5rem" }}
        onClick={async () => {
          try {
            const assigned = await post("project.assignTables", { eventId: event.eventId });
            setMessage(
              assigned?.assigned !== undefined
                ? `Seated ${assigned.assigned} projects.`
                : "Tables assigned.",
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not assign tables");
          }
        }}
      >
        Assign tables by track
      </button>
      <label style={{ display: "block", marginTop: "1rem" }}>
        New track name
        <input
          value={trackName}
          onChange={(change) => {
            const target = change.target;
            setTrackName(target && "value" in target ? String(target.value) : "");
          }}
          style={{ display: "block", width: "100%", margin: "0.5rem 0" }}
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          const slug = trackName.trim().toLowerCase().replace(/\s+/g, "-");
          if (!slug) return;
          try {
            await post("catalog.saveTrack", {
              eventId: event.eventId,
              slug,
              name: trackName.trim(),
              kind: "special",
              judgeGroup: slug,
            });
            setMessage(`Track ${trackName.trim()} saved.`);
            setTrackName("");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Track was not saved");
          }
        }}
      >
        Save track
      </button>
      <label style={{ display: "block", marginTop: "1rem" }}>
        Judge id to recall
        <input
          value={judgeId}
          onChange={(change) => {
            const target = change.target;
            setJudgeId(target && "value" in target ? String(target.value) : "");
          }}
          style={{ display: "block", width: "100%", margin: "0.5rem 0" }}
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          try {
            await post("judge.recall", { eventId: event.eventId, judgeId });
            setMessage("Judge recalled.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Recall failed");
          }
        }}
      >
        Recall judge
      </button>
      <button
        type="button"
        style={{ display: "block", marginTop: "1rem" }}
        onClick={async () => {
          const response = await fetch(
            `${apiBase}/v1/catalog/projects?eventId=${event.eventId}`,
            { headers: { authorization: `Bearer ${token}` } },
          );
          if (!response.ok) {
            setMessage("Could not load table cards.");
            return;
          }
          setCards(
            (await response.json()) as {
              id: string;
              name: string;
              tableNumber: number | null;
              zoneName: string | null;
            }[],
          );
        }}
      >
        Table cards
      </button>
      <button
        type="button"
        style={{ marginRight: "0.5rem" }}
        onClick={async () => {
          try {
            await post("catalog.saveConfig", {
              eventId: event.eventId,
              hardLimitSeconds: 240,
              dispatchStrategy: "uncertainty",
              pairwiseEnabled: true,
              pairwiseWeight: 0,
              leaderboardPublic: true,
              boardPollSeconds: 5,
            });
            setMessage("Dispatch is uncertainty. The public board is on.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Config was not saved");
          }
        }}
      >
        Uncertainty dispatch
      </button>
      <button
        type="button"
        onClick={async () => {
          const response = await fetch(
            `${apiBase}/v1/catalog/logs?eventId=${event.eventId}`,
            { headers: { authorization: `Bearer ${token}` } },
          );
          if (!response.ok) {
            setMessage("Could not load the log.");
            return;
          }
          setLogs((await response.json()) as { id: string; kind: string }[]);
        }}
      >
        Event log
      </button>
      <ul>
        {logs.map((row) => (
          <li key={row.id}>{row.kind}</li>
        ))}
      </ul>
      <Editors eventId={event.eventId} token={token} onMessage={setMessage} />
      <section>
        {cards
          .slice()
          .sort(
            (a, b) =>
              (a.zoneName ?? "").localeCompare(b.zoneName ?? "") ||
              (a.tableNumber ?? 0) - (b.tableNumber ?? 0),
          )
          .map((card, index, all) => {
            const zoneLabel = card.zoneName ?? "Unzoned";
            const previous = all[index - 1];
            const showZone = !previous || (previous.zoneName ?? "Unzoned") !== zoneLabel;
            return (
              <article key={card.id} style={{ breakAfter: "page", padding: "2rem 0", borderBottom: "1px solid #ccc" }}>
                {showZone ? <p>{zoneLabel}</p> : null}
                <p style={{ fontSize: "4rem", margin: 0 }}>{card.tableNumber}</p>
                <h2>{card.name}</h2>
              </article>
            );
          })}
      </section>
    </main>
  );
}
