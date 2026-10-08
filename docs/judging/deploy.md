# Deploy

Judging ships with mainweb. There is no separate service or image: the API is
`/api/panel` in the portal, and the pages are portal routes (see `README.md`).

Before the first event on panel, against the production database:

```
DATABASE_URL=<the club database>
pnpm --filter @query/judging-cli panel migrate
pnpm --filter @query/judging-cli panel doctor
```

Then switch the edition to panel on `/admin/judging`. Nothing goes in the
environment: the event is created from the hackathon row.

`packages/db/drizzle.config.ts` hides the judging tables from the deploy's
`drizzle-kit push` and declares the judging enum types
(`packages/judging-db/src/enums.ts`), so push neither tries to drop them nor
stalls on a prompt.

`PANEL_JWT_SECRET` is only needed for callers outside the portal that send a
bearer token; API keys from `catalog.issueApiKey` work without it.
