# Deploy

Docker Compose is the deploy to start from. From the repository root:

```
docker compose -f judging/infra/docker/docker-compose.yml up --build
```

Then, against the published Postgres port:

```
DATABASE_URL=postgres://panel:panel@localhost:54329/panel
PANEL_JWT_SECRET=dev-only-change-me
pnpm --filter @panel/cli panel migrate
pnpm --filter @panel/cli panel seed demo
pnpm --filter @panel/cli panel doctor
```

`panel doctor` must report postgres, migrations, and jwt as ok. Set `DATABASE_URL` to the same Postgres the club app uses. `PANEL_DATABASE_URL` is only read when `DATABASE_URL` is unset. The stack is one API server. Leave `REDIS_URL` unset so live updates stay in that process. Clients that miss a socket message recover from `GET /v1/live`.

The optional GCP module is `judging/infra/gcp`. It is not required to run the stack. The web image is `judging/infra/docker/Dockerfile.web`. Pass `NEXT_PUBLIC_PANEL_URL` at build time so the desk calls the API.

Set `PANEL_SMTP_URL` to an SMTP URL when sign-in codes should be emailed.
Without it, `PANEL_DEV_AUTH=1` returns the code in the response. OIDC waits
on a provider; trusted JWT from the club site is the handoff that works now.
