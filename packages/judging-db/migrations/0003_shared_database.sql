-- Panel shares the club Postgres database. user, event, and judge already
-- belong to that app, so panel's copies use a prefix. Rename only when the
-- table is the panel one (uuid user id, event.org_id, judge.event_id).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user'
      and column_name = 'id'
      and data_type = 'uuid'
  ) and to_regclass('public.panel_user') is null then
    alter table "user" rename to panel_user;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event'
      and column_name = 'org_id'
  ) and to_regclass('public.panel_event') is null then
    alter table event rename to panel_event;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'judge'
      and column_name = 'event_id'
  ) and to_regclass('public.panel_judge') is null then
    alter table judge rename to panel_judge;
  end if;
end $$;
