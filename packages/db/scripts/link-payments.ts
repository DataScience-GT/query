/**
 * Links paid-but-unlinked Stripe payments to the accounts that match them, and
 * grants the membership each one paid for.
 *
 * Sign-in now links automatically, but that only helps people who sign in
 * again. This is the one-off for everyone who already paid — matched strictly
 * on the account's own email, the same proof the sign-in hook uses.
 *
 *   pnpm --filter @query/db tsx scripts/link-payments.ts          # dry run
 *   pnpm --filter @query/db tsx scripts/link-payments.ts --apply  # writes
 *
 * Dry run is the default on purpose: this writes membership records against
 * real payments.
 */
import * as dotenv from "dotenv";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/schemas";
import { stripePayments } from "../src/schemas/stripe";
import { users } from "../src/schemas/auth";
import {
  linkPaidPaymentByVerifiedEmail,
  resolveCurrentHackathonId,
} from "../src/services/membership";
import type { DrizzleDB } from "../src/client";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const APPLY = process.argv.includes("--apply");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as DrizzleDB;

  const hackathonId = await resolveCurrentHackathonId(db);
  if (!hackathonId) {
    console.error(
      "No hackathon resolved — memberships attach to one, so nothing can be granted.",
    );
    await pool.end();
    process.exit(1);
  }
  console.log(`Memberships will be granted against hackathon ${hackathonId}.`);

  // Unlinked paid payments whose email matches exactly one account.
  const candidates = await db
    .select({
      paymentId: stripePayments.id,
      email: stripePayments.customerEmail,
      amount: stripePayments.amountTotal,
      userId: users.id,
      userName: users.name,
    })
    .from(stripePayments)
    .innerJoin(users, sql`lower(${users.email}) = lower(${stripePayments.customerEmail})`)
    .where(
      and(
        isNull(stripePayments.linkedUserId),
        eq(stripePayments.paymentStatus, "paid"),
      ),
    );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(stripePayments)
    .where(
      and(
        isNull(stripePayments.linkedUserId),
        eq(stripePayments.paymentStatus, "paid"),
      ),
    );

  console.log(`\nUnlinked paid payments: ${total}`);
  console.log(`Of those, matched to an account: ${candidates.length}`);
  console.log(`Unmatched (no account with that email): ${total - candidates.length}`);

  if (candidates.length === 0) {
    console.log("\nNothing to do.");
    await pool.end();
    return;
  }

  if (!APPLY) {
    console.log("\n--- DRY RUN, nothing written. Re-run with --apply. ---");
    for (const c of candidates.slice(0, 20)) {
      const masked = c.email.replace(/^(.).*(@.*)$/, "$1***$2");
      console.log(`  ${masked}  $${(c.amount ?? 0) / 100}  -> user ${c.userId}`);
    }
    if (candidates.length > 20) {
      console.log(`  ...and ${candidates.length - 20} more`);
    }
    await pool.end();
    return;
  }

  let linked = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const c of candidates) {
    try {
      // Re-checks "still unlinked" and "user not already linked" inside, so
      // running this twice is safe.
      const outcome = await linkPaidPaymentByVerifiedEmail(db, {
        userId: c.userId,
        email: c.email,
        name: c.userName,
      });
      if (outcome.linked) linked += 1;
      else skipped += 1;
    } catch (error) {
      failures.push(`${c.paymentId}: ${(error as Error).message}`);
    }
  }

  console.log(`\nLinked: ${linked}`);
  console.log(`Skipped (already linked / nothing to claim): ${skipped}`);
  if (failures.length) {
    console.log(`Failed: ${failures.length}`);
    for (const f of failures.slice(0, 20)) console.log("  " + f);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
