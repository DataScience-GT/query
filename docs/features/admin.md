# Admin tools

Staff run the club from `/admin`. This page covers who counts as staff, how roles are granted, what the admin router and layout do, the audit trail, and an index of the staff pages with where each is documented. It is for officers who appoint volunteers and for developers adding a staff-only feature.

There is no public admin signup. The first super admin is granted in the database after signing in once; see [Getting started](../getting-started.md). The gates themselves (`isAdmin`, `isScanner`, ...) are explained in [`@query/api`](../packages/api.md).

## Roles

Stored in `admin.role` (`packages/db/src/schemas/admins.ts`), one row per user, with `is_active` and an optional `expires_at`.

| Role | Staff? | What it can do |
| --- | --- | --- |
| `super_admin` | Yes | Everything, including granting any role, setting project leaders, and deleting hackathons |
| `admin` | Yes | Every staff procedure that is not super-admin only. May grant and revoke `volunteer` |
| `moderator` | Yes | Same gates as `admin` (the code treats the three as one tier, `STAFF_ROLES`) |
| `volunteer` | No | Scanner gate only: scan badges and club passes, sell at the store table. Rejected by `isAdmin`. No access to admin pages |
| `bug_tester` | Read-only | Opens every admin page and runs staff queries. Every mutation behind `isAdmin` or `isScanner` is refused |

Details that matter:

- `expires_at` is a fixed-term appointment. `NULL` is standing. An expired row counts as no admin row everywhere, including inside the 60 second role cache, because the check runs after the cache read (`isExpiredAdmin`). The staff page still lists it so the term can be renewed.
- `STAFF_ROLES` is an allow-list on purpose. A role added later is not full staff by default.
- `permissions` is a text array stored on the row and returned by `admin.isAdmin` and the portal context. No procedure reads it to allow or deny anything today.
- Bug testers are held read-only by the middleware's procedure type check (`type !== "query"`), so a new mutation behind `isAdmin` is covered without its author remembering. They also cannot call `admin.findUserByEmail`, since confirming an account exists is not a read-only QA need.

### Who may change roles (`assertMayManage`)

| Caller | May create, update or remove |
| --- | --- |
| `super_admin` | Any role, `permissions`, active flag, term |
| Any other staff | Only `volunteer` rows, and never `permissions` |

Both ends are checked on `update`: the role being set and the role the target holds. Without that, a plain admin could "grant volunteer" to a super admin and demote them. Also enforced:

- You cannot deactivate or remove your own account.
- The last active, unexpired super admin cannot be demoted, deactivated or have a term ended.

Note that the role procedures sit behind `isAdmin` plus this check, not behind `isSuperAdmin`. `isSuperAdmin` is used for initiative `setLeader`, hackathon deletion (`routers/hackathon/crud.ts`) and judge removal (`judge.remove` in `routers/judge/admin.ts`).

## The admin router (`routers/admin.ts`)

| Procedure | Gate | Purpose |
| --- | --- | --- |
| `isAdmin` | protected | `{ isAdmin, role, permissions }` for the caller. Cached 60s. `isAdmin` is false for volunteers, bug testers and expired rows |
| `list` | admin | Staff and volunteers with user details, newest first, max 100. Cached 60s |
| `findUserByEmail` | admin (not bug tester) | Exact email match only, returns the user and any existing admin row. Not a search, so it cannot enumerate accounts |
| `create` | admin + `assertMayManage` | Grants a role to an existing user. Optional `permissions` (max 50, 100 chars each) and `expiresAt`. `BAD_REQUEST` if they already have a row |
| `update` | admin + `assertMayManage` | Role, permissions, `isActive`, `expiresAt` (`null` makes it standing) |
| `remove` | admin + `assertMayManage` | Deletes the row |
| `analyticsOverview` | admin | Participants, club events, live hackathons, and today's hackathon badge scans and club door check-ins. Today starts at midnight Eastern. Cached 15s |
| `hackathonLive` | admin | Per live edition counts (`readLiveHackathons`). Cached 15s |
| `growth` | admin | 12 months of new members and bootcamp enrolments, plus per-term bootcamp totals. Cached 300s |

Every change evicts the target's admin cache keys, `admins:list` and the portal context so the sidebar updates at once, then writes an audit row.

The staff page `/admin/staff` uses `create`, `findUserByEmail`, `list` and `update`. Nothing in the UI calls `remove`; staff are deactivated instead.

## The audit trail

`recordAdminAction(db, { userId, action, resourceId, severity, metadata })` in `middleware/audit.ts` writes to `audit_logs` (`packages/db/src/schemas/security.ts`).

