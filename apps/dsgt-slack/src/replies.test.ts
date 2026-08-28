import { describe, expect, it } from "vitest";

import {
  CLUB_SITE_URL,
  JOIN_FAQ_REPLY,
  detectIntent,
  replyForSlashCommand,
  replyForText,
  stripBotMention,
} from "./replies";

describe("join FAQ reply", () => {
  it("names the August 26 first event and points to the club site", () => {
    expect(JOIN_FAQ_REPLY).toContain("August 26");
    expect(JOIN_FAQ_REPLY).toContain("8/26");
    expect(JOIN_FAQ_REPLY).toContain(
      "Further details will be announced at that event",
    );
    expect(JOIN_FAQ_REPLY).toContain(CLUB_SITE_URL);
    expect(JOIN_FAQ_REPLY).toContain("datasciencegt.org");
  });

  it.each([
    "How do I join the club?",
    "When is the first event?",
    "I want to sign up",
    "<@U123> how do I join?",
    "What is happening on 8/26?",
  ])("routes join questions to the FAQ: %s", (text) => {
    expect(detectIntent(text)).toBe("join");
    expect(replyForText(text)).toBe(JOIN_FAQ_REPLY);
  });
});

describe("slash command routing", () => {
  it("returns help when the command text is empty", () => {
    expect(replyForSlashCommand("")).toContain("Available topics");
  });

  it("returns the join FAQ for /dsgt join", () => {
    expect(replyForSlashCommand("join")).toBe(JOIN_FAQ_REPLY);
  });
});

describe("stripBotMention", () => {
  it("removes a Slack user mention before the rest of the text", () => {
    expect(stripBotMention("<@U123> how do I join?")).toBe("how do I join?");
  });

  it("is linear on a long run of incomplete <@ prefixes", () => {
    const noisy = `${"<@".repeat(200)} how do I join?`;
    expect(detectIntent(noisy)).toBe("join");
  });
});
