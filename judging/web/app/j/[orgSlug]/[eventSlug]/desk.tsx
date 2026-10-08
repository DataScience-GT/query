"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { apiBase } from "../../../../lib/api";
import type { PublicEvent } from "../../../../lib/api";
import { flushHeld, holdVote } from "../../../../lib/held";

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
type CriterionRow = { id: string; label: string; min: number; max: number; anchors?: Anchor[] };

export function JudgeDesk({
  orgSlug,
  event,
  ticket,
}: {
  orgSlug: string;
  event: PublicEvent;
  ticket?: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tableNumber, setTableNumber] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [judgeId, setJudgeId] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const accent = event.branding.colors?.accent ?? "#1c1917";

  useEffect(() => {
    if (!ticket) return;
    setToken(ticket);
    void fetch(`${apiBase}/v1/session/rubric?eventId=${event.eventId}`, {
      headers: { authorization: `Bearer ${ticket}` },
    })
      .then((response) => response.json())
      .then(async (rows: CriterionRow[]) => {
        if (!Array.isArray(rows)) {
          setMessage("The handoff ticket was not accepted.");
          return;
        }
        setCriteria(rows);
        const progressResponse = await fetch(
          `${apiBase}/v1/session/progress?eventId=${event.eventId}`,
          { headers: { authorization: `Bearer ${ticket}` } },
        );
        if (!progressResponse.ok) return;
        const row = (await progressResponse.json()) as {
          completed: number;
          total: number;
          judgeId?: string;
        };
        setProgress(`${row.completed} of ${row.total} scored`);
        if (row.judgeId) setJudgeId(row.judgeId);
      })
      .catch(() => setMessage("The handoff ticket was not accepted."));
  }, [ticket, event.eventId]);

  async function call(path: string, body?: unknown) {
    const response = await fetch(`${apiBase}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
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
    if (!token) return;
    const send = () => {
      void flushHeld((path, payload) =>
        fetch(`${apiBase}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }).then((response) => {
          if (!response.ok) throw new Error("still offline");
        }),
      ).then((sent) => {
        if (sent > 0) {
          setMessage(`Sent ${sent} score${sent === 1 ? "" : "s"} held on this phone.`);
        }
      });
    };
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [token]);

  useEffect(() => {
    if (!visit?.handedOutAt || visit.arrivedAt || visit.done) {
      setElapsed("");
      return;
    }
    const started = new Date(visit.handedOutAt).getTime();
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      setElapsed(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} walking`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [visit?.handedOutAt, visit?.arrivedAt, visit?.done]);

  useEffect(() => {
    if (!token || !judgeId) return;
    const socket = new WebSocket(
      `${apiBase.replace(/^http/, "ws")}/ws?channel=judge:${judgeId}`,
    );
    socket.onmessage = (incoming) => {
      let payload: { kind?: string };
      try {
        payload = JSON.parse(String(incoming.data)) as { kind?: string };
      } catch {
        return;
      }
      if (payload.kind === "judge.recalled") {
        setVisit(null);
        setMessage("Come back to the desk.");
      }
      if (payload.kind === "visit.voided") {
        setVisit(null);
        setMessage("This visit was voided.");
      }
      if (payload.kind === "judge.overtime") {
        setMessage("Past the target time at this table.");
      }
    };
    return () => socket.close();
  }, [token, judgeId]);

  async function loadProgress(bearer: string) {
    const response = await fetch(
      `${apiBase}/v1/session/progress?eventId=${event.eventId}`,
      { headers: { authorization: `Bearer ${bearer}` } },
    );
    if (!response.ok) return;
    const row = (await response.json()) as { completed: number; total: number; judgeId?: string };
    setProgress(`${row.completed} of ${row.total} scored`);
    if (row.judgeId) setJudgeId(row.judgeId);
  }

  return (
    <main style={{ maxWidth: 28 * 16, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}>
      <p style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>{event.orgName}</p>
      <h1 style={{ fontSize: "1.75rem", margin: "0.25rem 0" }}>{event.name}</h1>
      <p>{event.branding.tagline}</p>
      <p>Phase: {event.phase}</p>

      {!token ? (
        <form
          onSubmit={async (submitEvent) => {
            submitEvent.preventDefault();
            try {
              if (!code) {
                const issued = (await call("/v1/auth/magic-link", { email })) as { code?: string };
                setCode(issued.code ?? "");
                setMessage(issued.code ? "Code filled in for this demo." : "Check your email.");
                return;
              }
              const verified = (await call("/v1/auth/verify", { email, code, org: orgSlug })) as {
                token: string;
              };
              setToken(verified.token);
              const rows = (await fetch(
                `${apiBase}/v1/session/rubric?eventId=${event.eventId}`,
                { headers: { authorization: `Bearer ${verified.token}` } },
              ).then((response) => response.json())) as CriterionRow[];
              setCriteria(rows);
              await loadProgress(verified.token);
              const sent = await flushHeld((path, payload) =>
                fetch(`${apiBase}${path}`, {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${verified.token}`,
                  },
                  body: JSON.stringify(payload),
                }).then((response) => {
                  if (!response.ok) throw new Error("still offline");
                }),
              );
              setMessage(sent > 0 ? `Sent ${sent} score${sent === 1 ? "" : "s"} held on this phone.` : "");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Sign-in failed");
            }
          }}
        >
          <label>
            Email
            <input value={email} onChange={(change) => setEmail(readValue(change))} style={field} />
          </label>
          <label>
            Code
            <input value={code} onChange={(change) => setCode(readValue(change))} style={field} />
          </label>
          <button style={{ ...button, background: accent }} type="submit">
            {code ? "Sign in" : "Email me a code"}
          </button>
        </form>
      ) : (
        <section>
          <button
            style={button}
            type="button"
            onClick={async () => {
              try {
                await call("/v1/judges/apply", { eventId: event.eventId, name: email || "Judge" });
                setMessage("Application sent. An organizer still has to approve it.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not apply");
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
                const next = (await call("/v1/session/next", { eventId: event.eventId })) as Visit;
                setVisit(next);
                await loadProgress(token);
                setMessage(next.done ? "No tables left." : "");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not get a table");
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
              <video ref={videoRef} playsInline muted style={{ width: "100%", display: scanning ? "block" : "none" }} />
              <button
                style={button}
                type="button"
                onClick={async () => {
                  const Detector = (
                    globalThis as {
                      BarcodeDetector?: new (options: { formats: string[] }) => {
                        detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
                      };
                    }
                  ).BarcodeDetector;
                  if (!Detector || !videoRef.current) {
                    setMessage("Type the table number. This browser has no QR detector.");
                    return;
                  }
                  setScanning(true);
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                      video: { facingMode: "environment" },
                    });
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    const codes = await new Detector({ formats: ["qr_code"] }).detect(videoRef.current);
                    for (const track of stream.getTracks()) track.stop();
                    const value = codes[0]?.rawValue ?? "";
                    const token = value.match(
                      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
                    )?.[0];
                    if (!token) {
                      setMessage("No QR code in the frame.");
                      return;
                    }
                    await call("/v1/session/arrive", { eventId: event.eventId, qrToken: token });
                    setVisit({ ...visit, arrivedAt: new Date().toISOString() });
                    setMessage("Arrived.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Could not scan");
                  } finally {
                    setScanning(false);
                  }
                }}
              >
                Scan table QR
              </button>
              <label>
                Table number
                <input value={tableNumber} onChange={(change) => setTableNumber(readValue(change))} style={field} />
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
                    setMessage(error instanceof Error ? error.message : "Could not arrive");
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
                  <button style={button} type="button" onClick={() => void compare("tie")}>
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
                      setScores({ ...scores, [item.id]: Number(readValue(change)) })
                    }
                    style={field}
                  />
                  {(item.anchors ?? []).map((anchor) =>
                    typeof anchor.value === "number" ? (
                      <button
                        key={`${item.id}-${anchor.value}`}
                        style={button}
                        type="button"
                        onClick={() => setScores({ ...scores, [item.id]: anchor.value as number })}
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
                    setMessage("Passed. You will not be sent back to this table.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Could not pass");
                  }
                }}
              >
                Pass on this table
              </button>
            </>
          ) : null}
        </section>
      )}
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
