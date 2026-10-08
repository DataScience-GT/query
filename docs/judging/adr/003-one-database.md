# ADR-003: One database, one server

## Status

Accepted. Supersedes the separate-database sentence in ADR-001.

## Decision

Panel tables live in the same Postgres as the club app. The connection is
`DATABASE_URL`. `PANEL_DATABASE_URL` is read only when that is unset. The
tables that would collide with the club schema are `panel_user`,
`panel_event`, and `panel_judge`.

There is one API process. Redis is optional. When `REDIS_URL` is unset or
Redis fails, that process keeps delivering live updates in memory.

`judging/` stays in this monorepo. Splitting it out, and deleting the legacy
judge UI, wait until an event has run on panel. Sign-in mail waits on
`PANEL_SMTP_URL`. Neither connection is made yet.

## Why

The host is the existing app. A second database and a second API fleet were
the extraction plan, and they are not how this checkout runs. The replay of
the published score fixture still matches `@query/judging-core` `rank()` at pairwise
weight 0, so the scoring check does not need that event.
