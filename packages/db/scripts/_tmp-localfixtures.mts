import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://postgres:postgres@localhost:5433/neondb" });
await client.connect();

const now = new Date();
const start = new Date(now.getTime() - 86400000);
const end = new Date(now.getTime() + 86400000);

const h = await client.query(
  `insert into hackathon (name, description, start_date, end_date, status, is_public)
   values ('Hacklytics Audit','Audit fixture',$1,$2,'open',true)
   returning id`,
  [start, end],
);
const hackathonId = h.rows[0].id;

const p = await client.query(
  `insert into judging_project (hackathon_id, name, table_number)
   values ($1,'Audit Project',1) returning id`,
  [hackathonId],
).catch(() => ({ rows: [{ id: null }] }));

console.log("RESULT hackathonId=" + hackathonId);
console.log("RESULT projectId=" + p.rows[0].id);
await client.end();
