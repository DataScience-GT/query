# `@query/api`

tRPC application layer. The Next.js route `sites/mainweb/app/(portal)/api/trpc/[trpc]/route.ts` mounts `appRouter` with `createContext`.

Package: `packages/api`  
Exports: `.`, `./context`, `./trpc`, `./pricing`, plus a few middleware paths (see `package.json`).

## Router map

`src/root.ts` composes:

| Namespace | Source | Purpose |
| --- | --- | --- |
| `user` | `routers/user.ts` | Session user, portal context, profile + image |
| `admin` | `routers/admin.ts` | Staff directory, create/update/remove admins, analytics overview |
| `member` | `routers/member.ts` | Membership profile, pass, admin grant/revoke/search |
| `hackathon` | `routers/hackathon/*` | Editions, registration, interest, events, content, announcements, staff ops |
| `events` | `routers/events.ts` | Club events and QR check-in |
| `judge` | `routers/judge/*` | Judge portal, rankings/results, admin judging |
| `stripe` | `routers/stripe.ts` | Checkout, PaymentIntent, link, reconcile |
| `audit` | `routers/audit.ts` | Audit log list (admin) |
| `team` | `routers/team.ts` | Teams and project submission |
| `initiative` | `routers/initiative.ts` | Club initiatives, applications, proposals, leaders |
| `bootcamp` | `routers/bootcamp.ts` | Member progress + admin attendance |

Hackathon and judge are `mergeRouters` of several files so procedure names stay flat (`hackathon.register`, not `hackathon.registration.register`).

## Procedure kinds

Defined in `src/trpc.ts` and `src/middleware/procedures.ts`.

| Kind | Auth | Extra |
| --- | --- | --- |
| `publicProcedure` | Optional session | Requires DB, scrub markup, content-type, DDoS + public rate limit |
| `protectedProcedure` | Signed-in | Same sanitizer + authenticated rate limit + mutation cache invalidation |
| `uploadProcedure` | Signed-in | 2MB payload cap; skips recursive markup scrub (base64 images) |
| `isScanner` | Active `admin` row | Volunteers included. Badge / door scanning only |
| `isAdmin` | Active staff `admin` | Rejects `volunteer` |
| `isSuperAdmin` | `role === "super_admin"` | Staff create/remove, judge activate/remove, set project leader |
| `isJudge` | Active `judge` for the resolved hackathon | Resolves edition from input `hackathonId` / `projectId` / `queueId`, else current edition |
| `isProjectLeader` | Active `project_leader` **or** staff | Staff can cover a quiet leader; leaders cannot use this to pass `isAdmin` |

There is deliberately **no** `adminProcedure` that equals `protectedProcedure`. That name shipped open admin endpoints in the past.

`callerIsAdmin` is a helper for public queries that widen their payload for staff. It caches negatives so ordinary attendees are not a `admins` round-trip per request.

## Hackathon procedures

**CRUD** (`crud.ts`)

| Procedure | Gate | Notes |
| --- | --- | --- |
| `list` | public | Visible editions |
| `listAll` | admin | Includes drafts |
| `getById` | public | Drafts 404 for non-staff |
| `create` / `update` | admin | Unique edition name |
| `delete` | super admin | Cascades teams, participants, votes, … |

**Registration** (`registration.ts`)

| Procedure | Gate |
| --- | --- |
| `register` | protected |
| `myRegistrations` | protected |
| `participants` | public (staff-widened) |

**Staff / door** (`admin.ts`)

| Procedure | Gate |
| --- | --- |
| `adminGetAttendees`, `adminGetAttendeeIds`, `exportAttendees` | admin |
| `updateParticipantStatus`, `batchUpdateParticipantStatus` | admin |
| `waveStatus`, `acceptWave`, `sendMassAcceptanceEmails` | admin |
| `analytics` | admin |
| `getEventAttendees`, `removeEventAttendance`, `scanParticipantPass` | scanner |

Batch status updates allow up to **2500** ids. The global array cap in `scrubMarkup` matches that; lowering it makes the advertised `.max(2500)` unreachable.

**Weekend events** (`events.ts`): `createEvent` / `updateEvent` / `deleteEvent` (admin), `getEvents` (public).

**Content** (`content.ts`): public results and project gallery; `myParticipantRecord`; admin update/withdraw project. Child reads go through `assertHackathonVisible` so a draft uuid does not leak schedule or submissions.

**Interest** (`interest.ts`): public `getUpcoming`; protected register/withdraw/myInterest; admin list + “registration is open” mail.

**Announcements** (`announce.ts`): audience counts, list, create, `sendBatch`.

## Judge procedures

**Portal** (`portal.ts`): `isJudge`, assignments, applications, QR start, next table, vote, skip, overtime skip, progress. `toggleJudging` is admin.

**Rankings** (`rankings.ts`): `getRankings`, `computeResults`, draft/publish/unpublish. Results are a **frozen snapshot** (`hackathon_result`), not a live z-score on every page load.

**Admin** (`admin.ts`): CRUD judges, promote submissions into judging tables, initialize queues, assign tracks/projects, table cards, live progress, analytics. `setActive` and `remove` are super admin. `register` is protected (apply to judge).

## Club procedures (selected)

**Members:** `me`, `register`, `update`, `history`, `myPass`, `rotatePass`, `checkStatus`; admin `list`, `getById`, `adminSearch`, `adminHistory`, `adminGrant`, `adminRevoke`.

**Events:** admin CRUD + QR regenerate; public `list`; member `checkIn`, `myEvents`, `myStats`; scanner `manualCheckIn`, `scanMemberPass`, `attendees`, `removeAttendance`.

**Initiatives:** leaders `listMine`, `getById`, `create`, `update`, `setStatus`, `setArchived`, `decide`; members `list`, apply/withdraw, propose; admin proposal review; super admin `setLeader`.

**Stripe:** checkout session, payment intent, confirm after pay, auto-link, reconcile, pending check, manual link, get linked payment.

## Context

`src/context.ts`: `{ db, session, userId, cache, clientIp, req }`. Auth is lazy-imported so tests can run without NextAuth. IP comes from `X-Forwarded-For` with `TRUSTED_PROXY_HOPS` (see [Security](../operations/security.md)).

## Services

- `services/portal-context.ts` — `getPortalContext` payload: staff vs volunteer, judge, project leader, paid membership vs lapsed. Registers `setMembershipChangeHandler` so sign-in grants evict the “not a member” cache.
- `services/pricing.ts` — membership and bootcamp cents; `priceForCents`, `formatCents`, `MAX_MEMBERSHIP_CHARGE_CENTS`.
- `types/portal-context.ts` — `PortalContext`, `MemberContext`, `isStaffRole`.

## Tests

```bash
pnpm --filter @query/api test
```

Includes colocated `*.test.ts` and `src/.internal-tests/` (hackathon flow, Stripe, QR, security, resilience, judges, initiatives, bootcamp, announcements).
