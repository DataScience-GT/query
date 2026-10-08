"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { apiBase } from "@/lib/panel";
import type { PublicEvent } from "@/lib/panel";
import { flushHeld, holdVote } from "@/lib/panel-held";

type Visit = {
  done: boolean;
  reused?: boolean;
  visitId?: string;
  projectName?: string;
  tableNumber?: number | null;
  arrivedAt?: string | null;
  handedOutAt?: string;
};

type Anchor = { label?: string; value?: number };
type CriterionRow = {
  id: string;
  label: string;
  min: number;
  max: number;
  anchors?: Anchor[];
};

export function JudgeDesk({
  event,
  name,
}: {
  event: PublicEvent;
  name: string;
}) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tableNumber, setTableNumber] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const accent = event.branding.colors?.accent ?? "#1c1917";

  async function loadProgress() {
    const response = await fetch(
      `${apiBase}/v1/session/progress?eventId=${event.eventId}`,
    );
    if (!response.ok) return;
    const row = (await response.json()) as { completed: number; total: number };
    setProgress(`${row.completed} of ${row.total} scored`);
  }

  useEffect(() => {
    void fetch(`${apiBase}/v1/session/rubric?eventId=${event.eventId}`)
      .then((response) => response.json())
      .then(async (rows: CriterionRow[]) => {
        if (!Array.isArray(rows)) {
          setMessage("You are not an approved judge for this event yet.");
          return;
        }
        setCriteria(rows);
        await loadProgress();
      })
      .catch(() => setMessage("Could not load the rubric."));
    // loadProgress only reads event.eventId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.eventId]);

  async function call(path: string, body?: unknown) {
    const response = await fetch(`${apiBase}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) throw new Error(payload.message ?? "Request failed");
    return payload;
  }

  async function compare(outcome: "a" | "b" | "tie") {
    try {
      await call("/v1/session/compare", { eventId: event.eventId, outcome });
      setMessage(
        outcome === "b"
          ? "This table is better."
          : outcome === "a"
            ? "The previous table was better."
            : "Recorded as about the same.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not compare");
    }
  }

  useEffect(() => {
    const send = () => {
      void flushHeld((path, payload) =>
        fetch(`${apiBase}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }).then((response) => {
          if (!response.ok) throw new Error("still offline");
        }),
      ).then((sent) => {
        if (sent > 0) {
          setMessage(
            `Sent ${sent} score${sent === 1 ? "" : "s"} held on this phone.`,
          );
        }
      });
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, []);

  const walkingSince =
    visit?.handedOutAt && !visit.arrivedAt && !visit.done
      ? new Date(visit.handedOutAt).getTime()
      : null;
  useEffect(() => {
    if (walkingSince === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [walkingSince]);
  const walkedSeconds =
    walkingSince === null
      ? 0
      : Math.max(0, Math.floor((now - walkingSince) / 1000));
  const elapsed =
    walkingSince === null
      ? ""
      : `${Math.floor(walkedSeconds / 60)}:${String(walkedSeconds % 60).padStart(2, "0")} walking`;

  return (
    <main
      style={{
        maxWidth: 28 * 16,
        margin: "0 auto",
        padding: "1.5rem 1rem 4rem",
      }}
    >
      <p
        style={{
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontSize: 12,
        }}
      >
        {event.orgName}
      </p>
      <h1 style={{ fontSize: "1.75rem", margin: "0.25rem 0" }}>{event.name}</h1>
      <p>{event.branding.tagline}</p>
      <p>Phase: {event.phase}</p>

      <section>
        <button
          style={button}
          type="button"
          onClick={async () => {
            try {
              await call("/v1/judges/apply", { eventId: event.eventId, name });
              setMessage(
                "Application sent. An organizer still has to approve it.",
              );
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Could not apply",
              );
            }
          }}
        >
          Apply to judge
        </button>
        <button
          style={{ ...button, background: accent }}
          type="button"
          onClick={async () => {
            try {
              const next = (await call("/v1/session/next", {
                eventId: event.eventId,
              })) as Visit;
              setVisit(next);
              await loadProgress();
              setMessage(next.done ? "No tables left." : "");
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Could not get a table",
              );
            }
          }}
        >
          Next table
        </button>
        {progress ? <p>{progress}</p> : null}
        {visit && !visit.done ? (
          <>
            <h2>
              {visit.projectName} · table {visit.tableNumber}
            </h2>
            {elapsed ? <p>{elapsed}</p> : null}
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", display: scanning ? "block" : "none" }}
            />
            <button
              style={button}
              type="button"
              onClick={async () => {
                const Detector = (
                  globalThis as {
                    BarcodeDetector?: new (options: { formats: string[] }) => {
                      detect: (
                        source: HTMLVideoElement,
                      ) => Promise<{ rawValue: string }[]>;
                    };
                  }
                ).BarcodeDetector;
                if (!Detector || !videoRef.current) {
                  setMessage(
                    "Type the table number. This browser has no QR detector.",
                  );
                  return;
                }
                setScanning(true);
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" },
                  });
                  videoRef.current.srcObject = stream;
                  await videoRef.current.play();
                  const codes = await new Detector({
                    formats: ["qr_code"],
                  }).detect(videoRef.current);
                  for (const track of stream.getTracks()) track.stop();
                  const value = codes[0]?.rawValue ?? "";
                  const token = value.match(
                    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
                  )?.[0];
                  if (!token) {
                    setMessage("No QR code in the frame.");
                    return;
                  }
                  await call("/v1/session/arrive", {
                    eventId: event.eventId,
                    qrToken: token,
                  });
                  setVisit({ ...visit, arrivedAt: new Date().toISOString() });
                  setMessage("Arrived.");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not scan",
                  );
                } finally {
                  setScanning(false);
                }
              }}
            >
              Scan table QR
            </button>
            <label>
              Table number
              <input
                value={tableNumber}
                onChange={(change) => setTableNumber(readValue(change))}
                style={field}
              />
            </label>
            <button
              style={button}
              type="button"
              onClick={async () => {
                try {
                  await call("/v1/session/arrive", {
                    eventId: event.eventId,
                    tableNumber: Number(tableNumber),
                  });
                  setVisit({ ...visit, arrivedAt: new Date().toISOString() });
                  setMessage("Arrived.");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not arrive",
                  );
                }
              }}
            >
              I'm here
            </button>
            {visit.arrivedAt ? (
              <>
                <p>Which table is stronger?</p>
                <button
                  style={button}
                  type="button"
                  onClick={() => void compare("b")}
                >
                  This table is better
                </button>
                <button
                  style={button}
                  type="button"
                  onClick={() => void compare("a")}
                >
                  The previous table was better
                </button>
                <button
                  style={button}
                  type="button"
                  onClick={() => void compare("tie")}
                >
                  About the same
                </button>
              </>
            ) : null}
            {criteria.map((item) => (
              <label key={item.id}>
                {item.label}
                <input
                  type="number"
                  min={item.min}
                  max={item.max}
                  value={scores[item.id] ?? ""}
                  onChange={(change) =>
                    setScores({
                      ...scores,
                      [item.id]: Number(readValue(change)),
                    })
                  }
                  style={field}
                />
                {(item.anchors ?? []).map((anchor) =>
                  typeof anchor.value === "number" ? (
                    <button
                      key={`${item.id}-${anchor.value}`}
                      style={button}
                      type="button"
                      onClick={() =>
                        setScores({
                          ...scores,
                          [item.id]: anchor.value as number,
                        })
                      }
                    >
                      {anchor.label ?? anchor.value}
                    </button>
                  ) : null,
                )}
              </label>
            ))}
            <button
              style={button}
              type="button"
              onClick={async () => {
                const body = {
                  eventId: event.eventId,
                  visitId: visit.visitId,
                  scores: criteria.map((item) => ({
                    criterionId: item.id,
                    value: scores[item.id] ?? item.min,
                  })),
                  comment: null,
                };
                try {
                  await call("/v1/session/vote", body);
                  setMessage("Score stored.");
                  setVisit(null);
                } catch (error) {
                  await holdVote(body);
                  setMessage(
                    error instanceof Error
                      ? `${error.message} Held on this phone until the network returns.`
                      : "Held on this phone until the network returns.",
                  );
                }
              }}
            >
              Submit score
            </button>
            <button
              style={button}
              type="button"
              onClick={async () => {
                if (!visit.visitId) return;
                try {
                  await call("/v1/session/skip", {
                    eventId: event.eventId,
                    visitId: visit.visitId,
                  });
                  setVisit(null);
                  setMessage(
                    "Passed. You will not be sent back to this table.",
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not pass",
                  );
                }
              }}
            >
              Pass on this table
            </button>
          </>
        ) : null}
      </section>
      {message ? <p>{message}</p> : null}
    </main>
  );
}

function readValue(event: { target: EventTarget | null }) {
  const target = event.target;
  if (target && "value" in target) return String(target.value);
  return "";
}

const field: CSSProperties = {
  display: "block",
  width: "100%",
  margin: "0.25rem 0 0.75rem",
  padding: "0.75rem",
  fontSize: "1.1rem",
};

const button: CSSProperties = {
  display: "block",
  width: "100%",
  margin: "0.5rem 0",
  padding: "0.9rem",
  color: "white",
  background: "#1c1917",
  border: 0,
  fontSize: "1rem",
};
