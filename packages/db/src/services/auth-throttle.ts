import { sql } from "drizzle-orm";

// Database-backed caps on email sign-in codes. In-memory limiters are per
// Cloud Run instance (up to 10), so these are the limits that actually hold.

/** Codes one address may be sent per hour. */
export const CODES_PER_IDENTIFIER_PER_HOUR = 5;
/** Wrong guesses one address absorbs per 24 hours, across reissued codes. */
export const FAILURES_PER_IDENTIFIER_PER_DAY = 20;
/**
 * Code emails the whole deployment sends per hour. A loop over many addresses
 * would otherwise drain the SMTP quota one address at a time; 300 is well above
 * real sign-in traffic.
 */
export const GLOBAL_CODES_PER_HOUR = 300;
/** Row key for the deployment-wide counter; not a valid email address. */
export const GLOBAL_THROTTLE_KEY = "*global*";

// The slice of a drizzle db/transaction these helpers need.
type Executor = {
  // Variadic: drizzle 1.0 overloads execute() by mode, so a one-argument
  // signature no longer matches. Callers read `.rows` off the raw driver result.
  // oxlint-disable-next-line typescript/no-explicit-any
  execute: (...args: any[]) => PromiseLike<any>;
};

/**
 * Takes one code-issuance slot for `key`. One atomic statement, so concurrent
 * instances cannot both slip under the cap. False when the hour's cap is spent.
 */
export async function takeCodeSlot(
  tx: Executor,
  key: string,
  maxPerHour: number,
): Promise<boolean> {
  const res = await tx.execute(sql`
    INSERT INTO "auth_code_throttle" AS t ("identifier", "issue_window_start", "codes_issued")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("identifier") DO UPDATE SET
      "issue_window_start" = CASE
        WHEN t."issue_window_start" < now() - interval '1 hour' THEN now()
        ELSE t."issue_window_start" END,
      "codes_issued" = CASE
        WHEN t."issue_window_start" < now() - interval '1 hour' THEN 1
        ELSE t."codes_issued" + 1 END
    WHERE t."issue_window_start" < now() - interval '1 hour'
       OR t."codes_issued" < ${maxPerHour}
    RETURNING 1
  `);
  return res.rows.length > 0;
}

/** True once an address has used up its failed guesses for the day. */
export async function isLockedOut(
  tx: Executor,
  identifier: string,
): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT 1 FROM "auth_code_throttle"
    WHERE "identifier" = ${identifier}
      AND "failure_window_start" > now() - interval '24 hours'
      AND "failures" >= ${FAILURES_PER_IDENTIFIER_PER_DAY}
    LIMIT 1
  `);
  return res.rows.length > 0;
}

/** Charges one failed guess to the address, whichever code it was aimed at. */
export async function recordFailure(
  tx: Executor,
  identifier: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO "auth_code_throttle" AS t ("identifier", "failure_window_start", "failures")
    VALUES (${identifier}, now(), 1)
    ON CONFLICT ("identifier") DO UPDATE SET
      "failure_window_start" = CASE
        WHEN t."failure_window_start" < now() - interval '24 hours' THEN now()
        ELSE t."failure_window_start" END,
      "failures" = CASE
        WHEN t."failure_window_start" < now() - interval '24 hours' THEN 1
        ELSE t."failures" + 1 END
  `);
}
