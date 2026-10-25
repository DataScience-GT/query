# Judging setup

Everything an organiser does before judging day: get projects in, sort them into challenges, build rooms and tables, fix a rubric, line up judges, and open judging. Used by staff admins in the judging console at `/admin/judging/[hackathonId]`. Back to the [judging overview](./README.md).

The console is one page with sections kept in the URL hash (`SECTIONS` in `sites/mainweb/components/admin/judging/shared.tsx`): Checklist, Projects, Challenges, Rooms, Rubric, State and launch, Schedule, Claims, Results, Announcements, Danger zone. Officer screens poll every 10 seconds (`OFFICER_POLL_MS`).

All organiser procedures are `isAdmin` and live in `packages/api/src/routers/judging/admin.ts` unless noted. Writes that change the shape of an edition first take a row lock on `judging_config` (`lockEdition` in `services/judging/challenges.ts`), so two organiser screens cannot race each other.

## Config and state

`judging_config` has one row per edition, created on first use by `ensureJudgingConfig` (`services/judging/config.ts`).

| Column | Meaning |
| --- | --- |
| `state` | `draft`, `open` or `closed` |
| `showAllScores` | Member judges see every project's score, not only ones they judged. Guests never do. |
| `inventoryLockedAt` | Set by the first room link or first claim. After it a Devpost import only adds. |
| `groupsInitializedAt` | The starter groups were made once |
| `itineraryPublished` | Hackers see times and rooms |
| `emergencyMode` | Schedule fell over: hackers get project lookup, roster and feedback hide |
| `claimsStartedAt` | The first claim |
| `autoRebalance` | Move presentations off judges who left or went quiet. Default on. See [adaptive](./adaptive.md). |

State changes go through `setState`, checked by `stateChangeProblem` (`services/judging/checklist.ts`):

- `draft` to `open` needs at least one rating question in the rubric.
- `open` and `closed` swap freely. `closed` cannot be reached from `draft`.
- Back to `draft` is refused once any evaluation or draft exists. Use `dropEvaluations` from the danger zone instead.

`open` is when judges may submit and edit. While closed, evaluations are read-only, though `reopenGrade` and `setPrizeEligibility` still work.

`judging.admin.overview` feeds the console header: counts of projects, challenges, rooms, evaluations, announcements and seated judges, plus the `locks` for challenge structure and rubric.

## Getting projects in

Two sources, both landing in `judging_entry` with a `source` of `devpost` or `portal`.

### Devpost import

`importDevpost` (`isAdminUpload`) takes the CSV text from the client. Parsing is pure and lives in `services/judging/devpost.ts`; applying it is `services/judging/import.ts`.

- The export has one row per project and opt-in prize. Rows are grouped by `Submission Url`; copies must agree on submitter and content or the project is held back rather than guessed at.
- Required columns include `Project Title`, `Submission Url`, `Project Status`, `Submitter Email` and `Additional Team Member Count`. A missing column, a non-CSV file or an unclosed quote fails the whole file (`DevpostFileError`). The size cap is `DEVPOST_MAX_BYTES` (10 MB).
- Each `Opt-In Prize` label becomes a challenge. A label containing a group's `importLabelMatch` (for example "MLH") is filed under that group.
- Mode `automatic` replaces the Devpost projects until anything depends on them (a room link, a claim, a score or a saved schedule), then only adds. Mode `replace` is refused once claims started, a schedule is saved, or scores exist. If room links are out it also needs the hackathon name typed and signs every guest judge out (`planImport`).
- A replacement may not leave an active room without projects (`assertRoomsKeepProjects`).
- Re-importing the same file finds its rows again through the unique index on `(hackathon_id, submission_url)`. The audit log records counts and a short hash of the file, never the file, since it holds hackers' emails.

### Portal submissions

`promoteSubmissions` copies hackathon projects with status `submitted`, `judging` or `winner` that an admin has not withdrawn. It is safe to re-run as late submissions land. A project already promoted is skipped, including one an organiser removed. Team members arrive already linked to their accounts, so nobody has to claim. Team submission itself is covered in [hackathons](../features/hackathons.md).

### Managing entries

