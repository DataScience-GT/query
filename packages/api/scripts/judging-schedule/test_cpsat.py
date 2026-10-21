"""Tests for cpsat.py. From this directory: python -I -m unittest

The main check is against brute force: on problems small enough to enumerate
every schedule, the CP-SAT model must find the same best score in the same
goal order. The rest covers the command line (stdin, exit codes), hints that
must survive a timeout, and when the cross-building break may be relaxed.
"""

from __future__ import annotations

import contextlib
import io
import itertools
import json
import random
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cpsat  # noqa: E402

try:
    import ortools  # noqa: F401

    HAVE_ORTOOLS = True
except ImportError:
    HAVE_ORTOOLS = False

KEYS = ["sponsorFinish", "sponsorIdle", "finish", "buildingChanges", "breakSlots"]


def lexicographic(objective: dict[str, int]) -> tuple[int, ...]:
    """rules.ts scoreSchedule order: lower is better, breaks count negative."""
    return tuple(-objective[k] if k == "breakSlots" else objective[k] for k in KEYS)


def small_problem(seed: int) -> dict:
    """A random problem small enough to enumerate. Two identical general rooms
    and two identical sponsor rooms make interchangeable placements, which
    the model must not count as different scores."""
    rng = random.Random(seed)
    rooms = [
        {"id": "g1", "challengeId": "general", "buildingId": "a", "sponsor": False},
        {"id": "g2", "challengeId": "general", "buildingId": "a", "sponsor": False},
        {"id": "g3", "challengeId": "general", "buildingId": "b", "sponsor": False},
        {"id": "s1", "challengeId": "acme", "buildingId": "a", "sponsor": True},
        {"id": "s2", "challengeId": "acme", "buildingId": "a", "sponsor": True},
        {"id": "s3", "challengeId": "globex", "buildingId": "b", "sponsor": True},
    ]
    rng.shuffle(rooms)
    tasks = []
    for p in range(rng.randint(3, 4)):
        entry = f"p{p}"
        tasks.append({"entryId": entry, "challengeId": "general", "sponsor": False})
        for challenge in ("acme", "globex"):
            if rng.random() < 0.45 and len(tasks) < 6:
                tasks.append({"entryId": entry, "challengeId": challenge, "sponsor": True})
    same_gap = rng.randint(0, 1)
    return {
        "format": cpsat.PROBLEM_FORMAT,
        "version": cpsat.VERSION,
        "fingerprint": f"small-{seed}",
        "slotCount": rng.randint(5, 6),
        "sameGap": same_gap,
        "crossGap": same_gap + rng.randint(0, 2),
        "rooms": rooms,
        "tasks": tasks,
    }


def brute_force(problem: cpsat.Problem, cross_gap: int):
    """Best lexicographic score over every valid schedule, or None."""
    rooms, tasks = problem.rooms, problem.tasks
    options = [
        [(r, s) for r, room in enumerate(rooms) if room.challenge_id == task.challenge_id
         for s in range(problem.slot_count)]
        for task in tasks
    ]
    placement: cpsat.Placement = {}
    taken: set[tuple[int, int]] = set()
    best = None

    def fits(i: int, r: int, s: int) -> bool:
        if (r, s) in taken:
            return False
        # Pairwise is enough to prune: any two presentations of a team need
        # at least the break between neighbours.
        for k, (rk, sk) in placement.items():
            if tasks[k].entry_id != tasks[i].entry_id:
                continue
            gap = problem.same_gap if rooms[rk].building_id == rooms[r].building_id else cross_gap
            if abs(sk - s) - 1 < gap:
                return False
        return True

    def place(i: int):
        nonlocal best
        if i == len(tasks):
            assert not cpsat.violations(problem, placement, cross_gap)
            key = lexicographic(cpsat.score(problem, placement))
            if best is None or key < best:
                best = key
            return
        for r, s in options[i]:
            if fits(i, r, s):
                placement[i] = (r, s)
                taken.add((r, s))
                place(i + 1)
                del placement[i]
                taken.discard((r, s))

    place(0)
    return best


def quiet(_message: str):
    pass


