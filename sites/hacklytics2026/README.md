# Hacklytics 2026 (`hacklytics2026`)

Archived static site for Hacklytics 2026 (Golden Byte), built with Astro. No database.

**Full reference:** [docs/sites/hacklytics2026.md](../../docs/sites/hacklytics2026.md)

```bash
pnpm --filter hacklytics2026 dev        # http://localhost:3000
pnpm --filter hacklytics2026 build      # static files -> out/
pnpm --filter hacklytics2026 preview    # serve out/
pnpm --filter hacklytics2026 typecheck  # tsc --noEmit over src/
```

Pages are `src/pages/` (`index.astro`, `404.astro`). The sections are React components rendered at build time; only the navbar, the countdown, the schedule and the FAQ hydrate.