`listEntries` searches and filters (source, live or removed). `removeEntry` is a soft delete (`deletedAt`): evaluations keep pointing at it. It is refused while the project is on the saved schedule. `restoreEntry` brings it back. A portal submission the team withdrew cannot be restored. `setPrizeEligibility` pulls a project from prizes without touching judging: judges still score it, the schedule is unchanged, only placements and public results leave it out. `dismissCheckInFlag` clears a check-in rule flag that judges see on a project (flags come from `services/check-in-flags.ts`).

## Challenges

A challenge is a prize a project is judged for. Challenges form a shallow tree: a group (for example "MLH Challenges") holds children, and a child is judged the way its root is.

| Field | Effect |
| --- | --- |
| `mode` | `scheduled`, `unscheduled` or `remote`, see [two judging styles](./README.md#two-judging-styles) |
| `isGroup` | Holds children |
| `isGeneral` | Every project is in it whether or not it opted in |
| `importLabelMatch` | New imported labels containing this text land under this group |

Procedures: `initializeGroups` (General and MLH Challenges, once per edition, even if an organiser later deletes them), `listChallenges`, `createChallenge`, `updateChallenge`, `deleteChallenge`, `setEntryChallenges` (a project's opt-ins). Membership of a challenge's group and of every general challenge is derived and rebuilt (`rebuildDerivedMemberships`), never edited by hand.

Limits:

- `assertStructureEditable` refuses regrouping, mode and general changes once a schedule is saved or any evaluation or draft exists. Renaming is still allowed.
- `deleteChallenge` is refused while projects opted in, or rooms, appointments, evaluations or drafts reference it.
- Labels are trimmed, whitespace collapsed and compared case-insensitively.

## Rooms, tables and QR links

A station is a `judging_room` row with `kind` of `room` (own door) or `table` (a numbered table in a hall). Both are judged and scheduled the same way. Each serves one top-level challenge or group (`assertRoomChallenge`). A building (`judging_building`) is a hall; the scheduler needs it to plan walking time between presentations.

| Procedure | Does |
| --- | --- |
| `createBuilding`, `renameBuilding`, `deleteBuilding` | Halls |
| `createRoom`, `updateRoom`, `deleteRoom`, `reorderRooms` | Single stations. Names are unique per building among active stations. |
| `createTables` | Up to 200 tables in one call, slotted in number order. Numbering starts one past the hall's highest "Table N", archived tables included, unless `firstNumber` is given. Numbers already used by an active table are skipped and not made up at the end, so fewer than `count` tables can be created. |
| `setRoomArchived`, `archiveRooms` | Archive a station. Refused while presentations are scheduled in it. See [adaptive](./adaptive.md). |
| `generateRoomLink`, `generateRoomLinks`, `revokeRoomLink` | The QR link for a room |

Moving a room to another challenge or building is refused while presentations are scheduled in it. A new challenge changes what its guests may judge, so a live link is retired, which takes the room's name typed out.

### QR links

A room has at most one live link (`judging_room_link`). `generateRoomLink` retires the old link and revokes every unrevoked guest session in the room, whichever link those guests used; `generateRoomLinks` only fills rooms with none, so printed codes keep working. The first link anywhere calls `lockInventory`. The printable sheet is `/admin/judging/[hackathonId]/qr`.

The QR encodes `/judge/activate/<linkId>?sig=...` (`services/judging/room-link.ts`). The signature is an HMAC of the link id keyed from `AUTH_SECRET`, with a domain prefix. It proves the link came from "generate link"; revoking the row is what ends it. `AUTH_SECRET` unset makes generation throw. The origin comes from `NEXTAUTH_URL` or `AUTH_URL` so a printed code does not depend on the host the organiser used.

Scanning is handled by `activateRoomLink` (`services/judging/principal.ts`):

- A signed-in member judge is seated in the room and sent to `/judge/<hackathonId>`.
- Anyone else gets a guest session. The cookie `query_judging_guest` holds 32 random bytes; only the sha256 is stored in `judging_guest_session`. The session lasts 8 hours (`GUEST_SESSION_SECONDS`), and the cookie outlives it by 4 hours so a named guest scanning another room's code stays the same judge.
- A revoked link, an archived room or a bad signature goes to `/judge/guest/invalid-link`.

## Judges

Judges are tracked per edition in `judging_judge` with a `kind`.

- Member judges apply and are approved in the judge portal; the roster lives in the `judge` and `judge_assignment` tables (Drizzle exports `judges` and `judgeAssignments`; see [judge-portal](../features/judge-portal.md)). The desk accepts a user with an active `judge` row for the edition, or any active staff admin (`resolveMemberJudge`). The `judging_judge` row is created the first time they reach the desk. A judge's preferred track from their application is used to highlight matching rooms in the room list.
- Guest judges need no setup beyond a room QR link.

Who grades which presentation is the scheduler's job: `assignJudges` and `setAssignedJudge` in `routers/judging/schedule.ts`. See [scheduler](./scheduler.md).

## Rubric

`saveRubric` replaces the rubric (up to 30 items). Items are either:

- `rating`: 1 to 5, always required.
- `response`: short text, required or not, with a `guestVisibility` of `public`, `optional` (the guest chooses) or `private` (organisers only). Member judges' responses are always public.

`hacker.feedback` returns every response whose stored public flag is set, from member and guest evaluations alike. A guest's response is public when the item is `public`, or `optional` and the guest ticked it. `private` responses, and items with no guest setting, are never shown to the team.

`rubricLockReason` fixes the rubric when any evaluation exists, when judging is no longer in draft, or while a schedule is saved. The reasons name the way out: reset to draft, drop the schedule, or drop evaluations.

## Launch switches and announcements

- `setState` opens judging.
- `setLaunch` sets `itineraryPublished` and `emergencyMode`. Turning the itinerary on emails the teams once per off-to-on change (`notifyItineraryPosted`, `services/judging/notify.ts`), decided by the row update (guarded by `itineraryPublished = false`) so two clicks send once. Turning it off and on again sends again. It runs without being awaited and logs failures rather than rejecting.
- `setShowAllScores` and `setAutoRebalance` (the latter in `routers/judging/schedule.ts`).
- `setAnnouncement` / `clearAnnouncement` pin one message to all judges, or one room, with `includeGuests` and `isUrgent` flags. One current message globally and one per room.

## Claims

Hackers need a place on a project to see its itinerary. Portal submissions are linked already. Devpost projects list teammates by Devpost email (`services/judging/claims.ts`):

- `hacker.myClaim` and `hacker.claimByEmail`: a checked-in hacker whose portal email matches a listed teammate claims in one click.
- `hacker.sendClaimEmails` (admin, batches of 5): emails a one-time link to the Devpost address for people whose portal email differs. `claimByToken` consumes it. `claimLink` issues one for an organiser to copy into a message (audited, since it is a credential for someone's place). Links expire at the event end date.
- `hacker.invite`: a claimed teammate adds another person, up to `MAX_TEAM_SIZE` (4), counted as the larger of Devpost's number and the roster.
- `hacker.claimOverview` shows the organiser progress. The Claims section of the console is `components/admin/judging/claims/ClaimsPanel.tsx`.

Claim and itinerary calls require the hacker to be checked in to the hackathon. Claiming and inviting also refuse banned hackers (`notHackathonBanned`).

## Launch checklist

`judging.admin.checklist` (`buildChecklist` in `services/judging/checklist.ts`) returns these, in order:

| Item | Done when |
| --- | --- |
| Projects imported | At least one live project |
| Rubric and challenge groups ready | Starter groups created and at least one rating question |
| Rooms or tables set up for scheduled challenges | Every scheduled top-level challenge with projects has stations that each have a building and a live QR link; one station of such a challenge missing either fails the item. True when no scheduled challenge has projects. |
| Schedule saved | A `judging_schedule` row exists |
| Judging open | `state` is `open` |
| Claims started | A claim happened, or there are no Devpost projects |
| Itinerary published | `itineraryPublished` |

## Resets

The danger zone procedures each need the hackathon's exact name typed and run in one transaction (`services/judging/resets.ts`): `dropEvaluations`, `resetProjects`, `dropRooms`, `resetSetup`, `resetLaunch`, `resetAll`. Each is audit logged at `critical`. Entries are deleted outright, not soft-deleted.

## Tests

Service tests sit next to the code in `packages/api/src/services/judging/` (`devpost.test.ts`, `import.test.ts`, `challenges.test.ts`, `rooms.test.ts`, `room-link.test.ts`, `checklist.test.ts`, `claims.test.ts`, `config.test.ts`, `principal.test.ts`). Console tests: `sites/mainweb/components/admin/judging/DangerZone.test.tsx` and `EntriesList.test.tsx`.