@unittest.skipUnless(HAVE_ORTOOLS, "OR-Tools is not installed")
class SolveTest(unittest.TestCase):
    def test_matches_brute_force(self):
        for seed in range(12):
            problem = cpsat.load_problem(small_problem(seed))
            with self.subTest(seed=seed):
                expected = brute_force(problem, problem.cross_gap)
                status, placement = cpsat.solve(problem, problem.cross_gap, 20, 1, quiet)
                if expected is None:
                    self.assertEqual(status, "infeasible")
                    continue
                self.assertEqual(status, "optimal")
                self.assertEqual(cpsat.violations(problem, placement, problem.cross_gap), [])
                self.assertEqual(lexicographic(cpsat.score(problem, placement)), expected)

    def test_repeatable_with_one_worker(self):
        # Every goal here is proved optimal well inside the limit, which is
        # what one worker needs to repeat a run exactly.
        problem = cpsat.load_problem(small_problem(3))
        first = cpsat.solve(problem, problem.cross_gap, 20, 1, quiet)
        second = cpsat.solve(problem, problem.cross_gap, 20, 1, quiet)
        self.assertEqual(first, second)

    def test_keeps_a_good_hint(self):
        raw = json.loads((HERE / "example-problem.json").read_text(encoding="utf-8"))
        problem = cpsat.load_problem(raw)
        _, hinted = cpsat.solve(problem, problem.cross_gap, 10, 8, quiet)
        raw["hint"] = [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "roomId": problem.rooms[r].id,
                "slot": slot,
            }
            for i, (r, slot) in hinted.items()
        ]
        problem = cpsat.load_problem(raw)
        _, placement = cpsat.solve(problem, problem.cross_gap, 3, 8, quiet)
        self.assertEqual(cpsat.violations(problem, placement, problem.cross_gap), [])
        self.assertLessEqual(
            lexicographic(cpsat.score(problem, placement)),
            lexicographic(cpsat.score(problem, hinted)),
        )

    def test_a_valid_hint_survives_running_out_of_time(self):
        from ortools.sat.python import cp_model

        raw = small_problem(1)
        problem = cpsat.load_problem(raw)
        _, hinted = cpsat.solve(problem, problem.cross_gap, 20, 1, quiet)
        raw["hint"] = [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "roomId": problem.rooms[r].id,
                "slot": slot,
            }
            for i, (r, slot) in hinted.items()
        ]
        problem = cpsat.load_problem(raw)
        # Every solve runs out of time without finding anything.
        with mock.patch.object(cp_model.CpSolver, "solve", return_value=cp_model.UNKNOWN):
            status, placement = cpsat.solve(problem, problem.cross_gap, 1, 1, quiet)
        self.assertEqual(status, "feasible")
        self.assertEqual(placement, hinted)


def run_cli(problem: dict | str, *args: str):
    text = problem if isinstance(problem, str) else json.dumps(problem)
    return subprocess.run(
        [sys.executable, "-I", str(HERE / "cpsat.py"), "-", *args],
        input=text.encode("utf-8"),
        capture_output=True,
        timeout=120,
    )


