import { describe, expect, it } from "vitest";
import { violations } from "./guard-local.ts";

describe("guard-local", () => {
  it("passes with nothing configured, as in CI", () => {
    expect(violations({})).toEqual([]);
  });

  it("allows local and compose-service databases", () => {
    for (const host of [
      "localhost:5434",
      "127.0.0.1:5433",
      "[::1]:5432",
      "db:5432",
    ]) {
      expect(
        violations({ DATABASE_URL: `postgresql://u:p@${host}/neondb` }),
      ).toEqual([]);
    }
  });

  it("refuses a hosted database unless overridden", () => {
    const env = { DATABASE_URL: "postgres://x:y@example.invalid/db" };
    expect(violations(env)).toHaveLength(1);
    expect(violations({ ...env, ALLOW_NON_LOCAL_SERVICES: "1" })).toEqual([]);
  });

  it("refuses a database URL it cannot parse", () => {
    expect(violations({ DATABASE_URL: "not a url" })).toHaveLength(1);
  });

  it("refuses live Stripe keys outside production, with no override", () => {
    for (const key of ["sk_live_abc", "rk_live_abc"]) {
      const env = { STRIPE_SECRET_KEY: key, ALLOW_NON_LOCAL_SERVICES: "1" };
      expect(violations(env)).toHaveLength(1);
      expect(violations({ ...env, NODE_ENV: "production" })).toEqual([]);
    }
    expect(violations({ STRIPE_SECRET_KEY: "sk_test_abc" })).toEqual([]);
  });

  it("refuses a remote SMTP host", () => {
    expect(
      violations({ EMAIL_SERVER_HOST: "smtp.example.invalid" }),
    ).toHaveLength(1);
    expect(violations({ EMAIL_SERVER_HOST: "localhost" })).toEqual([]);
  });

  it("runs only the checks asked for", () => {
    const env = { DATABASE_URL: "postgres://x:y@example.invalid/db" };
    expect(violations(env, ["stripe"])).toEqual([]);
  });
});
