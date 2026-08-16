# Hacklytics 2027 (`hacklytics2027`)

Static marketing site for Hacklytics 2027 (Digital Bloom). No database. Interest and registration go to the portal.

**Full reference:** [docs/sites/hacklytics2027.md](../../docs/sites/hacklytics2027.md)

```bash
pnpm --filter hacklytics2027 dev    # http://localhost:3000
pnpm --filter hacklytics2027 build  # static export → out/
pnpm --filter hacklytics2027 e2e    # Playwright
```

Outbound links are centralized in `lib/links.ts`.