@unittest.skipUnless(HAVE_ORTOOLS, "OR-Tools is not installed")
class CommandLineTest(unittest.TestCase):
    def run_script(self, problem: dict | str, *args: str):
        return run_cli(problem, *args)

    def test_reads_the_problem_from_stdin(self):
        raw = small_problem(1)
        done = self.run_script(raw, "--time-limit", "10", "--workers", "1")
        self.assertEqual(done.returncode, 0, done.stderr.decode())
        solution = json.loads(done.stdout)
        self.assertEqual(solution["format"], cpsat.SOLUTION_FORMAT)
        self.assertEqual(solution["fingerprint"], raw["fingerprint"])
        self.assertEqual(len(solution["placements"]), len(raw["tasks"]))
        self.assertEqual(list(solution["objective"]), KEYS)

    def test_relaxes_cross_building_breaks_when_it_must(self):
        # One team, a room in each building, three slots: only a one-slot
        # break fits, so the two-slot walk has to be relaxed.
        raw = {
            "format": cpsat.PROBLEM_FORMAT, "version": cpsat.VERSION, "fingerprint": "walk",
            "slotCount": 3, "sameGap": 1, "crossGap": 2,
            "rooms": [
                {"id": "r1", "challengeId": "c1", "buildingId": "a", "sponsor": False},
                {"id": "r2", "challengeId": "c2", "buildingId": "b", "sponsor": False},
            ],
            "tasks": [
                {"entryId": "p", "challengeId": "c1", "sponsor": False},
                {"entryId": "p", "challengeId": "c2", "sponsor": False},
            ],
        }
        done = self.run_script(raw, "--time-limit", "5", "--workers", "1")
        self.assertEqual(done.returncode, 0, done.stderr.decode())
        self.assertTrue(json.loads(done.stdout)["relaxed"])

    def test_does_not_relax_after_a_timeout(self):
        # Running out of time on the full breaks is not proof they cannot be
        # kept, so the script stops there instead of shortening them.
        tried = []

        def out_of_time(problem, cross_gap, seconds, workers, log):
            tried.append(cross_gap)
            return ("unknown", None)

        raw = small_problem(1)
        raw["crossGap"] = raw["sameGap"] + 1
        stdin = io.TextIOWrapper(io.BytesIO(json.dumps(raw).encode("utf-8")))
        out = io.StringIO()
        with mock.patch.object(cpsat, "solve", out_of_time), mock.patch("sys.stdin", stdin), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = cpsat.main(["-"])
        self.assertEqual(code, 3)
        self.assertEqual(tried, [raw["crossGap"]])
        solution = json.loads(out.getvalue())
        self.assertEqual(solution["status"], "unknown")
        self.assertFalse(solution["relaxed"])

    def test_exit_codes(self):
        self.assertEqual(self.run_script("not json").returncode, 1)
        raw = small_problem(1)
        raw["slotCount"] = 1
        done = self.run_script(raw, "--time-limit", "5")
        self.assertEqual(done.returncode, 2)
        self.assertTrue(json.loads(done.stdout)["reasons"])


JUDGE_KEYS = cpsat.JUDGE_GOALS


def judge_problem(seed: int) -> dict:
    """small_problem with a finished schedule and judges: two table judges (one
    with a short run limit) and a guest in one sponsor room."""
    rng = random.Random(seed * 7 + 1)
    raw = small_problem(seed)
    free = [(r["id"], s) for r in raw["rooms"] for s in range(raw["slotCount"])]
    rng.shuffle(free)
    placements, taken = [], set()
    for task in raw["tasks"]:
        room, slot = next(
            (r, s) for r, s in free
            if (r, s) not in taken
            and next(x for x in raw["rooms"] if x["id"] == r)["challengeId"] == task["challengeId"]
        )
        taken.add((room, slot))
        placements.append(
            {"entryId": task["entryId"], "challengeId": task["challengeId"], "roomId": room, "slot": slot}
        )
    everything = ["general", "acme", "globex"]
    raw["placements"] = placements
    raw["judges"] = [
        {"id": "m1", "kind": "member", "challengeIds": everything, "roomId": None},
        {"id": "m2", "kind": "member", "challengeIds": everything, "roomId": None,
         "maxConsecutive": rng.choice([1, 2, 4])},
        {"id": "gs", "kind": "guest", "challengeIds": ["acme"], "roomId": "s1"},
    ]
    return raw


def judge_key(score: dict) -> tuple[int, ...]:
    """Lower is better, in goal order; the last goal counts what is covered."""
    return tuple(-score[k] if k == "dayPartsCovered" else score[k] for k in JUDGE_KEYS)


def brute_force_assign(problem: cpsat.Problem, placement: cpsat.Placement):
    """Best goal vector over every assignment that keeps the judges' rules."""
    rooms, tasks, judges = problem.rooms, problem.tasks, problem.judges
    options = [
        [None] + [k for k, judge in enumerate(judges)
                  if cpsat.may_grade(judge, tasks[i], rooms[placement[i][0]])]
        for i in range(len(tasks))
    ]
    best = None
    for combo in itertools.product(*options):
        assignment = dict(enumerate(combo))
        if cpsat.assignment_violations(problem, placement, assignment):
            continue
        key = judge_key(cpsat.assignment_score(problem, placement, assignment))
        if best is None or key < best:
            best = key
    return best


