# Repo check

A late-push check for judging. When an organiser turns it on for an edition, the app looks at each project's GitHub repo and flags the ones that were pushed to after the submission deadline. An organiser then confirms (disqualifies) or clears each flag. Nothing is disqualified automatically. Back to the [judging overview](./README.md).

The code is `services/judging/repo-check.ts` (the check), `routers/judging/admin/repo-check.ts` (the switch and the decisions) and `RepoCheckSection.tsx` in `sites/mainweb/components/admin/judging/` (the console's Repo check section).

## The signal

The check goes by GitHub's own record of the last push, the `pushed_at` field of `GET /repos/{owner}/{repo}`. That is the server's clock and covers a push to any branch. Commit dates are never used to decide: they are set by the hacker's computer and can be faked in either direction.

When `pushed_at` is later than the deadline plus the edition's grace, the project is flagged `late` and the check also fetches evidence for the organiser:

- Commits since the deadline (`GET /repos/{owner}/{repo}/commits?since=...`), the latest 20: sha, first line of the message, author, commit date, link. The commit date is shown for context only. This lists the default branch.
- Pushes since the deadline from the repo's events (`GET /repos/{owner}/{repo}/events`), the latest 20 PushEvents: time, ref and who pushed. GitHub keeps only recent events.

The deadline is the submission close time, the same one the team submission window uses (`computeSubmissionWindow`: 36 hours after hacking starts). A push exactly on the deadline plus grace is on time.

## Which repo

Every distinct github.com repo the entry links to, at most three: the portal project's GitHub link, then the repo links among the Devpost demo links. The entry is flagged if any of them is late, and evidence is kept per repo. A link is read strictly: a trailing `.git`, `/tree/...` or any other path after the repo is ignored, and anything that is not `github.com/owner/repo` (a profile, another host) counts as no repo.

| Outcome | Meaning |
| --- | --- |
| `ok` | Last push at or before the deadline plus grace |
| `late` | Pushed after the deadline plus grace |
| `no_repo` | No usable repo link |
| `unreadable` | GitHub answered 401, 403, 404, 410 or 451: private, deleted or blocked (a 403 that mentions a rate limit is `error` instead) |
| `error` | Rate limit, timeout or network failure. Retried on the next run. |

Everything except `ok` appears in the flagged list. A flag that is still pending is kept, evidence and all, when a later check cannot look (a repo made private) or finds nothing, since `pushed_at` only moves forward; the latest attempt is shown beside it. Changing the grace re-works pending flags from scratch.

## Organiser flow

Open the Repo check section of the judging console.

1. Optionally set the grace in minutes (default 0). Only pushes after the deadline plus the grace are flagged.
2. Turn the check on. While judging is open and someone has the console open, it runs every 15 minutes. Check now runs it at once, any time, whatever the switch, and waits up to 25 seconds; whatever finished is saved and the run carries on for the rest.
3. For each flagged project, read the repo link, the last push against the deadline (Eastern time) and the evidence, add an optional note, then:
   - **Disqualify** takes the project out of judging, the same way removing it does (see below).
   - **Clear** closes the flag and changes nothing else.
   - **Reinstate** undoes a disqualification: the project comes back through the same path as restoring a removed project, and the flag is cleared.

Every decision writes an audit log entry. The note is kept with the decision for organisers only; hackers and the public results never see a reason.

A project that was decided is not looked at again unless its repo was pushed to after the decision. Then the flag reopens as pending with the new evidence. A disqualified project that reopens is still out until an organiser reinstates it.

## What disqualifying does

It sets `deletedAt` on the judging entry, which is what removing a project does. Everything that already leaves a removed project out follows from that: placements and public results, the unscheduled queue, the judge itinerary, and judge assignment and re-balancing (its saved appointments count as removed, so no judge is assigned and nothing is moved for them). Its evaluations stay, pointing at it. A hacker on that team sees what they see for any removed project and no reason. A portal submission removed this way cannot be resubmitted by its team.

Unlike Remove project, it does not require the saved schedule to be dropped first: the board already treats a removed project's appointments as removed.

Reinstating restores only if the project is still deleted with the `deletedAt` the disqualification set (`removed_deleted_at`), so a manual restore followed by another removal is not undone. It clears `deletedAt` through `restoreLockedEntry`, which is also what Restore uses, and so refuses a portal submission whose team withdrew it. It only restores a project the disqualification itself removed (`removed_entry` on the check row); one an organiser had already removed stays removed.

## How it runs

There is no background worker, matching the lazy re-balance. `judging.admin.overview`, which the console polls every 10 seconds, calls `repoCheckIfDue` without waiting for it:

- An in-process throttle allows one attempt per edition every 15 minutes.
- The attempt claims the run in the database: one update of `judging_config.repo_check_last_run_at`, only if the switch is on, judging is `open` and the last run is older than 15 minutes. Only the instance that wins the claim starts a run, so several instances do not all call GitHub.
- The run happens in the background; the poll returns at once and a later poll shows the results.
- Projects checked longest ago (or never) go first, so a low rate limit still reaches the tail over several runs.
- Each result is saved under the same edition lock the decisions take, against the row as it is then, so a decision made during a run is never overwritten.
- A run in this process older than 10 minutes no longer blocks the next one.
- At most 5 GitHub requests are in flight, each with a 10 second timeout and a `User-Agent`.
- Turning the switch on or changing the grace makes the next poll run it.

## GitHub token and rate limits

Set `GITHUB_TOKEN` (optional, any token that can read public repos) for 5000 requests an hour. The console warns while it is missing, and `apphosting.yaml` has the entry commented out until the secret exists. Without it GitHub allows 60 an hour, enough for a small edition. When GitHub answers with its rate limit, or the last response says no requests remain, the run stops: projects not yet checked are recorded as `error` (a decided project keeps its decision) and the next run, 15 minutes later, picks them up.

## Limits

- Pushes to any branch count, including a branch the team never submitted.
- A force-push can move a branch back, but `pushed_at` still moves forward, so it is still flagged. The commit list may not show what was pushed.
- A repo made private or deleted after the deadline reads as `unreadable`. The check cannot tell that from one that was private all along.
- A team can push from a fork, or keep its real work elsewhere and link another repo. The check does not see either.
- `pushed_at` can move for reasons that are not code, so the evidence is there for a person to read.
- The in-process throttle is per instance. A switch changed on one instance can take up to 15 minutes to be picked up by the poll on another; Check now is immediate.

## Data

| Table | Holds |
| --- | --- |
| `judging_repo_check` | One row per project: repo, outcome, `pushed_at`, evidence (JSON, at most 20 commits and 20 pushes), when it was checked, and the decision (`pending`, `disqualified`, `cleared`) with who, when and the note |
| `judging_config` | `repo_check_enabled`, `repo_check_grace_minutes`, `repo_check_last_run_at` |
