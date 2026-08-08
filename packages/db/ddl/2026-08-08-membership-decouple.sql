-- W1 + W18: a membership is annual and belongs to a person, not to a hackathon
-- edition. Apply once, against the database `packages/db/src/schemas` describes.
--
-- Run this BEFORE deploying the code that drops the column from the schema, and
-- run it as written — `drizzle-kit push` offers to TRUNCATE when it adds the
-- unique constraint, which would delete every membership.
--
-- Safe to apply only while no user holds two member rows. Check first:
--
--   select user_id, count(*) from member group by user_id having count(*) > 1;
--
-- At the time this was written production had 6 member rows and zero duplicates.
-- If that query returns anything, merge those rows by hand first: keep the one
-- with the latest membership_end_date, and add a membership_history row for each
-- term the merge discards.

begin;

-- The prior term of every existing member, so dropping the edition column does
-- not destroy the only record of which year they joined. membership_history was
-- empty until now (nothing ever wrote it), so there is nothing to reconcile.
insert into membership_history (member_id, action, start_date, end_date, notes)
select
  id,
  'joined',
  membership_start_date,
  membership_end_date,
  'backfilled when membership was decoupled from the hackathon edition'
from member
where not exists (
  select 1 from membership_history h where h.member_id = member.id
);

alter table member drop constraint if exists unique_member_per_hackathon;
drop index if exists member_hackathon_id_idx;
alter table member drop column if exists hackathon_id;
alter table member add constraint unique_member_per_user unique (user_id);

commit;

-- Verify: `pnpm --filter @query/db migrate:push` must report
-- "No changes detected." Anything else means the schema and the database
-- disagree and the next push will offer to fix it destructively.