@unittest.skipUnless(HAVE_ORTOOLS, "OR-Tools is not installed")
class JudgeTest(unittest.TestCase):
    def fixed(self, raw: dict) -> tuple[cpsat.Problem, cpsat.Placement]:
        problem = cpsat.load_problem(raw)
        index = {r.id: i for i, r in enumerate(problem.rooms)}
        placement = {
            i: (index[problem.fixed[t.entry_id, t.challenge_id][0]],
                problem.fixed[t.entry_id, t.challenge_id][1])
            for i, t in enumerate(problem.tasks)
        }
        return problem, placement

    def test_assignment_matches_brute_force(self):
        for seed in range(12):
            problem, placement = self.fixed(judge_problem(seed))
            with self.subTest(seed=seed):
                status, assignment = cpsat.assign(problem, placement, 20, 1, quiet)
                self.assertEqual(status, "optimal")
                self.assertEqual(cpsat.assignment_violations(problem, placement, assignment), [])
                self.assertEqual(
                    judge_key(cpsat.assignment_score(problem, placement, assignment)),
                    brute_force_assign(problem, placement),
                )

    def test_judges_are_assigned_from_the_command_line(self):
        raw = judge_problem(2)
        done = run_cli(raw, "--time-limit", "10", "--workers", "1")
        self.assertEqual(done.returncode, 0, done.stderr.decode())
        solution = json.loads(done.stdout)
        self.assertEqual(solution["status"], solution["assignmentStatus"])
        self.assertEqual(solution["placements"], raw["placements"])
        self.assertEqual(list(solution["judging"])[:6], JUDGE_KEYS)
        # One judge at most per presentation, and the rest counted as left out.
        done_for = {(a["entryId"], a["challengeId"]) for a in solution["assignments"]}
        self.assertEqual(len(done_for), len(solution["assignments"]))
        self.assertEqual(
            len(solution["assignments"]) + solution["judging"]["unassigned"], len(raw["tasks"])
        )

    def test_locked_assignments_stay(self):
        raw = judge_problem(4)
        first = raw["tasks"][0]
        raw["locked"] = [{"entryId": first["entryId"], "challengeId": first["challengeId"], "judgeId": "m2"}]
        problem, placement = self.fixed(raw)
        _, assignment = cpsat.assign(problem, placement, 20, 1, quiet)
        self.assertEqual(problem.judges[assignment[0]].id, "m2")

    def test_a_valid_hint_survives_running_out_of_time(self):
        from ortools.sat.python import cp_model

        raw = judge_problem(1)
        problem, placement = self.fixed(raw)
        _, assignment = cpsat.assign(problem, placement, 20, 1, quiet)
        raw["assignmentHint"] = [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "judgeId": problem.judges[k].id,
            }
            for i, k in assignment.items()
            if k is not None
        ]
        problem, placement = self.fixed(raw)
        # Every solve runs out of time without finding anything.
        with mock.patch.object(cp_model.CpSolver, "solve", return_value=cp_model.UNKNOWN):
            status, kept = cpsat.assign(problem, placement, 1, 1, quiet)
        self.assertEqual(status, "feasible")
        self.assertEqual(kept, assignment)

    def test_a_goal_cut_short_is_not_traded_away_by_the_next(self):
        from ortools.sat.python import cp_model

        solve = cp_model.CpSolver.solve
        calls = []

        for seed in range(12):
            raw = judge_problem(seed)
            problem, placement = self.fixed(raw)
            _, best = cpsat.assign(problem, placement, 20, 1, quiet)
            raw["assignmentHint"] = [
                {
                    "entryId": problem.tasks[i].entry_id,
                    "challengeId": problem.tasks[i].challenge_id,
                    "judgeId": problem.judges[k].id,
                }
                for i, k in best.items()
                if k is not None
            ]
            problem, placement = self.fixed(raw)
            # The hint is the best there is. Whichever goal runs out of time,
            # the goals after it must not make it worse to do better themselves.
            for cut in (1, 2):

                def runs_out(solver, model, *args, **kwargs):
                    calls.append(1)
                    if len(calls) == cut:
                        return cp_model.UNKNOWN
                    return solve(solver, model, *args, **kwargs)

                calls.clear()
                with mock.patch.object(cp_model.CpSolver, "solve", autospec=True, side_effect=runs_out):
                    _, assignment = cpsat.assign(problem, placement, 20, 1, quiet)
                with self.subTest(seed=seed, cut=cut):
                    self.assertEqual(
                        judge_key(cpsat.assignment_score(problem, placement, assignment)),
                        judge_key(cpsat.assignment_score(problem, placement, best)),
                    )

    def test_a_presentation_nobody_may_grade_is_left_out_not_failed(self):
        raw = judge_problem(1)
        for judge in raw["judges"]:
            judge["challengeIds"] = ["general"]
        problem, placement = self.fixed(raw)
        status, assignment = cpsat.assign(problem, placement, 20, 1, quiet)
        self.assertEqual(status, "optimal")
        sponsor = [i for i, t in enumerate(problem.tasks) if t.challenge_id != "general"]
        self.assertTrue(sponsor)
        self.assertTrue(all(assignment[i] is None for i in sponsor))

    def test_placement_keeps_a_challenge_within_its_judges(self):
        # Three teams, each in general once, three tables, one judge for general.
        # Without judges all three go at once; with one they must take turns.
        raw = {
            "format": cpsat.PROBLEM_FORMAT, "version": cpsat.VERSION, "fingerprint": "capacity",
            "slotCount": 4, "sameGap": 0, "crossGap": 0,
            "rooms": [{"id": f"g{n}", "challengeId": "general", "buildingId": "a", "sponsor": False}
                      for n in range(3)],
            "tasks": [{"entryId": f"p{n}", "challengeId": "general", "sponsor": False}
                      for n in range(3)],
        }
        problem = cpsat.load_problem(raw)
        _, together = cpsat.solve(problem, 0, 10, 1, quiet)
        self.assertEqual({slot for _, slot in together.values()}, {0})
        self.assertEqual(list(cpsat.score(problem, together)), KEYS)

        raw["judges"] = [{"id": "m1", "kind": "member", "challengeIds": ["general"], "roomId": None}]
        problem = cpsat.load_problem(raw)
        _, turns = cpsat.solve(problem, 0, 10, 1, quiet)
        self.assertEqual(sorted(slot for _, slot in turns.values()), [0, 1, 2])
        self.assertEqual(cpsat.score(problem, turns)["judgeShortfall"], 0)

    def test_too_few_judges_do_not_make_a_schedule_impossible(self):
        raw = {
            "format": cpsat.PROBLEM_FORMAT, "version": cpsat.VERSION, "fingerprint": "short",
            "slotCount": 2, "sameGap": 0, "crossGap": 0,
            "rooms": [{"id": f"g{n}", "challengeId": "general", "buildingId": "a", "sponsor": False}
                      for n in range(3)],
            "tasks": [{"entryId": f"p{n}", "challengeId": "general", "sponsor": False}
                      for n in range(5)],
            "judges": [{"id": "m1", "kind": "member", "challengeIds": ["general"], "roomId": None}],
        }
        problem = cpsat.load_problem(raw)
        status, placement = cpsat.solve(problem, 0, 10, 1, quiet)
        self.assertIn(status, ("optimal", "feasible"))
        # Five presentations in two slots: at best three and two at a time, so
        # the worst slot has two more than the one judge.
        self.assertEqual(cpsat.score(problem, placement)["judgeShortfall"], 2)

    def test_rejects_bad_judges_and_placements(self):
        raw = judge_problem(0)
        with self.assertRaises(cpsat.InputError):
            cpsat.load_problem({**raw, "judges": [{**raw["judges"][0], "kind": "robot"}]})
        with self.assertRaises(cpsat.InputError):
            cpsat.load_problem({**raw, "judges": [raw["judges"][0], raw["judges"][0]]})
        with self.assertRaises(cpsat.InputError):
            cpsat.load_problem({**raw, "placements": raw["placements"][:-1]})
        with self.assertRaises(cpsat.InputError):
            cpsat.load_problem({k: v for k, v in raw.items() if k != "judges"})


if __name__ == "__main__":
    unittest.main()
