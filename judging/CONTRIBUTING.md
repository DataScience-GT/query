# Contributing

Panel is the tree under `judging/`. It does not import the rest of this repository.

## Checks

From the repository root:

```
pnpm --filter @panel/core test
pnpm --filter @panel/server test
pnpm --filter @panel/cli test
pnpm --filter @panel/core lint
pnpm --filter @panel/server lint
pnpm --filter @panel/web lint
pnpm --filter @panel/db typecheck
pnpm --filter @panel/server typecheck
pnpm --filter @panel/web typecheck
pnpm --filter @panel/cli typecheck
```

## Migrations

Schema changes are SQL files in `judging/db/migrations`, applied with `panel migrate`. Do not rename or drop a column in the same change that ships code reading the new shape.

## Pull requests

Describe the behaviour a judge or an organizer will see. Include the command you ran.
