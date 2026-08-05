/** Temporary, read-only. Delete after use. */
import * as dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  for (const [label, sql] of [
    [
      "duplicate links per user (blocks unique_link_per_user)",
      `select user_id, count(*) from user_account_link group by 1 having count(*) > 1`,
    ],
    [
      "duplicate links per payment (blocks unique_link_per_payment)",
      `select stripe_payment_id, count(*) from user_account_link group by 1 having count(*) > 1`,
    ],
    [
      "row counts",
      `select 'user_account_link' as t, count(*) from user_account_link
       union all select 'stripe_payment', count(*) from stripe_payment
       union all select 'verificationToken', count(*) from "verificationToken"`,
    ],
  ] as const) {
    const { rows } = await pool.query(sql);
    console.log(`\n### ${label}`);
    console.table(rows);
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
