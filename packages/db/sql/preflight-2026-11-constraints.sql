-- Read-only. Counts the rows that would break each constraint proposed for the
-- next schema change, so a constraint is only added where this says 0: adding
-- one that existing rows violate fails the deploy's push.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/preflight-2026-11-constraints.sql
--
-- Runs in a read-only transaction; it cannot change anything.

begin transaction read only;

select check_name, violations from (
  -- user.email is not unique; the auth adapter looks users up by it.
  select 'user.email unique (case-insensitive)' as check_name,
         coalesce(sum(n - 1), 0) as violations
    from (select count(*) n from "user" group by lower(email) having count(*) > 1) d

  -- Child rows whose hackathon_id disagrees with their parent's. A composite
  -- FK (parent_id, hackathon_id) -> parent(id, hackathon_id) would forbid it.
  union all select 'hackathon_participant.team_id same edition', count(*)
    from hackathon_participant c join hackathon_team p on p.id = c.team_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_project.team_id same edition', count(*)
    from hackathon_project c join hackathon_team p on p.id = c.team_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_project.submitted_by_id same edition', count(*)
    from hackathon_project c join hackathon_participant p on p.id = c.submitted_by_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_event_attendee event/participant same edition', count(*)
    from hackathon_event_attendee a
    join hackathon_event e on e.id = a.event_id
    join hackathon_participant p on p.id = a.participant_id
   where e.hackathon_id <> p.hackathon_id
  union all select 'hackathon_point_adjustment.participant_id same edition', count(*)
    from hackathon_point_adjustment c join hackathon_participant p on p.id = c.participant_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_store_purchase.participant_id same edition', count(*)
    from hackathon_store_purchase c join hackathon_participant p on p.id = c.participant_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_store_purchase.item_id same edition', count(*)
    from hackathon_store_purchase c join hackathon_store_item p on p.id = c.item_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'hackathon_check_in_flag.participant_id same edition', count(*)
    from hackathon_check_in_flag c join hackathon_participant p on p.id = c.participant_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judge_assignment.judge_id same edition', count(*)
    from judge_assignment c join judge p on p.id = c.judge_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_entry_member.entry_id same edition', count(*)
    from judging_entry_member c join judging_entry p on p.id = c.entry_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_repo_check.entry_id same edition', count(*)
    from judging_repo_check c join judging_entry p on p.id = c.entry_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_claim_link.member_id same edition', count(*)
    from judging_claim_link c join judging_entry_member p on p.id = c.member_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_entry_challenge entry/challenge same edition', count(*)
    from judging_entry_challenge c
    join judging_entry e on e.id = c.entry_id
    join judging_challenge ch on ch.id = c.challenge_id
   where e.hackathon_id <> c.hackathon_id or ch.hackathon_id <> c.hackathon_id
  union all select 'judging_challenge.parent_id same edition', count(*)
    from judging_challenge c join judging_challenge p on p.id = c.parent_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_room challenge/building same edition', count(*)
    from judging_room c
    join judging_challenge ch on ch.id = c.challenge_id
    left join judging_building b on b.id = c.building_id
   where ch.hackathon_id <> c.hackathon_id or b.hackathon_id <> c.hackathon_id
  union all select 'judging_room_link.room_id same edition', count(*)
    from judging_room_link c join judging_room p on p.id = c.room_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_guest_session link/room same edition', count(*)
    from judging_guest_session c
    join judging_room_link l on l.id = c.link_id
    join judging_room r on r.id = c.room_id
   where l.hackathon_id <> c.hackathon_id or r.hackathon_id <> c.hackathon_id
  union all select 'judging_presence judge/room same edition', count(*)
    from judging_presence c
    join judging_judge j on j.id = c.judge_id
    join judging_room r on r.id = c.room_id
   where j.hackathon_id <> c.hackathon_id or r.hackathon_id <> c.hackathon_id
  union all select 'judging_appointment parents same edition', count(*)
    from judging_appointment c
    join judging_schedule s on s.id = c.schedule_id
    join judging_entry e on e.id = c.entry_id
    join judging_challenge ch on ch.id = c.challenge_id
    join judging_room r on r.id = c.room_id
    left join judging_judge j on j.id = c.assigned_judge_id
   where s.hackathon_id <> c.hackathon_id or e.hackathon_id <> c.hackathon_id
      or ch.hackathon_id <> c.hackathon_id or r.hackathon_id <> c.hackathon_id
      or j.hackathon_id <> c.hackathon_id
  union all select 'judging_evaluation parents same edition', count(*)
    from judging_evaluation c
    join judging_judge j on j.id = c.judge_id
    join judging_entry e on e.id = c.entry_id
    join judging_challenge ch on ch.id = c.challenge_id
   where j.hackathon_id <> c.hackathon_id or e.hackathon_id <> c.hackathon_id
      or ch.hackathon_id <> c.hackathon_id
  union all select 'judging_evaluation_draft parents same edition', count(*)
    from judging_evaluation_draft c
    join judging_judge j on j.id = c.judge_id
    join judging_entry e on e.id = c.entry_id
    join judging_challenge ch on ch.id = c.challenge_id
   where j.hackathon_id <> c.hackathon_id or e.hackathon_id <> c.hackathon_id
      or ch.hackathon_id <> c.hackathon_id
  union all select 'judging_placement.entry_id same edition', count(*)
    from judging_placement c join judging_entry p on p.id = c.entry_id
   where p.hackathon_id <> c.hackathon_id
  union all select 'judging_announcement.room_id same edition', count(*)
    from judging_announcement c join judging_room p on p.id = c.room_id
   where p.hackathon_id <> c.hackathon_id

  -- Ranges the API enforces today, which CHECK constraints would hold in the
  -- database as well.
  union all select 'judging_evaluation_rating.value between 1 and 5', count(*)
    from judging_evaluation_rating where value not between 1 and 5
  union all select 'hackathon end_date >= start_date', count(*)
    from hackathon where end_date < start_date
  union all select 'hackathon_event end_time >= start_time', count(*)
    from hackathon_event where end_time < start_time
  union all select 'judging_schedule window_end > window_start', count(*)
    from judging_schedule where window_end <= window_start
  union all select 'judging_appointment starts <= deadline <= ends', count(*)
    from judging_appointment where not (starts_at <= deadline_at and deadline_at <= ends_at)
  union all select 'hackathon.max_participants > 0', count(*)
    from hackathon where max_participants <= 0
  union all select 'hackathon_team.max_members > 0', count(*)
    from hackathon_team where max_members <= 0
  union all select 'event.max_check_ins > 0', count(*)
    from event where max_check_ins <= 0
  union all select 'initiative.max_members > 0', count(*)
    from initiative where max_members <= 0
  union all select 'hackathon_store_item price >= 0 and stock >= 0', count(*)
    from hackathon_store_item where price < 0 or stock < 0
  union all select 'hackathon_store_purchase quantity > 0, total = unit_price * quantity', count(*)
    from hackathon_store_purchase where quantity <= 0 or unit_price < 0 or total <> unit_price * quantity
  union all select 'hackathon_point_adjustment.delta nonzero, -1000..1000', count(*)
    from hackathon_point_adjustment where delta = 0 or delta not between -1000 and 1000
  union all select 'hackathon_event.points >= 0', count(*)
    from hackathon_event where points < 0
  union all select 'judging_schedule minutes >= 0', count(*)
    from judging_schedule
   where least(setup_minutes, judging_minutes, teardown_minutes,
               same_building_break_minutes, cross_building_break_minutes) < 0
) checks
order by violations desc, check_name;

rollback;
