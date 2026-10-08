# Deploy

Judging ships with mainweb. There is no separate service or image: the API is
`/api/panel` in the portal, and the pages are portal routes (see `README.md`).

Before the first event on panel, against the production database:

```
DATABASE_URL=<the club database>
pnpm --filter @query/judging-cli panel migrate
pnpm --filter @query/judging-cli panel doctor
```

Then set `PANEL_EVENT_ID`, `PANEL_ORG_SLUG`, and `PANEL_EVENT_SLUG` in the
mainweb environment (`apphosting.yaml`) and switch the edition's
`judging_backend` to `panel`.

`PANEL_JWT_SECRET` is only needed for callers outside the portal that send a
bearer token; API keys from `catalog.issueApiKey` work without it.
