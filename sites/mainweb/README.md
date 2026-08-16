# Main website (`web`)

Public DSGT site and the authenticated portal (Next.js App Router on port 3001).

**Full reference:** [docs/sites/mainweb.md](../../docs/sites/mainweb.md)

```bash
pnpm --filter web dev      # http://localhost:3001
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web typecheck
```

The portal is the `(portal)` route group in this app, not a separate workspace. tRPC, NextAuth, and the Stripe webhook all live here.
