# Hacklytics 2027 (`hacklytics2027`)

Static marketing site for Hacklytics 2027 (Digital Bloom), built with Astro. No database. Interest and registration go to the portal.

**Full reference:** [docs/sites/hacklytics2027.md](../../docs/sites/hacklytics2027.md)

```bash
pnpm --filter hacklytics2027 dev        # http://localhost:3000
pnpm --filter hacklytics2027 build      # static files -> out/
pnpm --filter hacklytics2027 preview    # serve out/
pnpm --filter hacklytics2027 typecheck  # tsc --noEmit over src/
```

Pages are `src/pages/` (`index.astro`, `404.astro`). Most of the site renders at build time and ships no JavaScript; the flower beds are the only React, and each hydrates on its own. The edition (dates, links, copy) is `src/event.config.ts`; the shell and sections come from `@query/event-kit`.
