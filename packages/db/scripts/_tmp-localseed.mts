import pg from "pg";

const url = "postgresql://postgres:postgres@localhost:5433/neondb";
const client = new pg.Client({ connectionString: url });
await client.connect();

const USER = "audit-user-1";
const SESSION = "audit-session-token-1";
const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);

await client.query(
  `insert into "user" (id, name, email, "emailVerified") values ($1,$2,$3, now())
   on conflict (id) do nothing`,
  [USER, "Audit Admin", "audit@gatech.edu"],
);

// Super admin so every /admin page renders instead of redirecting.
await client.query(
  `insert into admin (user_id, role, is_active) values ($1,'super_admin',true)
   on conflict do nothing`,
  [USER],
);

// Database session strategy: the cookie value is this token.
await client.query(`delete from session where "sessionToken" = $1`, [SESSION]);
await client.query(
  `insert into session ("sessionToken", "userId", expires) values ($1,$2,$3)`,
  [SESSION, USER, expires],
);

// A member row so membership-gated views render their real content.
await client.query(
  `insert into member (user_id, first_name, last_name, member_type, is_active,
                       membership_start_date, membership_end_date, renewal_count)
   values ($1,'Audit','Admin','new',true, now(), now() + interval '1 year', 0)
   on conflict (user_id) do nothing`,
  [USER],
);

const counts = await client.query(
  `select (select count(*) from "user")::int as users,
          (select count(*) from session)::int as sessions,
          (select count(*) from admin)::int as admins,
          (select count(*) from member)::int as members`,
);
console.log("RESULT local seed:", JSON.stringify(counts.rows[0]));
await client.end();
