import { describe, it, expect, vi } from 'vitest';
import { 
  sanitizeInput, 
  validateRequestSize, 
  rateLimit, 
  ddosProtection 
} from './security';
import { TRPCError } from '@trpc/server';

// Mock DB so flushLogs doesn't hit real database when logSecurityEvent is called
vi.mock('@query/db', () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn() },
  auditLogs: {}
}));

describe('Security & Protection Middleware', () => {
  describe('sanitizeInput (XSS & SQLi Protection)', () => {
    it('should sanitize basic XSS payloads', () => {
      // sanitizeHtml strips <script> entirely
      const safe = sanitizeInput('<script>alert("xss")</script>Hello');
      expect(safe).toBe('Hello');
    });

    it('should throw TRPCError on SQL Injection patterns', () => {
      const sqli = "UNION SELECT * FROM users";
      expect(() => sanitizeInput(sqli)).toThrowError(TRPCError);
      expect(() => sanitizeInput(sqli)).toThrowError('Invalid input');
    });

    it('should strip invalid object keys (e.g. NoSQL Injection patterns)', () => {
      const nosqli = { "$where": "sleep(1000)", "valid": "data" };
      const result = sanitizeInput(nosqli);
      // The invalid key "$where" is stripped, "valid" is kept
      expect(result).toEqual({ valid: "data" });
    });

    it('should allow benign complex objects', () => {
      const safeObj = { name: "John Doe", details: { age: 30 } };
      const result = sanitizeInput(safeObj);
      expect(result).toEqual(safeObj);
    });

    it('should throw on deeply nested inputs (Prototype Pollution / Stack Overflow mitigation)', () => {
      const deepObj: any = {};
      let current = deepObj;
      for (let i = 0; i < 15; i++) {
        current.child = {};
        current = current.child;
      }
      expect(() => sanitizeInput(deepObj)).toThrowError('Input too deeply nested');
    });
  });

  describe('validateRequestSize (Payload Limits)', () => {
    it('should allow normal payloads', () => {
      expect(validateRequestSize({ test: 'data' }, 1024)).toBe(true);
    });

    it('should reject overly large payloads', () => {
      const massivePayload = { data: 'a'.repeat(2048) };
      expect(validateRequestSize(massivePayload, 1024)).toBe(false);
    });
  });

  describe('ddosProtection (Burst & Sustained Attacks)', () => {
    it('should allow normal traffic', () => {
      const result = ddosProtection('192.168.1.1');
      expect(result.allowed).toBe(true);
    });

    it('should block IPs that exceed burst limits', () => {
      const maliciousIp = '10.0.0.99';
      let lastResult;
      // Burst threshold is 100 requests in 5 seconds. Let's do 105 requests.
      for (let i = 0; i < 105; i++) {
        lastResult = ddosProtection(maliciousIp);
      }
      expect(lastResult?.allowed).toBe(false);
      expect(lastResult?.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('rateLimit (Token Bucket)', () => {
    it('should allow requests within limit', () => {
      const result = rateLimit('user-1', 10, 1, 1);
      expect(result.allowed).toBe(true);
    });

    it('should block requests when bucket is exhausted', () => {
      const user = 'exhaust-user';
      // Bucket size 2, refill 1/sec
      rateLimit(user, 2, 1, 1);
      rateLimit(user, 2, 1, 1);
      
      // Third immediate request should be blocked
      const result = rateLimit(user, 2, 1, 1);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });
});
