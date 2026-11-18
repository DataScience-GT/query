# `@query/oxlint-config`

Internal oxlint configs for the monorepo. Each workspace has an
`oxlint.config.mts` that imports them by package name and passes them to
`extends`:

```ts
import base from "@query/oxlint-config/base.json" with { type: "json" };
import { defineConfig } from "oxlint";

export default defineConfig({ extends: [base] });
```

The `.mts` extension keeps Node from warning in packages without
`"type": "module"`. A JSON `.oxlintrc.json` can only `extends` by relative
path, which is why the workspaces use the TS form.

| File | Use |
| --- | --- |
| `base.json` | Shared TypeScript rules, type-aware rules on, warnings fail |
| `react.json` | React and React Compiler rules for apps |
| `next.json` | Next.js apps |
| `react-internal.json` | Packages such as `@query/ui` |

The rule lists were generated from what ESLint enforced when the repo moved, so
`correctness` is off and every rule is named here.

See [docs/tooling.md](../../docs/tooling.md).
