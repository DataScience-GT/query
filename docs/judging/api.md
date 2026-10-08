# API

`GET /openapi.json` is the route list (OpenAPI 3.0.3). The same procedures are also mounted at `/trpc`.

Send `Authorization: Bearer` with a JWT from `POST /v1/auth/verify`, or with an API key from `catalog.issueApiKey`. A key whose scopes include `import`, `export`, or `webhooks` acts as an organizer. A revoked key is rejected.

These routes do not require a token:

- `GET /healthz`, `GET /readyz`, `GET /metrics`, `GET /openapi.json`
- `POST /v1/auth/magic-link` and `POST /v1/auth/verify`
- `GET /v1/public/{orgSlug}/{eventSlug}`
- `GET /v1/live/{orgSlug}/{eventSlug}`
- `GET /v1/feedback/{token}`

`GET /v1/results/{eventId}` requires a bearer token and returns 403 until results are published. Feedback returns 403 for an unknown token and before publish.

Live clients connect to `/ws?channel=event:{eventId}:board`. The channels are `event:{id}:board`, `event:{id}:leaderboard`, and `judge:{id}`.
