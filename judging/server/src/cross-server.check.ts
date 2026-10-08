import { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { createDb, event, judge, organization } from "@panel/db";
import { signActor } from "./auth";
import { log } from "./log";

const databaseUrl = process.env.DATABASE_URL ?? process.env.PANEL_DATABASE_URL;
const secret = process.env.PANEL_JWT_SECRET;
const portA = process.env.PORT_A ?? "8787";
const portB = process.env.PORT_B ?? portA;
if (!databaseUrl || !secret) {
  throw new Error("DATABASE_URL and PANEL_JWT_SECRET are required");
}

const { db, pool } = createDb(databaseUrl);
const [demo] = await db
  .select({ eventId: event.id, org: organization.slug })
  .from(event)
  .innerJoin(organization, eq(organization.id, event.orgId))
  .where(eq(organization.slug, "demo"));
if (!demo) throw new Error("demo event missing");

const judges = await db.select().from(judge).where(eq(judge.eventId, demo.eventId));
await pool.end();

const baseA = `http://127.0.0.1:${portA}`;
const socket = new WebSocket(
  `ws://127.0.0.1:${portB}/ws?channel=event:${demo.eventId}:board`,
);
await new Promise<void>((resolve, reject) => {
  socket.once("open", () => resolve());
  socket.once("error", reject);
});

let accept = false;
const heard = new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no vote on the other server within 1s")), 15000);
  socket.on("message", (data) => {
    const text = String(data);
    if (!accept || !text.includes("vote.cast")) return;
    clearTimeout(timer);
    resolve(text);
  });
});

let voted = false;
for (const row of judges) {
  const token = await signActor(
    {
      sub: row.id,
      email: row.email,
      name: row.name,
      org: demo.org,
      role: null,
      judgeExternalId: null,
    },
    secret,
    600,
  );
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const next = await fetch(`${baseA}/v1/session/next`, {
    method: "POST",
    headers,
    body: JSON.stringify({ eventId: demo.eventId }),
  });
  const visit = (await next.json()) as {
    done?: boolean;
    visitId?: string;
    tableNumber?: number | null;
    message?: string;
  };
  if (!next.ok || visit.done || !visit.visitId) continue;
  await fetch(`${baseA}/v1/session/arrive`, {
    method: "POST",
    headers,
    body: JSON.stringify({ eventId: demo.eventId, tableNumber: visit.tableNumber }),
  });
  const rubricResponse = await fetch(
    `${baseA}/v1/session/rubric?eventId=${demo.eventId}`,
    { headers },
  );
  const rubric = (await rubricResponse.json()) as { id: string; min: number }[];
  if (!Array.isArray(rubric) || rubric.length === 0) continue;
  accept = true;
  const vote = await fetch(`${baseA}/v1/session/vote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      eventId: demo.eventId,
      visitId: visit.visitId,
      comment: null,
      scores: rubric.map((item) => ({ criterionId: item.id, value: item.min })),
    }),
  });
  if (!vote.ok) continue;
  voted = true;
  break;
}

if (!voted) throw new Error("no judge could cast a vote");
const message = await Promise.race([
  heard,
  new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("no vote on the other server within 1s")), 1000);
  }),
]);
log({ message });
socket.close();
