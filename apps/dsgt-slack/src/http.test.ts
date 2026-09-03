import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SLACK_WEBHOOK_PATH,
  handleSlackWebhook,
  resetSlackEventDedupe,
  verifySlackSignature,
} from "./http";
import { CLUB_SITE_URL, JOIN_FAQ_REPLY } from "./replies";

const SIGNING_SECRET = "test-signing-secret";
const FROZEN_TS = "1710000000";
const FROZEN_NOW_MS = Number(FROZEN_TS) * 1000;

function sign(rawBody: string, timestamp: string): string {
  const digest = createHmac("sha256", SIGNING_SECRET)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return `v0=${digest}`;
}

function signedRequest(rawBody: string, contentType: string): Request {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request(`${CLUB_SITE_URL}${SLACK_WEBHOOK_PATH}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": sign(rawBody, timestamp),
    },
    body: rawBody,
  });
}

describe("verifySlackSignature", () => {
  it("accepts a matching v0 signature within the time window", () => {
    const rawBody = `{"ok":true}`;
    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        signature: sign(rawBody, FROZEN_TS),
        timestamp: FROZEN_TS,
        rawBody,
        nowMs: FROZEN_NOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects a missing or wrong signature", () => {
    const rawBody = `{"ok":true}`;
    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        signature: null,
        timestamp: FROZEN_TS,
        rawBody,
        nowMs: FROZEN_NOW_MS,
      }),
    ).toBe(false);
    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        signature: "v0=deadbeef",
        timestamp: FROZEN_TS,
        rawBody,
        nowMs: FROZEN_NOW_MS,
      }),
    ).toBe(false);
  });
});

describe("handleSlackWebhook", () => {
  const env = { botToken: "xoxb-test", signingSecret: SIGNING_SECRET };

  beforeEach(() => {
    resetSlackEventDedupe();
  });

  it("returns the url_verification challenge", async () => {
    const rawBody = JSON.stringify({
      type: "url_verification",
      challenge: "abc-challenge",
    });
    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      challenge: "abc-challenge",
    });
  });

  it("rejects unsigned requests", async () => {
    const response = await handleSlackWebhook(
      new Request(`${CLUB_SITE_URL}${SLACK_WEBHOOK_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "url_verification", challenge: "nope" }),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("replies to an app_mention join question with the FAQ", async () => {
    const postMessage = vi.fn().mockResolvedValue({});
    const rawBody = JSON.stringify({
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> how do I join?",
        channel: "C123",
        thread_ts: "1710000000.000100",
      },
    });

    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      { chat: { postMessage } },
    );

    expect(response.status).toBe(200);
    expect(postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: JOIN_FAQ_REPLY,
      thread_ts: "1710000000.000100",
    });
  });

  it("replies to a DM join question with the FAQ", async () => {
    const postMessage = vi.fn().mockResolvedValue({});
    const rawBody = JSON.stringify({
      type: "event_callback",
      event: {
        type: "message",
        channel_type: "im",
        text: "How do I join the club?",
        channel: "D123",
      },
    });

    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      { chat: { postMessage } },
    );

    expect(response.status).toBe(200);
    expect(postMessage).toHaveBeenCalledWith({
      channel: "D123",
      text: JOIN_FAQ_REPLY,
    });
  });

  it("acks /dsgt join with the FAQ as an ephemeral response", async () => {
    const rawBody = "command=%2Fdsgt&text=join";
    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/x-www-form-urlencoded"),
      env,
      { chat: { postMessage: vi.fn() } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      response_type: "ephemeral",
      text: JOIN_FAQ_REPLY,
    });
  });

  it("acks event_callback before chat.postMessage resolves", async () => {
    let release: (value: unknown) => void = () => {
      /* assigned below */
    };
    const postMessage = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const rawBody = JSON.stringify({
      type: "event_callback",
      event_id: "EvACK",
      event: {
        type: "app_mention",
        text: "<@U123> ping",
        channel: "C123",
      },
    });

    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      { chat: { postMessage } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(postMessage).toHaveBeenCalledTimes(1);
    release({});
  });

  it("does not post twice for a retried event_id", async () => {
    const postMessage = vi.fn().mockResolvedValue({});
    const rawBody = JSON.stringify({
      type: "event_callback",
      event_id: "EvDUP",
      event: {
        type: "app_mention",
        text: "<@U123> how do I join?",
        channel: "C123",
      },
    });
    const client = { chat: { postMessage } };

    const first = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      client,
    );
    const retry = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      client,
    );

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("does not treat a slow postMessage rejection as invalid JSON", async () => {
    const postMessage = vi.fn().mockRejectedValue(new Error("slack down"));
    const rawBody = JSON.stringify({
      type: "event_callback",
      event_id: "EvFAIL",
      event: {
        type: "app_mention",
        text: "<@U123> ping",
        channel: "C123",
      },
    });

    const response = await handleSlackWebhook(
      signedRequest(rawBody, "application/json"),
      env,
      { chat: { postMessage } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
