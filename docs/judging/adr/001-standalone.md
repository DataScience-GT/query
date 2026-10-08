# ADR-001: Standalone product

## Status

Superseded. Panel's packages are ordinary monorepo workspaces
(`packages/judging-*`, `sites/judging`) under the `@query/*` scope. The import
boundary and the plan to split it out were dropped.

## Decision

Panel lives under `judging/` with its own packages and its own deploy. It does
not share a module graph with the application that hosts the first event.
ADR-003 puts the tables in that application's Postgres instead of a second
database.

Internal imports are `@panel/*` only. A lint rule rejects imports from the
host. The host is allowed to import `@panel/*`. That one-way edge is what
makes `git subtree split --prefix=judging` a later extraction rather than a
rewrite.

## Why

Judging welded into one event's tables cannot be given to the next event, or
to anyone else, without carrying the rest of that application with it.
The panel tables are prefixed so they can share that database until an
extraction.