| Severity | Used for |
| --- | --- |
| `info` | Routine staff actions, such as a positive points adjustment |
| `warn` | Role changes, mass emails, negative adjustments, store voids |
| `critical` | Irreversible or forced actions: hand grant/revoke of membership, hackathon delete, deleting an event with check-ins, withdrawing a project in judging, Devpost replace import, reopening a grade, judging resets |

Rules:

- Written **after** the action, never inside its transaction. A failed audit insert inside a Postgres transaction would turn the commit into a silent rollback.
- Best effort. A logging failure is printed to the server log and never fails the action.
- Retention is tied to writes. At most once an hour per process, a write also deletes non-critical rows older than 90 days and critical rows older than 365 days.
- The rate limiter's security events share the table (`middleware/security.ts`).

There is no audit router and no admin page that reads this table. Staff read it with SQL. (The router table in [`@query/api`](../packages/api.md) lists an `audit` namespace, but `src/root.ts` does not mount one.)

Actions recorded include `admin.create`, `admin.update`, `admin.remove`, `member.adminGrant`, `member.adminRevoke`, `points.adjust`, `points.store.voidPurchase`, `points.store.deleteItem`, `hackathon.acceptWave`, `hackathon.sendMassAcceptanceEmails`, and judging actions such as `judging.dismissCheckInFlag`.

## The admin layout

`sites/mainweb/app/(portal)/admin/layout.tsx` renders `components/portal/AdminLayout.tsx`, which wraps every `/admin` page. It reads the portal context, sends signed-out users to login and anyone for whom `canViewAdmin` is false (not staff and not a bug tester) back to `/dashboard`, and shows a "Read-only QA access" banner to bug testers. This is a convenience, not security: every procedure is gated on the server.

The sidebar for staff and bug testers is built in `sites/mainweb/lib/portal-nav.ts`. Bug testers get the same links minus `/lead` and `/admin/staff`.

## Staff pages

| Route | Purpose | Documented in |
| --- | --- | --- |
| `/admin` | Club hub: create and edit events, QR, toggle check-in | [Club events](./events.md) |
| `/admin/attendees` | Per-event attendees | [Club events](./events.md) |
| `/scan/club` | Club attendance charts and the pass scanner | [Club events](./events.md) |
| `/admin/members` | Search, grant, revoke, history | [Membership](./membership.md) |
| `/admin/staff` | Appoint staff, volunteers, bug testers, terms | this page |
| `/admin/analytics` | Overview, live editions, membership growth | this page |
| `/admin/initiatives` | Review proposals, appoint leaders | [Teams](./teams.md) |
| `/admin/subteams` | Subteams and their applicants | [Teams](./teams.md) |
| `/admin/projects` | Hackathon submissions | [Teams](./teams.md) |
| `/admin/hackathons`, `/admin/hackathons/[id]` | Editions, attendees, waves, announcements, events, points and store | [Hackathons](./hackathons.md), [Points](./points.md), [Email](./email.md) |
| `/admin/judging` | Room judging | [Judging](../judging/README.md) |
| `/admin/bootcamp` | Bootcamp attendance and materials | [Bootcamp materials](../bootcamp-materials.md) |
| `/admin/resumes` | Resume book | [Resume book](../resume-book.md) |
| `/admin/setup` | Redirects to `/admin/judging` | none |
| `/scan` | Hackathon door desk, open to volunteers | [Points](./points.md) |

## Adding a staff-only feature

1. Put the procedure behind `isAdmin` (or `isScanner` for door work, `isSuperAdmin` for destructive tier). Never use a bare `protectedProcedure` for staff data; an admin-named procedure that was open to all once shipped.
2. Write it as a query or mutation honestly. Bug testers rely on that.
3. Call `recordAdminAction` after any change that cannot be undone or that grants something.
4. Evict the caches the change touches. `clearMembershipCaches` and `invalidatePortalContext` are in `middleware/cache.ts`.
5. Add a test next to the others in `packages/api/src/.internal-tests/`.

## Code and tests

| What | Where |
| --- | --- |
| Router | `packages/api/src/routers/admin.ts` |
| Gates | `packages/api/src/middleware/procedures.ts`, `types/portal-context.ts` |
| Audit | `packages/api/src/middleware/audit.ts` |
| Schema | `packages/db/src/schemas/admins.ts`, `security.ts` |
| Pages | `sites/mainweb/app/(portal)/admin/`, `components/portal/AdminLayout.tsx` |
| Tests | `.internal-tests/routers.test.ts`, `security.test.ts`, `middleware/cache.test.ts` |
