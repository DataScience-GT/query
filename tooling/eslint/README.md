# `@query/eslint-config`

Internal ESLint configs for the monorepo.

| Export | Use |
| --- | --- |
| `@query/eslint-config/base` | `base.js` — shared TypeScript rules |
| `@query/eslint-config/next-js` | `next.js` — Next.js apps |
| `@query/eslint-config/react` | `react.js` |
| `@query/eslint-config/react-internal` | `react-internal.js` — packages such as `@query/ui` |

App packages run `eslint . --max-warnings 0`.

See [docs/tooling.md](../../docs/tooling.md).
