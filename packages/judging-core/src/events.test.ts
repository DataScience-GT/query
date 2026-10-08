import { describe, expect, it } from "vitest";
import {
  boardChannel,
  isOutboxTopic,
  judgeChannel,
  leaderboardChannel,
  LOG_KINDS,
  OUTBOX_TOPICS,
} from "./events";
import type { LogKind } from "./events";

describe("events", () => {
  it("only queues topics the log already knows", () => {
    for (const topic of OUTBOX_TOPICS) {
      expect(LOG_KINDS).toContain(topic);
      expect(isOutboxTopic(topic)).toBe(true);
    }
  });

  it("does not queue a log row that nobody subscribes to", () => {
    expect(isOutboxTopic("project.upserted")).toBe(false);
  });

  it("names the channels the board, the leaderboard, and a judge listen on", () => {
    expect(boardChannel("evt")).toBe("event:evt:board");
    expect(leaderboardChannel("evt")).toBe("event:evt:leaderboard");
    expect(judgeChannel("j1")).toBe("judge:j1");
  });

  it("accepts every log kind as a log kind", () => {
    const kind: LogKind = "vote.cast";
    expect(LOG_KINDS).toContain(kind);
  });
});
