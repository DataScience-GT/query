import { describe, it, expect, vi } from "vitest";
import {
  sanitizeInput,
  validateRequestSize,
  rateLimit,
  ddosProtection,
} from "../middleware/security";
import { TRPCError } from "@trpc/server";

vi.mock("@query/db", () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn() },
  auditLogs: {},
}));

describe("Security and Protection Verification Suite", () => {
  describe("1. Input Sanitization - XSS Vulnerability Protections", () => {
    it("should drop script tags completely", () => {
      const result = sanitizeInput('<script>alert("xss")</script>hello');
      expect(result).toBe("hello");
    });

    it("should sanitize image tag onerror events", () => {
      try {
        const result = sanitizeInput(
          '<img src="invalid.jpg" onerror="alert(1)">',
        );
        expect(result).not.toContain("onerror");
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
      }
    });

    it("should sanitize svg onload actions", () => {
      try {
        const result = sanitizeInput('<svg onload="javascript:alert(1)">');
        expect(result).not.toContain("onload");
        expect(result).not.toContain("javascript");
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
      }
    });

    it("should block explicit javascript protocol references", () => {
      const payload = 'javascript:alert("hacked")';
      expect(() => sanitizeInput(payload)).toThrowError(TRPCError);
    });

    it("should clean nested script evasion attempts", () => {
      const result = sanitizeInput('<<SCRIPT>alert("xss");//</SCRIPT>');
      expect(result).not.toContain("<script");
      expect(result).not.toContain("SCRIPT");
    });

    it("should handle benign inputs with brackets safely", () => {
      const result = sanitizeInput(
        "This is a text with < than and > than symbols.",
      );
      expect(result).toBe(
        "This is a text with &lt; than and &gt; than symbols.",
      );
    });
  });

  describe("2. Input Sanitization - SQL Injection Protections", () => {
    it("should block classic union select injections", () => {
      const payload = "1 UNION SELECT username, password FROM users";
      expect(() => sanitizeInput(payload)).toThrowError(TRPCError);
    });

    it("should block SQL query stacking comments", () => {
      const payload = "DROP TABLE hackathons; -- ";
      expect(() => sanitizeInput(payload)).toThrowError(TRPCError);
    });

    it("should block block-comment SQL injection style", () => {
      const payload = "SELECT * FROM events /* check comments */ WHERE id = 1";
      expect(() => sanitizeInput(payload)).toThrowError(TRPCError);
    });

    it("should block case-insensitive SQL keywords combinations", () => {
      const payload = "uNiOn SeLeCt secret FROM credentials";
      expect(() => sanitizeInput(payload)).toThrowError(TRPCError);
    });
  });

  describe("3. Input Sanitization - NoSQL Query Injection Protections", () => {
    it("should filter out the where MongoDB operator", () => {
      const payload = { $where: 'this.role == "admin"' };
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(result.$where).toBeUndefined();
    });

    it("should filter out gt and lt MongoDB operators", () => {
      const payload = { $gt: "0", $lt: "100", validKey: "data" };
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(result.$gt).toBeUndefined();
      expect(result.$lt).toBeUndefined();
      expect(result.validKey).toBe("data");
    });

    it("should filter out ne and eq MongoDB operators", () => {
      const payload = { $ne: "admin", $eq: "user", username: "guest" };
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(result.$ne).toBeUndefined();
      expect(result.$eq).toBeUndefined();
      expect(result.username).toBe("guest");
    });
  });

  describe("4. Input Sanitization - Prototype Pollution Protections", () => {
    it("should drop proto key assignments", () => {
      const payload = JSON.parse(
        '{"__proto__": {"maliciousProperty": "injected"}}',
      );
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(
        false,
      );
      expect(({} as any).maliciousProperty).toBeUndefined();
    });

    it("should drop constructor key assignments", () => {
      const payload = JSON.parse(
        '{"constructor": {"prototype": {"polluted": "yes"}}}',
      );
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(
        false,
      );
      expect(({} as any).polluted).toBeUndefined();
    });

    it("should drop prototype key assignments", () => {
      const payload = { prototype: { admin: true }, username: "normal" };
      const result = sanitizeInput(payload) as Record<string, any>;
      expect(Object.prototype.hasOwnProperty.call(result, "prototype")).toBe(
        false,
      );
      expect(result.username).toBe("normal");
    });
  });

  describe("5. Input Sanitization - Complexity & Deep Nesting Limits", () => {
    const makeNestedObject = (depth: number): any => {
      if (depth === 0) return "leaf";
      return { node: makeNestedObject(depth - 1) };
    };

    it("should allow object nesting level equal to 9", () => {
      const payload = makeNestedObject(9);
      expect(sanitizeInput(payload)).toBeDefined();
    });

    it("should allow object nesting level equal to 10", () => {
      const payload = makeNestedObject(10);
      expect(sanitizeInput(payload)).toBeDefined();
    });

    it("should reject object nesting level equal to 11", () => {
      const payload = makeNestedObject(11);
      expect(() => sanitizeInput(payload)).toThrowError(
        "Input too deeply nested",
      );
    });

    it("should allow objects with exactly 50 keys", () => {
      const payload: Record<string, number> = {};
      for (let i = 0; i < 50; i++) {
        payload[`key_${i}`] = i;
      }
      expect(sanitizeInput(payload)).toBeDefined();
    });

    it("should reject objects with more than 50 keys", () => {
      const payload: Record<string, number> = {};
      for (let i = 0; i < 51; i++) {
        payload[`key_${i}`] = i;
      }
      expect(() => sanitizeInput(payload)).toThrowError("Object too complex");
    });

    it("should allow arrays with exactly 500 elements", () => {
      const payload = new Array(500).fill("valid");
      expect(sanitizeInput(payload)).toBeDefined();
    });

    it("should reject arrays with more than 500 elements", () => {
      const payload = new Array(501).fill("invalid");
      expect(() => sanitizeInput(payload)).toThrowError("Array too large");
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
