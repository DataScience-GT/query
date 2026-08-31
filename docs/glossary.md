# Glossary

| Term | Meaning in this repo |
| --- | --- |
| **query** | This monorepo (`package.json` name). Not a search engine. |
| **Club** | Year-round DSGT operations: membership, club events, bootcamp, club projects. Not keyed by hackathon. |
| **Hackathon / edition** | One `hackathon` row (e.g. Hacklytics 2027) and everything that cascades from it. |
| **Hacklytics** | DSGT’s annual data-science hackathon. Marketing site is `sites/hacklytics2027`; operations are the portal. |
| **Portal** | Authenticated product UI inside `sites/mainweb` route group `(portal)`. |
| **Member** | A `member` row with a **paid, unexpired** year. A lapsed row still exists but `isMember` is false. |
| **Pass** | `member.pass_code` — rotatable QR for club check-in. Independent of membership dates. |
| **Volunteer** | Weakest `admin.role`. Can scan badges (`isScanner`). Cannot pass `isAdmin`. |
| **Staff** | Active admin whose role is not `volunteer`. |
| **Project leader** | `project_leader` row. Runs **club projects**. Not a staff role. |
| **Club project** | `initiative` row. Members apply to join with a pitch and an optional resume. Never judged. Distinct from a hackathon **project**, which is a judged submission. The UI says "club project"; the table is still `initiative`. |
| **Hackathon project** | Team/solo submission (`hackathon_project`). Promoted into `judging_project` for scoring. |
| **Interest** | “Tell me when registration opens” (`hackathon_interest`). Requires a signed-in user. |
| **Current edition** | In-progress hackathon if one exists; otherwise the newest edition that is not `draft` or `announced`. |
| **Announced** | Public landing + interest, registration closed, **not** current for membership resolution. |
| **Wave** | Batch accept of oldest pending applicants; acceptance email is stamped per participant so retries are safe. |
| **Judging queue** | Per-judge ordered tables. `startedAt` is a short claim; `arrivedAt` is the QR scan at the table. |
| **Results snapshot** | `hackathon_result` — frozen placing. Live z-score is only used when computing that snapshot. |
| **Bootcamp term** | String like `2026-fall`. Access checks this, not the never-expiring `bootcamp_member` boolean. |
