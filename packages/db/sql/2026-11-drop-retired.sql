-- Drops what the schema stopped declaring in the same change as this file.
--
-- Run it against production BEFORE that change deploys. Deploys run
-- `drizzle-kit push < /dev/null`: a declared-but-missing column is created,
-- but an undeclared-but-present one is a DROP, which push will only do after a
-- prompt the build cannot answer. It then exits 0 having applied nothing, and
-- every later schema change is silently skipped until the drop happens.
--
-- Nothing in the app reads or writes any of these:
--   event.current_check_ins, hackathon_team.current_members,
--   hackathon.current_participants  counters, now counted from rows
--   event.members_only               check-in is open to everyone signed in
--   hackathon.judging_backend        retired panel judging switch
--   bootcamp_material                superseded by bootcamp_workshop
--   judge_queue                      retired pool-judging visit log
--
-- Irreversible: the dropped data is gone. One transaction, so a failure
-- changes nothing. IF EXISTS makes a second run a no-op.

begin;

alter table "event" drop column if exists "current_check_ins";
alter table "event" drop column if exists "members_only";
alter table "hackathon_team" drop column if exists "current_members";
alter table "hackathon" drop column if exists "current_participants";
alter table "hackathon" drop column if exists "judging_backend";
drop table if exists "bootcamp_material";
drop table if exists "judge_queue";

commit;
