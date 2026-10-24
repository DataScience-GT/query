# Scoring and results

How a judge's answers become an evaluation, how evaluations become scores and placings, and how organisers review, publish and correct them. Used by judges (writing evaluations and a private shortlist), organisers (compute, publish, reopen a grade) and hackers (public results and shared feedback). Back to the [judging overview](./README.md). Timing and who may grade what is on [judging day](./judging-day.md).

## Evaluations

An evaluation (`judging_evaluation`) is one judge's verdict on one project for one challenge, unique per `(judge, entry, challenge)`. A project is graded once per root challenge, so only one judge's evaluation normally exists for it (see [grading hold](./judging-day.md#grading-hold)). Evaluations that already existed twice from before that rule are left as they are.

Answers follow the rubric, set in [setup](./setup.md#rubric):

- Ratings are whole numbers 1 to 5 and always required.
- Responses are short text (up to 2000 characters), required or not per item.
- Who may read a response depends on the judge. A member judge's responses are always public. A guest's follow the item's `guestVisibility`: public, private, or optional (the guest ticks `isPublic`). An item with no guest setting is treated as private. See `responseVisibility` in `services/judging/evaluation.ts`. This sets the `isPublic` flag stored on the row, which `hacker.feedback` reads (see [Feedback to hackers](#feedback-to-hackers)).

### Draft, submit, revise

| Procedure | Does |
| --- | --- |
| `desk.startGrading` | Opens a project: runs the first-save checks and creates an empty draft so the hold starts |
| `desk.saveDraft` | Autosave. Takes the draft's `revision` the editor last saw; a stale window is refused instead of overwriting. The draft carries the presentation's deadline. |
| `desk.submit` | Every rating and every required response must be answered, or the call is rejected with the list still to do. Takes `expectedRevision` (0 for a first submission). |
| `desk.releaseGrading` | Gives back an opened project that was never saved to |
| `desk.myEvaluations` | The judge's own submitted evaluations |
| `desk.project` | The editor payload: project, rubric, the judge's draft or evaluation, whether they can write and against what deadline, and scores once visible |

`submit` and `saveDraft` run in a transaction that checks judging is open, the guest session is live, the project is in the judge's scope, and the timing rules. `writeEvaluation` (`services/judging/evaluation-store.ts`) writes the evaluation row, its ratings and responses, and a revision snapshot in `judging_evaluation_revision`, so every save is recoverable. The first result for a scheduled presentation stamps `judging_schedule.firstResultAt`.

### Submitted for the judge

A draft that still holds a deadline when the deadline passes is submitted automatically by the next read that touches evaluations (`reconcileDueDrafts`), as of its deadline, whether or not it is complete. The evaluation has `autoSubmittedAt` set. Lenient answer checking (`checkAnswers` with `"lenient"`) drops anything that no longer matches the rubric rather than refusing, because a late draft is often the project's only grade. The reconcile skips drafts that can no longer be submitted (guest session revoked, project withdrawn, schedule dropped, another judge already graded it) and drafts with no answers, since a bare open is not a grade.

### What judges see of scores

`desk.project` returns scores only once the judge has an evaluation of that project, or, for member judges only, when `showAllScores` is on. A guest never sees the overall score across challenges.

## Scoring

`services/judging/scoring.ts` is pure.

- An evaluation's score is the mean of its 1 to 5 ratings.
- A project's score in a scope is the mean of its counted evaluation scores. An evaluation counts when it holds every rating item of the rubric (`hasEveryRating`), whether or not an optional or empty written response was left out.
- Every evaluation weighs the same, whoever wrote it.
- The overall score is the mean across all counted evaluations in any challenge. A challenge score uses only that challenge's evaluations.
- `holdsEveryRating` (`services/judging/scoring-sql.ts`) is the SQL form of the same rule, used for counts and for the shortlist.

The judge desk shows these raw means. Placements use calibrated scores instead.

## Calibration

Each project is graded by one judge, so a strict or lenient judge decides the score of every project they happened to grade. `calibrate` (`services/judging/calibration.ts`) takes the judge out of the score. The premise is that the [queue](./README.md#two-judging-styles) gives each judge a random sample of projects, which holds for queue-judged challenges: a random sample is as good as the pool, so a judge whose mean or spread differs from the pool's is showing their own habits. Scheduled challenges, including the default General, are graded by judges chosen by the deterministic assigner, not by a hashed sample. Calibration still runs on those grades (`placements.ts`).

- A pool is one root challenge. Judges are compared only with other judges of the same challenge, and a judge in two challenges gets separate parameters in each.
- Only evaluations that hold every rating count.
- Per judge it estimates an offset (strict or lenient), a spread (bunched or wide, clamped to 0.5 to 2) and, from 20 grades, a drift over the day. Each is shrunk toward no correction by `n / (n + K)` for a judge with `n` grades. `K_A = 3`, `K_B = 6`, `K_D = 150`, `MIN_DRIFT_GRADES = 20`. The comment in the file explains the drift weight with simulated judges, and the tests measure it ("drift tuning" in `calibration.test.ts`).
- The adjusted score is `clamp(mu + (s' - mu - offset) / spread, 1, 5)` where `s'` is the drift-corrected score.
- The result does not depend on the order evaluations are listed in.

Organisers see how each judge is being adjusted in the results list: grades, offset, spread and drift per judge per challenge (`judgeCalibrations` in `routers/judging/results.ts`, cached for 60 seconds with a fingerprint of evaluation counts and last update times). Judges and hackers never see it. The summary is formatted in `sites/mainweb/components/admin/judging/results/calibration.ts`.

## Placements

```mermaid
flowchart LR
  E["Submitted evaluations with every rating"]
  C["calibrate per root challenge"]
  S["Mean per project: per challenge and overall"]
  R["rankByScore, ties share a rank"]
  P["judging_placement rows, draft"]
  U["publishedAt set"]
  G["hackathon.getResults"]
  E --> C --> S --> R --> P --> U --> G
```

`computePlacements` (`services/judging/placements.ts`) makes one ranking per root challenge plus one `overall`. The scope is stored as text (`"overall"` or a challenge id) so the unique index holds for the overall ranking.

- Child challenges get placings too. Evaluations are always stored against the root challenge (`evaluatedChallenge` returns the root, and `desk.submit` writes that id). For each challenge, `computePlacements` finds its root (`rootOf`) and ranks from the root's evaluations, among only the entries entered in that child challenge. An individual prize under a group such as "MLH Challenges" is therefore ranked on the group's grades.
- Calibration runs once over every counted evaluation of a live entry, not once per scope, so a judge's habits are learned from all of their grades.
- Ties share a rank and the next rank skips (1, 1, 3). Scores are compared in hundredths, since placements are stored as `numeric(4,2)`.
- A project nobody scored is left out rather than listed last.
- Each row keeps both `score` (calibrated, what ranks) and `rawScore` (the plain mean of the same evaluations), plus `evaluationCount`.
- Entries that are soft-deleted or marked `prizeIneligibleAt` are excluded. Judges still scored a prize-ineligible team; it just cannot place.

### Procedures

All `isAdmin`, in `packages/api/src/routers/judging/results.ts`.

| Procedure | Does |
| --- | --- |
| `compute` | Reconciles due drafts, then replaces the draft placings with a fresh ranking, in one transaction under the config lock. Refused while any placing is published ("Unpublish them first"). |
| `list` | Placings grouped by scope with Overall first, how many evaluations were saved since the last compute (a stale ranking), withdrawn and ineligible flags, open check-in flag counts, and the calibration summary |
| `publish` | Sets `publishedAt` on every unpublished placing. Refused if nothing is computed. Like `unpublish`, it does not evict the results cache, so the public list can lag by up to 60 seconds. The first publish ever notifies accepted hackers and every member of a judged project (`notifyResultsPublished`); later republishes do not. |
| `unpublish` | Clears `publishedAt`, which takes the results back down. It does not evict the results cache, so the public list can lag by up to 60 seconds. |
| `appointmentResults` | One presentation's results: each judge who wrote or started an evaluation, their ratings and responses once every rating is in, and the mean |
| `evaluationAudit` | Every evaluation, newest first (up to 500), with judge, score, whether it was auto-submitted and whether placings count it |
| `revisions` | Every saved version of one evaluation with the rubric for labelling |

Public read: `hackathon.getResults` in `packages/api/src/routers/hackathon/content.ts` returns only published rows, Overall first, merged with frozen rows from the retired pool-dispatch judging for past editions. It is cached for 60 seconds per hackathon under `hackathon:<id>:results`. Writes in `admin.ts` that change what it shows (such as `setPrizeEligibility`) evict that key; `results.publish` and `results.unpublish` do not.

Console tab: `sites/mainweb/components/admin/judging/results/ResultsTab.tsx`.

### Reopening a grade

`admin.reopenGrade` deletes one evaluation and any drafts for the same project and challenge so another judge can grade it. Ratings, responses and revisions go with it by cascade. It is allowed while judging is closed, but no judge can grade until it is reopened. Because the grade fed rankings and calibration, every draft placing is deleted in the same transaction, so compute again after the project is re-graded. It is refused while results are published, and is audited at `critical` severity.

`setPrizeEligibility` evicts the results cache immediately; a recompute drops the project from placings.

## Shortlist (deliberation)

A judge's private shortlist is separate from scoring. It never feeds placements. Judges name sections ("Top three", "Maybe"), add projects they have finished judging with a note, and reorder (`desk.deliberation` sub-router: `list`, `addSection`, `renameSection`, `removeSection`, `reorderSections`, `add`, `remove`, `move`, `reorder`, `setNote`). Rules:

- A project can be added only after the judge has an evaluation that holds every rating: "Finish judging this project before you add it to your shortlist."
- Writes need judging open and, for a guest, a live session.
- A project can sit in a section once. Reordering with a list that does not match the current rows (a stale tab) is refused (`isReordering` in `services/judging/deliberation.ts`).
- Tables: `judging_deliberation_section` (per judge) and `judging_deliberation_entry` (section, entry, note, order). UI: `sites/mainweb/components/judge/Shortlist.tsx`.

## Feedback to hackers

`hacker.feedback` returns the public written responses on the caller's project, from evaluations that hold every rating (the ones placings count), whether the judge is a member or a guest. A response is returned when its stored `isPublic` flag is set. That flag is decided when the evaluation is written: always set for a member, and for a guest set by the item's `guestVisibility` (a `private` item is never shown; an `optional` one only if the guest ticked it). No judge names and no scores. It is hidden in emergency mode. Hackers also see public results through the hackathon page once published.

## Limits and edge cases

- Rubric changes are blocked once evaluations exist, so every evaluation is scored against the same items.
- After a scheduled presentation's deadline plus a 15 second write grace, a judge cannot submit or edit; an organiser's only route is `reopenGrade`.
- `compute` while published is refused, as is `reopenGrade`. The order is unpublish, change, compute, publish.
- `dropEvaluations` (danger zone) removes every evaluation, draft and placing for the edition.
- A calibration that is cached for up to 60 seconds affects only the organiser's summary. `compute` always recalibrates from the current evaluations.

## Tests

In `packages/api/src/services/judging/`: `scoring.test.ts`, `scoring-sql.test.ts`, `calibration.test.ts` (including simulated judges), `placements.test.ts`, `evaluation.test.ts`, `evaluation-store.test.ts`, `deliberation.test.ts`, `grading-hold.test.ts`, `notify.test.ts`. Front end: `sites/mainweb/components/admin/judging/results/calibration.test.ts` and `ResultsTab.test.tsx`; judge-side helpers `sites/mainweb/components/judge/answers.test.ts` and `draft-mirror.test.ts`.
