# ADR-001: Standalone product

## Status

Accepted

## Decision

Panel lives under `judging/` with its own packages, its own Postgres database,
and its own deploy. It does not share a schema or a module graph with the
application that hosts the first event.

Internal imports are `@panel/*` only. A lint rule rejects imports from the
host. The host is allowed to import `@panel/*`. That one-way edge is what
makes `git subtree split --prefix=judging` a later extraction rather than a
rewrite.

## Why

Judging welded into one event's tables cannot be given to the next event, or
to anyone else, without carrying the rest of that application with it.
A separate database means the extraction has no data to untangle.
