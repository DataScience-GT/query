# Deploy

Docker Compose is the deploy to start from. From the repository root:

```
docker compose --profile judging up -d --build
```

Then, against the published Postgres port:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/neondb
PANEL_JWT_SECRET=dev-only-change-me
pnpm --filter @query/judging-cli panel migrate
pnpm --filter @query/judging-cli panel seed demo
pnpm --filter @query/judging-cli panel doctor
```

`panel doctor` must report postgres, migrations, and jwt as ok. Set `DATABASE_URL` to the same Postgres the club app uses. `PANEL_DATABASE_URL` is only read when `DATABASE_URL` is unset. The stack is one API server. Leave `REDIS_URL` unset so live updates stay in that process. Clients that miss a socket message recover from `GET /v1/live`.

The optional GCP module is `packages/judging-server/terraform`. It is not required to run the stack. The server image is `packages/judging-server/Dockerfile` and the web image is `sites/judging/Dockerfile`. Pass `NEXT_PUBLIC_PANEL_URL` at build time so the desk calls the API.

Set `PANEL_SMTP_URL` to an SMTP URL when sign-in codes should be emailed.
Without it, `PANEL_DEV_AUTH=1` returns the code in the response. OIDC waits
on a provider; trusted JWT from the club site is the handoff that works now.
