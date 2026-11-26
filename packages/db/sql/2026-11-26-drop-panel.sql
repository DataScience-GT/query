-- The retired panel judging service's tables and enum types, which it created
-- with its own SQL migrations. Nothing in the app read them; drizzle.config.ts
-- excluded them from push until this drop. Ran against production on
-- 2026-11-26 after a pg_dump of the 27 tables (kept offline by the owner).
--
-- Irreversible. One transaction and no CASCADE, so anything still depending on
-- these makes the whole statement fail and change nothing.

begin;

drop table public.api_key, public.comparison, public.criterion,
  public.event_config, public.event_log, public.floor_table,
  public.judge_identity, public.login_code, public.membership,
  public.organization, public.outbox, public.panel_event, public.panel_judge,
  public.panel_migration, public.panel_user, public.prize, public.project,
  public.project_track, public.result, public.result_run, public.rubric,
  public.track, public.visit, public.vote, public.vote_score, public.webhook,
  public.zone;

drop type public.event_phase, public.track_kind, public.dispatch_strategy,
  public.judge_status, public.comparison_outcome, public.membership_role;

commit;
