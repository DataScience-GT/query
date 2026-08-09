-- D4: remove the points system.
--
-- Every club check-in carried the schema default (10) because nothing ever
-- wrote another value, and the attendee CSV exported that constant under a
-- "Points" column — a fabricated number presented as data. The hackathon
-- schedule's `+N pts` badges were admin-entered and accumulated nowhere.
--
-- Nothing reads any of these columns, so dropping them loses no information
-- that was ever recorded. Apply after deploying the code that stops selecting
-- them, or together with it.

begin;

alter table event drop column if exists points_value;
alter table event_check_in drop column if exists points_earned;
alter table hackathon_event drop column if exists points;

commit;

-- Verify: `pnpm --filter @query/db migrate:push` must report
-- "No changes detected."
