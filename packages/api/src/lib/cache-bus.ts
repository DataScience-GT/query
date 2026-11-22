import { reportRedisFailure, withTimeout } from "./redis";
import type { RedisClient } from "./redis";

// Cross-instance cache invalidation over a Redis stream.
//
// Why a bus and not a shared cache: CacheService.get/set are synchronous and
// used in ~60 places, and its values are live objects (Dates, bigints). A
// shared L2 would force every call site async and every cached shape through
// JSON. The bug being fixed is stale reads after a write on another instance,
// and that only needs the *invalidation* shared. Each instance keeps its fast
// in-memory cache; a delete on any of them is appended to one stream, and every
// instance polls it and applies the same delete locally.
//
// Guarantee: a write on instance A is visible on instance B within one poll
// interval (default 2s) plus a Redis round trip, as long as B is running.
// Async reads (getOrSet) also catch up before answering if B has not polled
// within an interval, which covers a throttled idle instance waking up.
//
// Lost messages: if a poll fails, the cursor does not move, so the next one
// replays what was missed. After any failed poll the whole local cache is
// dropped on recovery, since the stream may have been trimmed meanwhile.

const STREAM_MAX_LEN = 500;
const POLL_BATCH = 200;
export const DEFAULT_POLL_MS = 2000;

export class CacheInvalidationBus {
  private cursor = "0-0";
  private lastPollAt = 0;
  private polling: Promise<void> | null = null;
  private missedPoll = false;
  private timer: NodeJS.Timeout | null = null;
  /** Distinguishes our own messages, already applied locally, from others'. */
  private readonly nonce = Math.random().toString(36).slice(2);
  private readonly stream: string;

  constructor(
    private readonly redis: RedisClient,
    prefix: string,
    /** Applies a delete pattern (exact key or glob) to the local cache. */
    private readonly apply: (pattern: string) => void,
    /** Drops everything local, after a gap in what we could see. */
    private readonly clearAll: () => void,
    private readonly pollMs: number = DEFAULT_POLL_MS,
  ) {
    this.stream = `${prefix}cache:inv`;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Fire and forget: the local delete already happened; failure is logged. */
  publish(pattern: string) {
    void withTimeout(
      this.redis.xadd(
        this.stream,
        "*",
        { n: this.nonce, p: pattern },
        {
          trim: { type: "MAXLEN", comparison: "~", threshold: STREAM_MAX_LEN },
        },
      ),
    ).catch((err) => reportRedisFailure("cache invalidation publish", err));
  }

  /** Awaits a poll only if the last one is older than an interval. */
  async ensureFresh() {
    if (Date.now() - this.lastPollAt < this.pollMs) return;
    await this.poll();
  }

  poll(): Promise<void> {
    this.polling ??= this.pollOnce().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  private async pollOnce() {
    // Stamped before the attempt: while Redis is down, getOrSet must pay the
    // timeout once per interval, not once per call.
    this.lastPollAt = Date.now();
    try {
      // Exclusive start: "(" is Redis >= 6.2.
      for (;;) {
        const batch = await withTimeout(
          this.redis.xrange(this.stream, `(${this.cursor}`, "+", POLL_BATCH),
        );
        const ids = Object.keys(batch);
        if (this.missedPoll) {
          this.missedPoll = false;
          this.clearAll();
        }
        for (const id of ids) {
          const message = batch[id]!;
          if (message.n !== this.nonce && typeof message.p === "string") {
            this.apply(message.p);
          }
          this.cursor = id;
        }
        if (ids.length < POLL_BATCH) break;
      }
    } catch (err) {
      this.missedPoll = true;
      reportRedisFailure("cache invalidation poll", err);
    }
  }
}
