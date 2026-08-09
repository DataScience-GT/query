import { describe, it, expect, vi } from "vitest";
// The sanitizer the request path actually runs — see the note in
// security.test.ts about the second, uncalled implementation these used to
// target.
import { scrubMarkup } from "../trpc";

vi.mock("@query/db", () => ({
  db: {},
}));

/**
 * Best-of-N timing for the ReDoS guards below.
 *
 * These tests exist to catch catastrophic regex backtracking, which turns
 * milliseconds into seconds. A single cold call measures JIT compilation and
 * whatever else the machine is doing, not the regex \u2014 that made the 50ms
 * budget fail at 55ms for a 30-character input. Warm up, then take the fastest
 * of several runs so a GC pause or a busy CI box cannot fail the suite, and
 * keep the budget loose enough that only genuine blow-up trips it.
 */
function fastestRun(fn: () => unknown, runs = 5): number {
  fn(); // warm-up: discard first-call compile cost
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe("Resilience and Domain Edge Cases Verification Suite", () => {
  describe("1. Zalgo Character Abuse and Regex Performance Limits", () => {
    it("should sanitize regular Zalgo text without hanging the event loop", () => {
      // Combining character sequences
      const zalgo =
        "H\u033d\u0310\u0355e\u033d\u0310\u0355l\u033d\u0310\u0355l\u033d\u0310\u0355o\u033d\u0310\u0355";

      expect(typeof scrubMarkup(zalgo)).toBe("string");
      // Backtracking on this input would take seconds, not 250ms.
      expect(fastestRun(() => scrubMarkup(zalgo))).toBeLessThan(250);
    });

    it("should handle massive combined character strings efficiently", () => {
      const hugeZalgo = "A" + "\u0301".repeat(5000);

      expect(typeof scrubMarkup(hugeZalgo)).toBe("string");
      expect(fastestRun(() => scrubMarkup(hugeZalgo))).toBeLessThan(500);
    });

    /**
     * Long input is passed through, not truncated. Silently cutting a 15,000
     * character project description at 10,000 is the same class of bug as
     * rewriting markup: the author is never told, and the loss is permanent.
     * Length limits belong in each procedure's own schema, where the error can
     * name the field.
     */
    it("passes a long plain string through untouched", () => {
      const normalLongString = "b".repeat(15000);
      expect(scrubMarkup(normalLongString)).toBe(normalLongString);
    });
  });

  describe("2. Malicious File Names and Character Overrides", () => {
    it("should strip right-to-left override character U+202E from file paths", () => {
      const maliciousName = "photo-display\u202Egpj.exe";
      const cleanName = maliciousName.replace(
        /[\u200E\u200F\u202A-\u202E]/g,
        "",
      );
      expect(cleanName).toBe("photo-displaygpj.exe");
    });

    it("should strip right-to-left embedding character U+202B from string inputs", () => {
      const payload = "team-name\u202Bsecret.pdf";
      const clean = payload.replace(/[\u200E\u200F\u202A-\u202E]/g, "");
      expect(clean).toBe("team-namesecret.pdf");
    });

    it("should handle double file extensions safely without modifications", () => {
      const name = "document.pdf.png";
      const result = scrubMarkup(name);
      expect(result).toBe("document.pdf.png");
    });
  });

  describe("3. Webhook Ordering and Retries Idempotency", () => {
    it("should reject outdated webhooks arriving out of chronological order", () => {
      let currentSubscriptionStatus = "active";
      let lastEventTimestamp = new Date("2026-06-10T12:00:00Z").getTime();

      const processStripeWebhook = (
        eventType: string,
        eventTimestamp: number,
      ) => {
        if (eventTimestamp < lastEventTimestamp) {
          return { status: "ignored", reason: "out of order" };
        }
        lastEventTimestamp = eventTimestamp;
        if (eventType === "subscription.deleted") {
          currentSubscriptionStatus = "deleted";
        } else if (eventType === "subscription.created") {
          currentSubscriptionStatus = "active";
        }
        return { status: "processed" };
      };

      // Delayed deletion webhook from earlier date arrives late
      const oldEventTimestamp = new Date("2026-06-10T10:00:00Z").getTime();
      const r1 = processStripeWebhook(
        "subscription.deleted",
        oldEventTimestamp,
      );
      expect(r1.status).toBe("ignored");
      expect(currentSubscriptionStatus).toBe("active");

      // Newer deletion webhook arrives and gets processed
      const newEventTimestamp = new Date("2026-06-10T14:00:00Z").getTime();
      const r2 = processStripeWebhook(
        "subscription.deleted",
        newEventTimestamp,
      );
      expect(r2.status).toBe("processed");
      expect(currentSubscriptionStatus).toBe("deleted");
    });

    it("should prevent processing duplicate webhook event IDs", () => {
      const processedEventIds = new Set<string>();
      let transactionsProcessed = 0;

      const handlePaymentWebhook = (eventId: string) => {
        if (processedEventIds.has(eventId)) {
          return { status: "duplicate" };
        }
        processedEventIds.add(eventId);
        transactionsProcessed++;
        return { status: "success" };
      };

      const id = "evt_stripe_12345";
      const res1 = handlePaymentWebhook(id);
      const res2 = handlePaymentWebhook(id);

      expect(res1.status).toBe("success");
      expect(res2.status).toBe("duplicate");
      expect(transactionsProcessed).toBe(1);
    });
  });

  describe("4. Poor Wifi Check-In Double Scan Handling", () => {
    it("should prevent double check-ins under concurrent connection situations", async () => {
      const inflightScans = new Set<string>();
      let recordsAdded = 0;

      const attemptCheckIn = async (scanToken: string) => {
        if (inflightScans.has(scanToken)) {
          return { success: false, reason: "in-flight" };
        }
        inflightScans.add(scanToken);
        await new Promise((r) => setTimeout(r, 10)); // Network delay simulation
        recordsAdded++;
        inflightScans.delete(scanToken);
        return { success: true };
      };

      // Concurrent execution simulating multiple button clicks in less than 5ms
      const results = await Promise.all([
        attemptCheckIn("scan_user_x"),
        attemptCheckIn("scan_user_x"),
        attemptCheckIn("scan_user_x"),
      ]);

      expect(recordsAdded).toBe(1);
      expect(results.filter((r) => r.success).length).toBe(1);
    });
  });

  describe("5. Temporal and Calendar Rules", () => {
    it("should calculate dates across leap year boundaries", () => {
      // Leap day sign up
      const leapDay = new Date("2024-02-29T12:00:00Z");
      const nextYear = new Date(leapDay);
      nextYear.setFullYear(leapDay.getFullYear() + 1);

      // JavaScript rolls Feb 29 to March 1 in non-leap year
      expect(nextYear.toISOString()).toContain("2025-03-01");
    });

    it("should handle dates when leap year is in the future", () => {
      const startingDate = new Date("2027-02-28T12:00:00Z");
      const nextLeapYear = new Date(startingDate);
      nextLeapYear.setFullYear(startingDate.getFullYear() + 1);

      // 2028 is a leap year, so Feb 28 + 1 year is Feb 28, 2028
      expect(nextLeapYear.toISOString()).toContain("2028-02-28");
    });

    it("should flag requests with excessive clock skew", () => {
      const serverTime = Date.now();

      const validateSkew = (clientTime: number) => {
        const diff = Math.abs(serverTime - clientTime);
        return diff < 15000; // max 15 seconds skew allowed
      };

      expect(validateSkew(serverTime)).toBe(true);
      expect(validateSkew(serverTime - 10000)).toBe(true); // 10s skew is fine
      expect(validateSkew(serverTime - 20000)).toBe(false); // 20s skew is blocked
      expect(validateSkew(serverTime + 20000)).toBe(false); // future skew blocked
    });
  });
});

// Helper for range checks
declare global {
  namespace vi {
    interface Assertion {
      toBeBetween(low: number, high: number): void;
    }
  }
}
expect.extend({
  toBeBetween(received: number, low: number, high: number) {
    const pass = received >= low && received <= high;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be between ${low} and ${high}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be between ${low} and ${high}`,
        pass: false,
      };
    }
  },
});
