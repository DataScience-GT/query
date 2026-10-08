import { describe, expect, it } from "vitest";
import { FallbackBus, InMemoryBus } from "./bus";
import type { Bus } from "./bus";

describe("InMemoryBus", () => {
  it("delivers a message only to subscribers of that channel", () => {
    const bus = new InMemoryBus();
    const seen: unknown[] = [];
    const stop = bus.subscribe("event:1:board", (message) => seen.push(message));
    bus.publish("event:1:board", { kind: "vote.cast" });
    bus.publish("event:2:board", { kind: "other" });
    stop();
    bus.publish("event:1:board", { kind: "again" });
    expect(seen).toEqual([{ kind: "vote.cast" }]);
  });
});

class DownableBus implements Bus {
  readonly seen: unknown[] = [];
  private readonly down: (() => void)[] = [];

  publish(_channel: string, message: unknown) {
    this.seen.push(message);
  }

  subscribe() {
    return () => undefined;
  }

  onDown(listener: () => void) {
    this.down.push(listener);
  }

  stop() {
    for (const listener of this.down) listener();
  }
}

describe("FallbackBus", () => {
  it("keeps delivering on this process after Redis reports down", () => {
    const redis = new DownableBus();
    const bus = new FallbackBus(redis);
    const seen: unknown[] = [];
    bus.subscribe("event:1:board", (message) => seen.push(message));
    bus.publish("event:1:board", { kind: "before" });
    redis.stop();
    bus.publish("event:1:board", { kind: "after" });
    expect(redis.seen).toEqual([{ kind: "before" }]);
    expect(seen).toEqual([{ kind: "after" }]);
  });
});
