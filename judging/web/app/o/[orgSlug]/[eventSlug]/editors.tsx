"use client";

import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { apiBase } from "../../../../lib/api";

type Spot = { number: number; zoneId: string | null; x: number | null; y: number | null };
type JudgeRow = { id: string; name: string; email: string; status: string };

function readValue(event: { target: EventTarget | null }) {
  const target = event.target;
  if (target && "value" in target) return String(target.value);
  return "";
}

function placeOf(spot: Spot) {
  return {
    x: spot.x ?? (spot.number % 8) * 76,
    y: spot.y ?? Math.floor((spot.number - 1) / 8) * 68,
  };
}

export function Editors({
  eventId,
  token,
  onMessage,
}: {
  eventId: string;
  token: string;
  onMessage: (message: string) => void;
}) {
  const [rubricName, setRubricName] = useState("");
  const [criterionLabel, setCriterionLabel] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [trackId, setTrackId] = useState("");
  const [prizeTitle, setPrizeTitle] = useState("");
  const [judgeEmail, setJudgeEmail] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [tables, setTables] = useState<Spot[]>([]);
  const [judges, setJudges] = useState<JudgeRow[]>([]);
  const [drag, setDrag] = useState<{ number: number; dx: number; dy: number } | null>(null);

  async function post(path: string, body: unknown) {
    const response = await fetch(`${apiBase}/trpc/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "Request failed");
    }
  }

  function moveTable(pointer: PointerEvent<HTMLButtonElement>, spot: Spot) {
    if (!drag || drag.number !== spot.number) return;
    const parent = pointer.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const x = Math.max(0, Math.round(pointer.clientX - rect.left - drag.dx));
    const y = Math.max(0, Math.round(pointer.clientY - rect.top - drag.dy));
    setTables((current) =>
      current.map((item) => (item.number === spot.number ? { ...item, x, y } : item)),
    );
  }

  return (
    <section>
      <h2>Rubric</h2>
      <label>
        Rubric name
        <input value={rubricName} onChange={(change) => setRubricName(readValue(change))} style={field} />
      </label>
      <label>
        Criterion
        <input
          value={criterionLabel}
          onChange={(change) => setCriterionLabel(readValue(change))}
          style={field}
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          const label = criterionLabel.trim();
          if (!rubricName.trim() || !label) return;
          try {
            await post("catalog.saveRubric", {
              eventId,
              name: rubricName.trim(),
              isDefault: false,
              criteria: [{ key: label.toLowerCase().replace(/\s+/g, "-"), label, min: 0, max: 10, weight: 1 }],
            });
            onMessage(`Rubric ${rubricName.trim()} saved.`);
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Rubric was not saved");
          }
        }}
      >
        Save rubric
      </button>

      <h2>Zone and floor</h2>
      <label>
        Zone name
        <input value={zoneName} onChange={(change) => setZoneName(readValue(change))} style={field} />
      </label>
      <button
        type="button"
        onClick={async () => {
          if (!zoneName.trim()) return;
          try {
            await post("catalog.saveZone", { eventId, name: zoneName.trim(), position: 0 });
            onMessage(`Zone ${zoneName.trim()} saved.`);
            setZoneName("");
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Zone was not saved");
          }
        }}
      >
        Save zone
      </button>
      <button
        type="button"
        style={{ marginLeft: "0.5rem" }}
        onClick={async () => {
          const response = await fetch(`${apiBase}/v1/catalog/tables?eventId=${eventId}`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            onMessage("Could not load the floor.");
            return;
          }
          setTables((await response.json()) as Spot[]);
        }}
      >
        Load floor
      </button>
      <div style={floor}>
        {tables.map((spot) => {
          const at = placeOf(spot);
          return (
            <button
              key={spot.number}
              type="button"
              style={{ ...chip, left: at.x, top: at.y }}
              onPointerDown={(pointer) => {
                const parent = pointer.currentTarget.parentElement;
                if (!parent) return;
                const rect = parent.getBoundingClientRect();
                setDrag({
                  number: spot.number,
                  dx: pointer.clientX - rect.left - at.x,
                  dy: pointer.clientY - rect.top - at.y,
                });
                pointer.currentTarget.setPointerCapture(pointer.pointerId);
              }}
              onPointerMove={(pointer) => moveTable(pointer, spot)}
              onPointerUp={async (pointer) => {
                if (!drag || drag.number !== spot.number) return;
                const parent = pointer.currentTarget.parentElement;
                setDrag(null);
                if (!parent) return;
                const rect = parent.getBoundingClientRect();
                const x = Math.max(0, Math.round(pointer.clientX - rect.left - drag.dx));
                const y = Math.max(0, Math.round(pointer.clientY - rect.top - drag.dy));
                setTables((current) =>
                  current.map((item) => (item.number === spot.number ? { ...item, x, y } : item)),
                );
                try {
                  await post("catalog.placeTable", {
                    eventId,
                    number: spot.number,
                    zoneId: spot.zoneId,
                    x,
                    y,
                  });
                  onMessage(`Table ${spot.number} is at ${x}, ${y}.`);
                } catch (error) {
                  onMessage(error instanceof Error ? error.message : "Table was not moved");
                }
              }}
            >
              {spot.number}
            </button>
          );
        })}
      </div>

      <h2>Prize</h2>
      <label>
        Track id
        <input value={trackId} onChange={(change) => setTrackId(readValue(change))} style={field} />
      </label>
      <label>
        Prize title
        <input value={prizeTitle} onChange={(change) => setPrizeTitle(readValue(change))} style={field} />
      </label>
      <button
        type="button"
        onClick={async () => {
          if (!trackId.trim() || !prizeTitle.trim()) return;
          try {
            await post("catalog.savePrize", {
              trackId: trackId.trim(),
              place: 1,
              title: prizeTitle.trim(),
              amount: null,
            });
            onMessage(`Prize ${prizeTitle.trim()} saved.`);
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Prize was not saved");
          }
        }}
      >
        Save prize
      </button>

      <h2>Judges</h2>
      <label>
        Email
        <input value={judgeEmail} onChange={(change) => setJudgeEmail(readValue(change))} style={field} />
      </label>
      <label>
        Name
        <input value={judgeName} onChange={(change) => setJudgeName(readValue(change))} style={field} />
      </label>
      <button
        type="button"
        onClick={async () => {
          if (!judgeEmail.trim() || !judgeName.trim()) return;
          try {
            await post("judge.upsert", {
              eventId,
              email: judgeEmail.trim(),
              name: judgeName.trim(),
              externalId: null,
            });
            onMessage(`${judgeName.trim()} invited.`);
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Judge was not invited");
          }
        }}
      >
        Invite judge
      </button>
      <button
        type="button"
        style={{ marginLeft: "0.5rem" }}
        onClick={async () => {
          const response = await fetch(`${apiBase}/v1/catalog/judges?eventId=${eventId}`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            onMessage("Could not load judges.");
            return;
          }
          setJudges((await response.json()) as JudgeRow[]);
        }}
      >
        Load judges
      </button>
      <ul>
        {judges.map((person) => (
          <li key={person.id}>
            {person.name} · {person.status}{" "}
            <button
              type="button"
              onClick={async () => {
                try {
                  await post("judge.setStatus", {
                    eventId,
                    judgeId: person.id,
                    status: person.status === "approved" ? "suspended" : "approved",
                  });
                  setJudges((current) =>
                    current.map((item) =>
                      item.id === person.id
                        ? { ...item, status: item.status === "approved" ? "suspended" : "approved" }
                        : item,
                    ),
                  );
                } catch (error) {
                  onMessage(error instanceof Error ? error.message : "Status was not changed");
                }
              }}
            >
              {person.status === "approved" ? "Suspend" : "Approve"}
            </button>
          </li>
        ))}
      </ul>

      <h2>Withdraw a project</h2>
      <label>
        Project id
        <input value={projectId} onChange={(change) => setProjectId(readValue(change))} style={field} />
      </label>
      <button
        type="button"
        onClick={async () => {
          if (!projectId.trim()) return;
          try {
            await post("project.withdraw", { eventId, projectId: projectId.trim() });
            onMessage("Project withdrawn.");
            setProjectId("");
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Project was not withdrawn");
          }
        }}
      >
        Withdraw
      </button>
    </section>
  );
}

const field: CSSProperties = { display: "block", width: "100%", margin: "0.25rem 0 0.75rem" };

const floor: CSSProperties = {
  position: "relative",
  height: 420,
  margin: "1rem 0",
  background: "#f5f5f4",
  border: "1px solid #d6d3d1",
};

const chip: CSSProperties = {
  position: "absolute",
  width: 64,
  height: 48,
  background: "white",
  border: "1px solid #1c1917",
};
