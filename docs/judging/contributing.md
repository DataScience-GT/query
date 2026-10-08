# Contributing

Panel is `packages/judging-*` plus its portal routes in `sites/mainweb` (listed in `README.md`). `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root cover it with the rest of the repository.

## Checks

From the repository root:

```
pnpm --filter @query/judging-core test
pnpm --filter @query/judging-server test
pnpm --filter @query/judging-cli test
pnpm --filter @query/judging-core lint
pnpm --filter @query/judging-server lint
pnpm --filter web lint
pnpm --filter @query/judging-db typecheck
pnpm --filter @query/judging-server typecheck
pnpm --filter web typecheck
pnpm --filter @query/judging-cli typecheck
```

## Migrations

Schema changes are SQL files in `packages/judging-db/migrations`, applied with `panel migrate`. Do not rename or drop a column in the same change that ships code reading the new shape.

## Pull requests

Describe the behaviour a judge or an organizer will see. Include the command you ran.
