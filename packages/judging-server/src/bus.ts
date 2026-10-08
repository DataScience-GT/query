import { Redis } from "ioredis";
import { log } from "./log";

type Listener = (message: unknown) => void;

export type Bus = {
  publish(channel: string, message: unknown): void;
  subscribe(channel: string, listener: Listener): () => void;
  onDown(listener: () => void): void;
};

/** In-process fan-out. Used when REDIS_URL is unset. */
export class InMemoryBus implements Bus {
  private readonly channels = new Map<string, Set<Listener>>();

  publish(channel: string, message: unknown) {
    for (const listener of this.channels.get(channel) ?? []) listener(message);
  }

  subscribe(channel: string, listener: Listener) {
    const listeners = this.channels.get(channel) ?? new Set<Listener>();
    listeners.add(listener);
    this.channels.set(channel, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.channels.delete(channel);
    };
  }

  onDown() {
    // This process is the bus.
  }
}

export function createRedisBus(url: string): Bus {
  const options = { maxRetriesPerRequest: null };
  const pub = new Redis(url, options);
  const sub = new Redis(url, options);
  const listeners = new Map<string, Set<Listener>>();
  const downListeners = new Set<() => void>();
  let down = false;
  const fail = () => {
    if (down) return;
    down = true;
    for (const listener of downListeners) listener();
  };
  pub.on("error", fail);
  sub.on("error", fail);
  sub.on("message", (channel: string, raw: string) => {
    const message = JSON.parse(raw) as unknown;
    for (const listener of listeners.get(channel) ?? []) listener(message);
  });
  return {
    publish(channel, message) {
      void pub.publish(channel, JSON.stringify(message));
    },
    subscribe(channel, listener) {
      const set = listeners.get(channel) ?? new Set<Listener>();
      const first = set.size === 0;
      set.add(listener);
      listeners.set(channel, set);
      if (first) void sub.subscribe(channel);
      return () => {
        set.delete(listener);
        if (set.size === 0) void sub.unsubscribe(channel);
      };
    },
    onDown(listener) {
      downListeners.add(listener);
    },
  };
}

/** Redis when REDIS_URL is set, otherwise the in-process bus. */
export function createBus(redisUrl: string | undefined): Bus {
  const url = redisUrl?.trim();
  if (!url) return new InMemoryBus();
  return new FallbackBus(createRedisBus(url));
}

/**
 * Uses Redis until the connection errors, then this process fans out in memory.
 * Clients still reload state from the live snapshot, so a second server does
 * not need Redis for correctness.
 */
export class FallbackBus implements Bus {
  private readonly memory = new InMemoryBus();
  private redis: Bus | null;
  private failed = false;
  private readonly subs: { channel: string; listener: Listener; unsubscribe: () => void }[] = [];

  constructor(redis: Bus) {
    this.redis = redis;
    redis.onDown(() => this.fail());
  }

  private fail() {
    if (this.failed) return;
    this.failed = true;
    for (const sub of this.subs) {
      sub.unsubscribe();
      sub.unsubscribe = this.memory.subscribe(sub.channel, sub.listener);
    }
    this.redis = null;
    log({
      level: "warn",
      message: "Redis is unavailable. This process is using the in-process bus.",
    });
  }

  publish(channel: string, message: unknown) {
    const target = this.failed ? this.memory : this.redis;
    target?.publish(channel, message);
  }

  subscribe(channel: string, listener: Listener) {
    const target = this.failed ? this.memory : this.redis;
    const unsubscribe = target?.subscribe(channel, listener) ?? (() => undefined);
    const sub = { channel, listener, unsubscribe };
    this.subs.push(sub);
    return () => {
      sub.unsubscribe();
      const index = this.subs.indexOf(sub);
      if (index >= 0) this.subs.splice(index, 1);
    };
  }

  onDown() {
    // Callers keep their sockets. This process still delivers messages.
  }
}
