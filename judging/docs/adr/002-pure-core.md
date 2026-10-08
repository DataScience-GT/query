# ADR-002: Pure core

## Status

Accepted

## Decision

Every decision Panel makes — the next table, whether a visit is still live,
whether a score is valid, how a set of votes becomes a ranking — is a function
in `@panel/core`. Those functions take plain data, including `now` and a
`random` source, and return plain data. They do not read the clock, generate
randomness, or touch a database, the network, or the filesystem.

The server is the only place that performs I/O. It loads rows, calls the
core, and writes the result in the same transaction as the event log.

## Why

A ranking you cannot recompute from the votes is not a result you can defend.
Tests of the core need no database, so the scoring bugs surface without
standing up Postgres. The same functions can later run offline on an export.
