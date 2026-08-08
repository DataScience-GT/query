-- W34 + W12: resumable notification sends.
--
-- Additive only — nothing is dropped and nothing existing is rewritten, so this
-- is safe to apply before the code that uses it ships.
--
-- Run before deploying, then confirm `pnpm --filter @query/db migrate:push`
-- reports "No changes detected."

begin;

-- W34: told-the-interest-list marker, per person. Mirrors
-- hackathon_participant.acceptance_email_sent_at: a send of thousands runs in
-- batches from an admin's browser and has to survive a closed tab.
alter table hackathon_interest
  add column if not exists registration_open_email_sent_at timestamp;

-- W12: an announcement, frozen at compose time.
create table if not exists hackathon_announcement (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references hackathon (id) on delete cascade,
  audience text not null,
  subject text not null,
  heading text not null,
  body text not null,
  cta_label text,
  cta_url text,
  created_by_id text references "user" (id) on delete set null,
  created_at timestamp not null default now()
);

create index if not exists hackathon_announcement_hackathon_id_idx
  on hackathon_announcement (hackathon_id);

-- Its audience, one row per person, with the per-recipient send marker. The
-- unique constraint is what makes "exactly once" a database guarantee rather
-- than an arithmetic one in the browser.
create table if not exists hackathon_announcement_recipient (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null
    references hackathon_announcement (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  email text not null,
  sent_at timestamp,
  failed_at timestamp,
  constraint unique_announcement_recipient unique (announcement_id, user_id)
);

create index if not exists hackathon_announcement_recipient_pending_idx
  on hackathon_announcement_recipient (announcement_id, sent_at);

commit;
