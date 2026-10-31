# `@query/oxlint-config`

Internal oxlint configs for the monorepo. Packages reach them with a relative
`extends` in their own `.oxlintrc.json`.

| File | Use |
| --- | --- |
| `base.json` | Shared TypeScript rules, type-aware rules on, warnings fail |
| `react.json` | React and React Compiler rules for apps |
| `next.json` | Next.js apps |
| `react-internal.json` | Packages such as `@query/ui` |

The rule lists were generated from what ESLint enforced when the repo moved, so
`correctness` is off and every rule is named here.

See [docs/tooling.md](../../docs/tooling.md).
