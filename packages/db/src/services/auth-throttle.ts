import { isIPv4, isIPv6 } from "node:net";
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

/**
 * Codes one client network may be sent per hour: an IPv4 /24 or an IPv6 /64,
 * because one host of a provider's range is as good to an attacker as the next.
 * The deployment-wide cap is shared by everyone, so this is what keeps one
 * client from spending all of it. Venue wifi shares one address among
 * hundreds of people, most of whom sign in with Google or Discord.
 */
export const CODES_PER_NETWORK_PER_HOUR = 40;
/** Codes one email domain may be sent per hour: a catch-all costs nothing. */
export const CODES_PER_DOMAIN_PER_HOUR = 20;
/** The same for a big school or a mail provider, where many people share it. */
export const CODES_PER_LARGE_DOMAIN_PER_HOUR = 120;

/** Mail providers that most of the world's addresses sit behind. */
const LARGE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

const isLargeDomain = (domain: string) =>
  domain.endsWith(".edu") || LARGE_MAIL_DOMAINS.has(domain);

/**
 * The /24 (IPv4) or /64 (IPv6) a client address belongs to, as a row key part.
 * An IPv4 address written as IPv6 is the IPv4 network. Anything unreadable,
 * such as the "unknown" a request with no forwarded address resolves to, shares
 * one bucket, so it cannot be used to dodge the cap.
 */
export function networkOf(ip: string): string {
  const address = ip.trim().split("%")[0] ?? "";
  if (isIPv4(address)) return `${address.split(".").slice(0, 3).join(".")}.0/24`;
  if (!isIPv6(address)) return "unknown";

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped && isIPv4(mapped)) return networkOf(mapped);

  // Fill in what :: stands for, then keep the first four of eight groups.
  const [head = "", tail] = address.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? front
      : [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * The caps a request for a code spends against besides the address's own and
 * the deployment's: the client's network, when the request carried one, and the
 * address's domain. Keys cannot be a real address, which always has an `@`.
 */
export function requesterCodeCaps(
  identifier: string,
  clientIp: string | null | undefined,
): { key: string; max: number }[] {
  const caps: { key: string; max: number }[] = [];
  if (clientIp) {
    caps.push({
      key: `ip:${networkOf(clientIp)}`,
      max: CODES_PER_NETWORK_PER_HOUR,
    });
  }
  const at = identifier.lastIndexOf("@");
  const domain = at === -1 ? "" : identifier.slice(at + 1).toLowerCase();
  if (domain) {
    caps.push({
      key: `domain:${domain}`,
      max: isLargeDomain(domain)
        ? CODES_PER_LARGE_DOMAIN_PER_HOUR
        : CODES_PER_DOMAIN_PER_HOUR,
    });
  }
  return caps;
}

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
