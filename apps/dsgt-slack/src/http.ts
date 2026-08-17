/**
 * HTTP Events API handler for production.
 *
 * Slack POSTs to the Firebase App Hosting (Cloud Run) URL. This module is Fetch
 * Request/Response based so Next.js App Router can call it. It does not start a
 * Bolt HTTP server — Socket Mode / Bolt remain a local-only process.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { WebClient } from "@slack/web-api";

import { replyForSlashCommand, replyForText } from "./replies";

/** Stable Request URL path on mainweb. Use this in the Slack app settings. */
export const SLACK_WEBHOOK_PATH = "/api/webhooks/slack";

const MAX_CLOCK_SKEW_SEC = 60 * 5;

export type SlackHttpEnv = {
  botToken: string;
  signingSecret: string;
};

export type SlackPoster = {
  chat: {
    postMessage: (args: {
      channel: string;
      text: string;
      thread_ts?: string;
    }) => Promise<unknown>;
  };
};

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}

export function verifySlackSignature(options: {
  signingSecret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const {
    signingSecret,
    signature,
    timestamp,
    rawBody,
    nowMs = Date.now(),
  } = options;

  if (!signature || !timestamp || !/^[0-9]+$/.test(timestamp)) {
    return false;
  }

  const ageSec = Math.abs(nowMs / 1000 - Number(timestamp));
  if (ageSec > MAX_CLOCK_SKEW_SEC) {
    return false;
  }

  const digest = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");

  return safeEqual(`v0=${digest}`, signature);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type SlackMessageEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  thread_ts?: string;
};

function parseMessageEvent(value: unknown): SlackMessageEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return {
    type: value.type,
    subtype: typeof value.subtype === "string" ? value.subtype : undefined,
    bot_id: typeof value.bot_id === "string" ? value.bot_id : undefined,
    text: typeof value.text === "string" ? value.text : undefined,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    channel_type:
      typeof value.channel_type === "string" ? value.channel_type : undefined,
    thread_ts:
      typeof value.thread_ts === "string" ? value.thread_ts : undefined,
  };
}

async function handleEvent(
  event: SlackMessageEvent,
  client: SlackPoster,
): Promise<void> {
  if (event.bot_id || event.subtype) {
    return;
  }
  if (typeof event.text !== "string" || typeof event.channel !== "string") {
    return;
  }

  if (event.type === "app_mention") {
    await client.chat.postMessage({
      channel: event.channel,
      text: replyForText(event.text),
      ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}),
    });
    return;
  }

  if (event.type === "message" && event.channel_type === "im") {
    await client.chat.postMessage({
      channel: event.channel,
      text: replyForText(event.text),
    });
  }
}

async function handleJsonBody(
  payload: unknown,
  client: SlackPoster,
): Promise<Response> {
  if (!isRecord(payload) || typeof payload.type !== "string") {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    const challenge =
      typeof payload.challenge === "string" ? payload.challenge : "";
    return Response.json({ challenge });
  }

  if (payload.type === "event_callback") {
    const event = parseMessageEvent(payload.event);
    if (event) {
      await handleEvent(event, client);
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}

function handleFormBody(rawBody: string): Response {
  const params = new URLSearchParams(rawBody);

  if (params.get("ssl_check") === "1") {
    return new Response("", { status: 200 });
  }

  if (params.has("payload")) {
    return new Response("", { status: 200 });
  }

  const command = params.get("command");
  if (command) {
    return Response.json({
      response_type: "ephemeral",
      text: replyForSlashCommand(params.get("text") ?? ""),
    });
  }

  return Response.json({ error: "Unknown Slack request" }, { status: 400 });
}

export async function handleSlackWebhook(
  req: Request,
  env: SlackHttpEnv,
  client: SlackPoster = new WebClient(env.botToken),
): Promise<Response> {
  const rawBody = await req.text();
  const valid = verifySlackSignature({
    signingSecret: env.signingSecret,
    signature: req.headers.get("x-slack-signature"),
    timestamp: req.headers.get("x-slack-request-timestamp"),
    rawBody,
  });

  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/json") ||
    rawBody.trimStart().startsWith("{")
  ) {
    try {
      return await handleJsonBody(JSON.parse(rawBody) as unknown, client);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  return handleFormBody(rawBody);
}
