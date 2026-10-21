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
| `judge` | `routers/judge/*` | Judge roster: apply, approve, add, remove |
| `judging` | `routers/judging/*` | Room judging: `admin`, `schedule`, `desk`, `hacker`, `results` |
| `points` | `routers/points/*` | Hackathon points: `admin`, `store`, `me` |
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

**Portal** (`portal.ts`): `isJudge` (for the named or current edition), `myApplications`, `register` (apply to judge).

**Admin** (`admin.ts`): `list`, `create` (add by email), `setActive` (approve or suspend), `remove` (super admin).

Judging itself is the `judging` namespace; its shared helpers are in `services/judging/` (`room-link`, `scope`, `scoring`, `config`). `hackathon.getResults` returns published placings from both the retired `hackathon_result` table and `judging_placement`, in one shape. It leaves out entries pulled from judging (`deleted_at`) or from prizes (`prize_ineligible_at`, set by `judging.admin.setPrizeEligibility`). Check-in rule-break flags (`services/check-in-flags.ts`) reach organisers through `judging.admin.listEntries` and `judging.results.list`, and judges through `judging.desk` as a bare `flagged` boolean; no hacker-facing, public or cached procedure returns them.

Placings rank on scores adjusted for judge bias (`services/judging/calibration.ts`): each evaluation is calibrated within its root challenge for its judge's strictness, spread and drift, on the assumption that `judging.desk.nextProject` (`services/judging/queue.ts`) hands every judge a random sample of projects. `judging_placement.raw_score` keeps the plain mean; only `judging.results.list` (organisers) returns it and the per-judge calibration, and `judging.desk` stays on raw means. An evaluation counts when it holds a rating for every rating item (`scoring.hasEveryRating`, and `scoring-sql.holdsEveryRating` where the database counts), whether or not a written response is missing, so a draft submitted at the hard end still places its project. Organiser counts, the board and hacker itinerary status, hacker feedback, and the desk's scores, judged count and shortlist all use that rule. `judging.results.list` keeps the calibration for 60 seconds per edition, keyed on the edition's evaluation count and latest save and on its ranked entries, while `judging.results.compute` always calibrates fresh. `judging.admin.reopenGrade` deletes one evaluation and the drafts for its project and challenge so another judge can grade it, and clears the edition's unpublished placings, so publishing needs a fresh compute; it is refused while results are published.

At an untimed challenge that random sample is enforced (`services/judging/queue-store.ts`): `judging.desk.nextProject` offers only the first `QUEUE_WINDOW` (3) open projects of the judge's own queue and takes a `skip` list for a team away from its table, and a judge's first `startGrading`, `saveDraft` or `submit` on a project outside that window is refused. `judging.desk.startGrading` holds a project from the moment it is opened, with an empty draft. A table judge grades a sponsor's challenge only from a seat in a room that serves it (`scope.isSponsorChallenge`); `judging.desk.context` lists only the challenges they may pick.

A scheduled presentation can have one assigned judge (`judging_appointment.assigned_judge_id`, set by `judging.schedule`; `services/judging/schedule/judges.ts` decides who may be assigned it). The desk never writes it and never tells a judge which other judge is assigned to, holds or graded a project. From the presentation's start until `TAKEOVER_AFTER_MS` (5 minutes) later only the assigned judge may open it (`services/judging/timing.ts`), and other judges see it as `reserved` with the time it opens. After that any judge who may grade it there can take it over, unless the assigned judge has started: their draft holds it (`grading-hold.ts`). Every claim checks this under the grading lock. `judging.desk.nextProject` offers the judge's own running assignments first; the queue window does not apply to scheduled challenges. `judging.desk.itinerary` lists the caller's assigned presentations that have not ended, soonest first, with the room and whether they are seated there. `judging.desk.releaseGrading` deletes the caller's own draft while it is still the empty one `startGrading` made, so a skipped or accidentally opened project is free again. `judging.schedule.get` gives organisers each started assignment's `judgeProgress` (grading, graded, taken over, not started).

## Club procedures (selected)

**Members:** `me`, `register`, `update`, `history`, `myPass`, `rotatePass`, `checkStatus`; admin `list`, `getById`, `adminSearch`, `adminHistory`, `adminGrant`, `adminRevoke`.

**Events:** admin CRUD + QR regenerate; public `list`; signed-in `checkIn` (members and non-members; `/checkin` page), `myEvents`, `myStats`; scanner `manualCheckIn`, `scanMemberPass`, `attendees`, `removeAttendance`.

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
