import { isIPv4, isIPv6 } from "node:net";
import { sql } from "drizzle-orm";

// Database-backed caps on email sign-in codes. In-memory limiters are per
// Cloud Run instance (up to 10), so these are the limits that actually hold.

/** Codes one address may be sent per hour. */
export const CODES_PER_IDENTIFIER_PER_HOUR = 5;
/**
 * Wrong guesses one address absorbs, across reissued codes, before it is locked
 * out of guessing. They count within 24 hours and start again after a lock.
 */
export const FAILURES_BEFORE_LOCKOUT = 20;
/** How long the first lock lasts. Each one after it lasts twice as long. */
export const FIRST_LOCKOUT_MINUTES = 15;
/** The longest a lock lasts, however many came before it. */
export const MAX_LOCKOUT_HOURS = 24;
/**
 * Code emails the whole deployment sends per hour. A loop over many addresses
 * would otherwise drain the SMTP quota one address at a time; 300 is well above
 * real sign-in traffic.
 */
export const GLOBAL_CODES_PER_HOUR = 300;
/** Row key for the deployment-wide counter; not a valid email address. */
export const GLOBAL_THROTTLE_KEY = "*global*";
/**
 * Of the deployment's hour, what addresses with no account yet may use. Anyone
 * can ask for a code for an address that does not exist, and the mailbox's
 * quota is shared, so the rest stays for people who have signed in before.
 */
export const NEW_ADDRESS_CODES_PER_HOUR = 200;
/** Row key for that share of the hour; not a valid email address. */
export const NEW_ADDRESS_THROTTLE_KEY = "*global-new*";

/**
 * Codes one client network may be sent per hour: an IPv4 /24 or an IPv6 /48,
 * because one host of a provider's range is as good to an attacker as the next.
 * A site is routinely given a /48 and a host there can pick any of its 65,536
 * /64s, so a /64 would be a cap of its own for every one of them.
 * The deployment-wide cap is shared by everyone, so this is what keeps one
 * client from spending all of it. Venue wifi shares one address among
 * hundreds of people, most of whom sign in with Google or Discord.
 */
export const CODES_PER_NETWORK_PER_HOUR = 40;
/**
 * Codes one client network may be sent per hour for addresses that already have
 * an account. Much higher than for strangers, because on judging or check-in day
 * a whole venue shares one address and nearly everyone there applied. Not
 * unlimited, because an account costs an attacker one code on a catch-all
 * domain, and about 60 of them would take the deployment's whole 300 an hour.
 */
export const CODES_PER_KNOWN_NETWORK_PER_HOUR = 150;
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
 * The /24 (IPv4) or /48 (IPv6) a client address belongs to, as a row key part.
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

  // Fill in what :: stands for, then keep the first three of eight groups.
  const [head = "", tail] = address.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? front
      : [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back];
  return `${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/48`;
}

/**
 * Whether an address already has an account. Case-blind, like the sign-in that
 * finds one; served by user_email_lower_unique_idx.
 */
export async function hasAccount(
  tx: Executor,
  identifier: string,
): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT 1 FROM "user" WHERE lower("email") = ${identifier} LIMIT 1
  `);
  return res.rows.length > 0;
}

/**
 * The caps a request for a code spends against besides the address's own and
 * the deployment's: the client's network, when the request carried one, and the
 * address's domain. Keys cannot be a real address, which always has an `@`.
 *
 * The domain cap, and the network's hour at 40, are for addresses with no
 * account. They exist because a catch-all or a made-up address costs an attacker
 * nothing, and they must not work the other way round: fake addresses at
 * gatech.edu filling its cap would otherwise lock out everyone who signs in
 * there by code. An address that has an account is held to a network bucket of
 * its own instead (`ip-known:`, 150 an hour), so a venue sharing one address
 * still gets in and one network still cannot take the deployment's whole hour.
 * They keep the per-address cap, the lockout and the deployment's cap too.
 */
export function requesterCodeCaps(
  identifier: string,
  clientIp: string | null | undefined,
  options: { existingUser?: boolean } = {},
): { key: string; max: number }[] {
  const caps: { key: string; max: number }[] = [];
  if (options.existingUser) {
    if (clientIp) {
      caps.push({
        key: `ip-known:${networkOf(clientIp)}`,
        max: CODES_PER_KNOWN_NETWORK_PER_HOUR,
      });
    }
    return caps;
  }
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

/** True while an address is locked out of guessing at its codes. */
export async function isLockedOut(
  tx: Executor,
  identifier: string,
): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT 1 FROM "auth_code_throttle"
    WHERE "identifier" = ${identifier} AND "locked_until" > now()
    LIMIT 1
  `);
  return res.rows.length > 0;
}

/**
 * Charges one failed guess to the address, whichever code it was aimed at.
 * Anyone can ask for a code for any address and then guess at it, so a lock
 * that stays a day lets a stranger keep the owner out. This one starts at
 * FIRST_LOCKOUT_MINUTES and doubles each time it comes round again, to
 * MAX_LOCKOUT_HOURS, and clearFailures ends it when the owner signs in some
 * other way. Failures count afresh after each lock, so the guesses an address
 * gets in a day are still bounded: 20 at a time, further apart each time.
 */
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
  // A second statement reads the count the first one left: a row that reached
  // the cap is locked, and the next lock lasts twice as long as this one.
  await tx.execute(sql`
    UPDATE "auth_code_throttle" SET
      "locked_until" = now() + least(
        interval '1 minute' * ${FIRST_LOCKOUT_MINUTES}::int * power(2, "lockouts"),
        interval '1 hour' * ${MAX_LOCKOUT_HOURS}::int
      ),
      "lockouts" = least("lockouts" + 1, 16),
      "failures" = 0,
      "failure_window_start" = now()
    WHERE "identifier" = ${identifier} AND "failures" >= ${FAILURES_BEFORE_LOCKOUT}
  `);
}

/**
 * Forgets an address's wrong guesses and any lock, and starts the backoff over.
 * For a successful sign-in by any method: the person who owns the address is in.
 */
export async function clearFailures(
  tx: Executor,
  identifier: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE "auth_code_throttle"
    SET "failures" = 0, "lockouts" = 0, "locked_until" = NULL
    WHERE "identifier" = ${identifier}
  `);
}
