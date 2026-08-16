import { describe, it, expect, vi } from "vitest";
import {
  validateRequestSize,
  rateLimit,
  ddosProtection,
} from "../middleware/security";
// The sanitizer the request path actually runs. These tests used to target
// `sanitizeInput` in middleware/security.ts — a second implementation with
// different semantics (it stripped markup rather than refusing it) and no
// caller anywhere, so the suite described behaviour the product did not have.
import { scrubMarkup } from "../trpc";
import { TRPCError } from "@trpc/server";

vi.mock("@query/db", () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn() },
  auditLogs: {},
}));

describe("Security and Protection Verification Suite", () => {
  /**
   * Dangerous markup is REJECTED, never rewritten: rewriting silently changes
   * what somebody wrote, and an HTML parser over prose eats "loss<threshold"
   * and everything after it. The bar is "could this execute somewhere", so
   * ordinary maths and `vector<int>` have to survive untouched.
   */
  describe("1. Input sanitization — executable markup", () => {
    it("refuses script tags rather than quietly removing them", () => {
      expect(() => scrubMarkup('<script>alert("xss")</script>hello')).toThrow(
        TRPCError,
      );
    });

    it("refuses a tag carrying an event handler", () => {
      expect(() =>
        scrubMarkup('<img src="invalid.jpg" onerror="alert(1)">'),
      ).toThrow(TRPCError);
      expect(() => scrubMarkup('<svg onload="alert(1)">')).toThrow(TRPCError);
      // Slash is an attribute separator in HTML; the old `\bon` regex
      // rejected this, and so must the linear scan.
      expect(() =>
        scrubMarkup("<div/onmouseover=alert(1)>"),
      ).toThrow(TRPCError);
      expect(() => scrubMarkup("<body/onload=alert(1)>")).toThrow(TRPCError);
    });

    it("refuses a javascript: URI even as plain text", () => {
      // Whoever renders this into an href gets an executable link.
      expect(() => scrubMarkup('javascript:alert("hacked")')).toThrow(
        TRPCError,
      );
    });

    it("refuses nested-tag evasion attempts", () => {
      expect(() => scrubMarkup('<<SCRIPT>alert("xss");//</SCRIPT>')).toThrow(
        TRPCError,
      );
    });

    /**
     * The case that makes rejection the right design: a hackathon is full of
     * people writing comparisons and generics, and none of it may be mangled
     * or bounced.
     */
    it("passes ordinary prose and code through byte for byte", () => {
      const prose =
        "picks the class where loss<threshold, then retrains vector<int> a<b";
      expect(scrubMarkup(prose)).toBe(prose);
      expect(scrubMarkup("onboarding = great")).toBe("onboarding = great");
    });

    /**
     * SQL is NOT guessed at. Parameterised queries already make it a non-issue,
     * and pattern-matching prose for keywords rejects "select a track from the
     * list" — a sentence somebody will genuinely write in a submission.
     */
    it("does not reject prose that happens to read like SQL", () => {
      const text = "select a track from the list, then update your project";
      expect(scrubMarkup(text)).toBe(text);
    });
  });

  describe("2. Input sanitization — object shape", () => {
    it("drops prototype-polluting keys", () => {
      const payload = JSON.parse(
        '{"__proto__": {"maliciousProperty": "injected"}, "name": "ok"}',
      );
      const result = scrubMarkup(payload) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(
        false,
      );
      expect((({}) as Record<string, unknown>).maliciousProperty).toBeUndefined();
      expect(result.name).toBe("ok");
    });

    it("drops constructor and prototype keys", () => {
      const withConstructor = JSON.parse(
        '{"constructor": {"prototype": {"polluted": "yes"}}}',
      );
      expect(
        Object.prototype.hasOwnProperty.call(
          scrubMarkup(withConstructor) as object,
          "constructor",
        ),
      ).toBe(false);

      const result = scrubMarkup({
        prototype: { admin: true },
        username: "normal",
      }) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(result, "prototype")).toBe(
        false,
      );
      expect(result.username).toBe("normal");
    });

    it("drops keys that are not plain identifiers", () => {
      // $where and friends never reach a query builder here, but a key shaped
      // like that has no business in a payload either.
      const result = scrubMarkup({
        $where: 'this.role == "admin"',
        validKey: "data",
      }) as Record<string, unknown>;
      expect(result.$where).toBeUndefined();
      expect(result.validKey).toBe("data");
    });
  });

  describe("3. Input sanitization — complexity limits", () => {
    const makeNestedObject = (depth: number): unknown =>
      depth === 0 ? "leaf" : { node: makeNestedObject(depth - 1) };

    it("allows nesting up to ten levels and refuses eleven", () => {
      expect(scrubMarkup(makeNestedObject(9))).toBeDefined();
      expect(scrubMarkup(makeNestedObject(10))).toBeDefined();
      expect(() => scrubMarkup(makeNestedObject(11))).toThrow(
        "Input too deeply nested",
      );
    });

    it("allows fifty keys and refuses fifty-one", () => {
      const fifty: Record<string, number> = {};
      for (let i = 0; i < 50; i++) fifty[`key_${i}`] = i;
      expect(scrubMarkup(fifty)).toBeDefined();

      const fiftyOne: Record<string, number> = { ...fifty, key_50: 50 };
      expect(() => scrubMarkup(fiftyOne)).toThrow("Object too complex");
    });

    /**
     * The array cap must stay at or above the largest `.max()` any schema
     * declares. It sat at 500 while batchUpdateParticipantStatus allowed 2500,
     * which made approving a 2000-person roster impossible in one call — and
     * the error named neither the real limit nor the field.
     */
    it("allows 2500 array elements and refuses 2501", () => {
      expect(scrubMarkup(new Array(2500).fill("valid"))).toBeDefined();
      expect(() => scrubMarkup(new Array(2501).fill("invalid"))).toThrow(
        "Array too large",
      );
    });

    it("refuses a non-finite number", () => {
      expect(() => scrubMarkup(Number.POSITIVE_INFINITY)).toThrow(
        "Invalid number",
      );
      expect(() => scrubMarkup(Number.NaN)).toThrow("Invalid number");
    });
  });

  describe("6. Payload Size Restrictions", () => {
    it("should validate request size with default limit", () => {
      const smallPayload = { test: "a".repeat(100) };
      expect(validateRequestSize(smallPayload, 500)).toBe(true);
    });

    it("should reject requests exceeding size limit", () => {
      const largePayload = { test: "a".repeat(600) };
      expect(validateRequestSize(largePayload, 500)).toBe(false);
    });

    it("should calculate size properly with nested structures", () => {
      const complexPayload = {
        meta: { name: "test", size: 123 },
        data: ["a", "b", "c", "d".repeat(200)],
      };
      expect(validateRequestSize(complexPayload, 150)).toBe(false);
    });
  });

  describe("7. Rate Limiting Token Bucket and Exponential Violations", () => {
    it("should allow requests within limit capacity", () => {
      const user = "normal-user";
      const r1 = rateLimit(user, 5, 1, 1);
      const r2 = rateLimit(user, 5, 1, 1);
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
    });

    it("should block requests when bucket runs out of tokens", () => {
      const user = "exhausted-user";
      rateLimit(user, 2, 0, 1);
      rateLimit(user, 2, 0, 1);

      const r3 = rateLimit(user, 2, 0, 1);
      expect(r3.allowed).toBe(false);
      expect(r3.retryAfter).toBe(1);
    });

    it("should exponentially increase retry duration upon repeated violations", () => {
      vi.useFakeTimers();
      const user = "violator-user";

      // Exhaust first
      rateLimit(user, 1, 0, 1);

      // 1st violation
      const v1 = rateLimit(user, 1, 0, 1);
      expect(v1.allowed).toBe(false);
      expect(v1.retryAfter).toBe(1); // 2^0 = 1s

      // Wait 1.1 seconds for block to clear
      vi.advanceTimersByTime(1100);

      // 2nd violation
      const v2 = rateLimit(user, 1, 0, 1);
      expect(v2.allowed).toBe(false);
      expect(v2.retryAfter).toBe(2); // 2^1 = 2s

      // Wait 2.1 seconds for block to clear
      vi.advanceTimersByTime(2100);

      // 3rd violation
      const v3 = rateLimit(user, 1, 0, 1);
      expect(v3.allowed).toBe(false);
      expect(v3.retryAfter).toBe(4); // 2^2 = 4s

      vi.useRealTimers();
    });

    /**
     * Backoff is exponential in the violation count, so without a decay that
     * can actually fire, one bad afternoon escalates a legitimate attendee to
     * five-minute blocks for the rest of the event.
     *
     * The old decay compared against lastRefill, which is stamped on every
     * request — so it could only fire for somebody who had stopped making
     * requests altogether, which is precisely who does not need forgiving.
     */
    it("forgives violations one clear period at a time", () => {
      vi.useFakeTimers();
      const user = "reformed-user";

      // Trip it twice: the second violation costs 2s.
      rateLimit(user, 1, 0, 1);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(1);
      vi.advanceTimersByTime(1100);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(2);

      // One clear period forgives one step: count 2 -> 1, so the next
      // violation is priced at 2^1 rather than 2^2.
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(2);

      // A second clear period clears the slate entirely.
      vi.advanceTimersByTime(21 * 60 * 1000);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(1);

      vi.useRealTimers();
    });

    // A caller who keeps hammering must not have their count decayed by the
    // passage of time alone — the decay is measured from the last violation.
    it("keeps escalating a caller who never stops violating", () => {
      vi.useFakeTimers();
      const user = "persistent-user";

      rateLimit(user, 1, 0, 1);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(1);
      vi.advanceTimersByTime(1100);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(2);
      vi.advanceTimersByTime(2100);
      expect(rateLimit(user, 1, 0, 1).retryAfter).toBe(4);

      vi.useRealTimers();
    });
  });

  describe("8. DDoS Burst Interception", () => {
    it("should allow burst requests up to threshold", () => {
      const ip = "192.168.1.50";
      for (let i = 0; i < 99; i++) {
        expect(ddosProtection(ip).allowed).toBe(true);
      }
    });

    it("should block burst requests above threshold", () => {
      const ip = "192.168.1.100";
      for (let i = 0; i < 100; i++) {
        ddosProtection(ip);
      }
      const blockResult = ddosProtection(ip);
      expect(blockResult.allowed).toBe(false);
      expect(blockResult.retryAfter).toBeGreaterThan(0);
    });

    it("should release IP block after cooldown period", () => {
      vi.useFakeTimers();
      const ip = "192.168.1.200";

      for (let i = 0; i < 101; i++) {
        ddosProtection(ip);
      }

      // Verify blocked
      expect(ddosProtection(ip).allowed).toBe(false);

      // Advance by 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Verify unblocked
      expect(ddosProtection(ip).allowed).toBe(true);
      vi.useRealTimers();
    });
  });
});
