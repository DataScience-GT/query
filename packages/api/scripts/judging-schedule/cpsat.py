# /// script
# requires-python = ">=3.10"
# dependencies = ["ortools>=9.10"]
# ///
"""Judging schedule fallback: solve with Google OR-Tools CP-SAT.

The portal schedules room judging with a TypeScript solver
(packages/api/src/services/judging/schedule). That solver is greedy plus local
search: fast and repeatable, but it can miss a schedule that exists, and it
never proves one is the best. When it fails, or an organiser wants a better
schedule, export the problem from the schedule section of the judging
console, run this on a laptop, and upload the solution it writes. The portal
re-validates every placement before saving, so a bad file cannot produce a
bad schedule.

    uv run packages/api/scripts/judging-schedule/cpsat.py problem.json -o solution.json

Without uv: `pip install ortools`, then `python cpsat.py problem.json -o solution.json`.
Try it on the bundled example first: `uv run cpsat.py example-problem.json`.

It solves the same model as the TypeScript solver:

  hard   every presentation in exactly one room that serves its challenge;
         one presentation per room per slot;
         between two presentations of one team, at least `sameGap` empty
         slots, or `crossGap` when they are in different buildings.
  goals  in this order, each one never traded for a later one:
         1. sponsor judging finishes early (last sponsor slot)
         2. sponsor rooms sit idle as little as possible
         3. everything finishes early
         4. teams change buildings as little as possible
         5. teams get as much break time as possible

If no schedule keeps the cross-building break, it retries giving
cross-building walks only the same-building break and marks the solution
`relaxed`; the portal makes an organiser confirm that before saving.

Judges
------
When the problem lists `judges`, the script goes on to the second stage: one
judge for every presentation, solved as its own CP-SAT model once the
placement is known.

  hard   a judge grades only challenges they may grade, and a guest only in
         their own room;
         one presentation per judge per slot;
         moving to another room in the same building needs `sameGap` empty
         slots, to another building `crossGap`; staying in one room needs none;
         at most `maxConsecutive` slots in a row, then a free slot.
  goals  in this order, each one never traded for a later one:
         1. every presentation has a judge (the rest is reported, not failed)
         2. sponsor presentations go to the sponsor's own judges, not to table
            judges (members)
         3. the busiest judge grades as little as possible
         4. judges of one pool (same challenges, same room) grade evenly
         5. a judge repeats a room as little as possible
         6. a judge's presentations cover as much of the day as possible, as
            judge-bias calibration assumes every judge sees a random sample

The placement stage then also keeps, in every slot, the presentations of a
challenge within the number of judges who may grade it, as far as it can
(goal 0, `judgeShortfall`, ahead of the five above).

A problem with `placements` is a schedule already made: the placement stage is
skipped and only the judges are assigned. `locked` lists assignments that must
stay as they are. Files without `judges` work as before.

Exit codes: 0 solved, 2 no schedule exists, 3 the time limit ran out before
any schedule was found, 1 bad input.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field

PROBLEM_FORMAT = "query-judging-schedule-problem"
SOLUTION_FORMAT = "query-judging-schedule-solution"
VERSION = 1

# Same as MAX_CONSECUTIVE and DAY_PARTS in judges.ts.
MAX_CONSECUTIVE = 4
DAY_PARTS = 4


class InputError(Exception):
    pass


@dataclass(frozen=True)
class Room:
    id: str
    challenge_id: str
    building_id: str
    sponsor: bool


@dataclass(frozen=True)
class Task:
    entry_id: str
    challenge_id: str
    sponsor: bool


@dataclass(frozen=True)
class Judge:
    id: str
    kind: str  # "member" or "guest"
    challenge_ids: frozenset[str]
    room_id: str | None
    max_consecutive: int


@dataclass
class Problem:
    fingerprint: str
    slot_count: int
    same_gap: int
    cross_gap: int
    rooms: list[Room]
    tasks: list[Task]
    hint: dict[tuple[str, str], tuple[str, int]]
    judges: list[Judge] = field(default_factory=list)
    # A finished schedule to assign judges to, instead of one to look for.
    fixed: dict[tuple[str, str], tuple[str, int]] | None = None
    # Assignments to keep: (entry id, challenge id) -> judge id.
    locked: dict[tuple[str, str], str] = field(default_factory=dict)
    # Assignments to start from, as `hint` is for the placement.
    assignment_hint: dict[tuple[str, str], str] = field(default_factory=dict)


def _require(obj: dict, key: str, kind: type, where: str):
    value = obj.get(key)
    # bool is an int in Python; never accept it where a count is expected.
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise InputError(f"{where}.{key} must be a {kind.__name__}")
    return value


def load_problem(raw: dict) -> Problem:
    if raw.get("format") != PROBLEM_FORMAT or raw.get("version") != VERSION:
        raise InputError(
            f"not a {PROBLEM_FORMAT} v{VERSION} file; export it again from the judging console"
        )
    slot_count = _require(raw, "slotCount", int, "problem")
    same_gap = _require(raw, "sameGap", int, "problem")
    cross_gap = _require(raw, "crossGap", int, "problem")
    if slot_count < 1 or same_gap < 0 or cross_gap < same_gap:
        raise InputError("need slotCount >= 1 and 0 <= sameGap <= crossGap")

    rooms = []
    for i, r in enumerate(_require(raw, "rooms", list, "problem")):
        where = f"rooms[{i}]"
        rooms.append(
            Room(
                _require(r, "id", str, where),
                _require(r, "challengeId", str, where),
                _require(r, "buildingId", str, where),
                _require(r, "sponsor", bool, where),
            )
        )
    if len({r.id for r in rooms}) != len(rooms):
        raise InputError("room ids repeat")

    tasks = []
    for i, t in enumerate(_require(raw, "tasks", list, "problem")):
        where = f"tasks[{i}]"
        tasks.append(
            Task(
                _require(t, "entryId", str, where),
                _require(t, "challengeId", str, where),
                _require(t, "sponsor", bool, where),
            )
        )
    if len({(t.entry_id, t.challenge_id) for t in tasks}) != len(tasks):
        raise InputError("a project appears twice for one challenge")

    hint = {}
    for p in raw.get("hint") or []:
        hint[(p["entryId"], p["challengeId"])] = (p["roomId"], p["slot"])

    judges = []
    for i, j in enumerate(_require(raw, "judges", list, "problem") if "judges" in raw else []):
        where = f"judges[{i}]"
        if not isinstance(j, dict):
            raise InputError(f"{where} must be an object")
        kind = _require(j, "kind", str, where)
        if kind not in ("member", "guest"):
            raise InputError(f"{where}.kind must be member or guest")
        challenge_ids = _require(j, "challengeIds", list, where)
        if not all(isinstance(c, str) for c in challenge_ids):
            raise InputError(f"{where}.challengeIds must be strings")
        room_id = j.get("roomId")
        if room_id is not None and not isinstance(room_id, str):
            raise InputError(f"{where}.roomId must be a string or null")
        max_consecutive = j.get("maxConsecutive", MAX_CONSECUTIVE)
        if not isinstance(max_consecutive, int) or isinstance(max_consecutive, bool) or max_consecutive < 1:
            raise InputError(f"{where}.maxConsecutive must be a positive integer")
        judges.append(
            Judge(_require(j, "id", str, where), kind, frozenset(challenge_ids), room_id, max_consecutive)
        )
    if len({j.id for j in judges}) != len(judges):
        raise InputError("judge ids repeat")

    fixed = None
    if raw.get("placements") is not None:
        room_ids = {r.id for r in rooms}
        known = {(t.entry_id, t.challenge_id) for t in tasks}
        fixed = {}
        for i, p in enumerate(_require(raw, "placements", list, "problem")):
            where = f"placements[{i}]"
            key = (_require(p, "entryId", str, where), _require(p, "challengeId", str, where))
            room_id = _require(p, "roomId", str, where)
            slot = _require(p, "slot", int, where)
            if key not in known or room_id not in room_ids or key in fixed:
                raise InputError(f"{where} does not match a presentation and room of this problem")
            if not 0 <= slot < slot_count:
                raise InputError(f"{where}.slot is outside the window")
            fixed[key] = (room_id, slot)
        if set(fixed) != known:
            raise InputError("placements must place every presentation")
        if not judges:
            raise InputError("placements without judges leave nothing to solve")

    locked = {}
    for i, row in enumerate(_require(raw, "locked", list, "problem") if "locked" in raw else []):
        where = f"locked[{i}]"
        locked[(_require(row, "entryId", str, where), _require(row, "challengeId", str, where))] = _require(
            row, "judgeId", str, where
        )

    assignment_hint = {}
    for i, row in enumerate(_require(raw, "assignmentHint", list, "problem") if "assignmentHint" in raw else []):
        where = f"assignmentHint[{i}]"
        assignment_hint[(_require(row, "entryId", str, where), _require(row, "challengeId", str, where))] = _require(
            row, "judgeId", str, where
        )

    return Problem(
        fingerprint=_require(raw, "fingerprint", str, "problem"),
        slot_count=slot_count,
        same_gap=same_gap,
        cross_gap=cross_gap,
        rooms=rooms,
        tasks=tasks,
        hint=hint,
        judges=judges,
        fixed=fixed,
        locked=locked,
        assignment_hint=assignment_hint,
    )


def capacity_problems(problem: Problem, gap: int) -> list[str]:
    """Reasons no schedule can exist, found by counting alone."""
    reasons = []
    rooms_per_challenge = defaultdict(int)
    for room in problem.rooms:
        rooms_per_challenge[room.challenge_id] += 1
    tasks_per_challenge = defaultdict(int)
    tasks_per_entry = defaultdict(int)
    for task in problem.tasks:
        tasks_per_challenge[task.challenge_id] += 1
        tasks_per_entry[task.entry_id] += 1

    for challenge, count in sorted(tasks_per_challenge.items()):
        capacity = rooms_per_challenge[challenge] * problem.slot_count
        if capacity == 0:
            reasons.append(f"challenge {challenge}: no active room serves it")
        elif count > capacity:
            reasons.append(
                f"challenge {challenge}: {count} presentations but only {capacity} room slots"
            )
    for entry, count in sorted(tasks_per_entry.items()):
        needed = count + (count - 1) * gap
        if needed > problem.slot_count:
            reasons.append(
                f"project {entry}: {count} presentations with breaks need {needed} slots, "
                f"the window has {problem.slot_count}"
            )
    return reasons


# Placement: task index -> (room index, slot).
Placement = dict[int, tuple[int, int]]


def score(problem: Problem, placement: Placement) -> dict[str, int]:
    """The five goals for a finished schedule, computed from placements alone."""
    rooms, tasks = problem.rooms, problem.tasks
    sponsor_finish = max(
        (placement[i][1] + 1 for i, t in enumerate(tasks) if t.sponsor), default=0
    )
    finish = max((slot + 1 for _, slot in placement.values()), default=0)

    slots_by_room = defaultdict(list)
    for room_index, slot in placement.values():
        slots_by_room[room_index].append(slot)
    sponsor_idle = sum(
        max(slots) - min(slots) + 1 - len(slots)
        for room_index, slots in slots_by_room.items()
        if rooms[room_index].sponsor
    )

    visits = defaultdict(list)
    for i, task in enumerate(tasks):
        room_index, slot = placement[i]
        visits[task.entry_id].append((slot, rooms[room_index].building_id))
    changes = breaks = 0
    for seq in visits.values():
        seq.sort()
        for (s1, b1), (s2, b2) in zip(seq, seq[1:]):
            changes += b1 != b2
            breaks += s2 - s1 - 1
    goals = {
        "sponsorFinish": sponsor_finish,
        "sponsorIdle": sponsor_idle,
        "finish": finish,
        "buildingChanges": changes,
        "breakSlots": breaks,
    }
    if problem.judges:
        # Ahead of the rest, as in solve().
        goals = {"judgeShortfall": shortfall(problem, placement), **goals}
    return goals


def judge_capacity(problem: Problem) -> dict[str, int]:
    """How many judges may grade each challenge that has presentations and any judge."""
    counts = defaultdict(int)
    for judge in problem.judges:
        for challenge in judge.challenge_ids:
            counts[challenge] += 1
    return {c: counts[c] for c in sorted({t.challenge_id for t in problem.tasks}) if counts[c] > 0}


def shortfall(problem: Problem, placement: Placement) -> int:
    """Presentations of a challenge in one slot beyond its judges, for the worst
    slot of each challenge, summed. 0 when judges could cover every slot."""
    capacity = judge_capacity(problem)
    per_slot = defaultdict(int)
    for i, task in enumerate(problem.tasks):
        per_slot[(task.challenge_id, placement[i][1])] += 1
    worst = defaultdict(int)
    for (challenge, _slot), count in per_slot.items():
        if challenge in capacity:
            worst[challenge] = max(worst[challenge], count - capacity[challenge])
    return sum(worst.values())


def violations(problem: Problem, placement: Placement, cross_gap: int) -> list[str]:
    """Independent re-check of the hard rules; empty when the schedule is valid."""
    rooms, tasks = problem.rooms, problem.tasks
    found = []
    taken = {}
    for i, task in enumerate(tasks):
        if i not in placement:
            found.append(f"{task.entry_id}/{task.challenge_id} is not placed")
            continue
        room_index, slot = placement[i]
        if rooms[room_index].challenge_id != task.challenge_id:
            found.append(f"{task.entry_id} is in a room for another challenge")
        if not 0 <= slot < problem.slot_count:
            found.append(f"{task.entry_id} is outside the window")
        if (room_index, slot) in taken:
            found.append(f"room {rooms[room_index].id} slot {slot} is double-booked")
        taken[(room_index, slot)] = i

    visits = defaultdict(list)
    for i, task in enumerate(tasks):
        if i in placement:
            room_index, slot = placement[i]
            visits[task.entry_id].append((slot, rooms[room_index].building_id))
    for entry, seq in visits.items():
        seq.sort()
        for (s1, b1), (s2, b2) in zip(seq, seq[1:]):
            gap = problem.same_gap if b1 == b2 else cross_gap
            if s2 - s1 - 1 < gap:
                found.append(f"project {entry} has {s2 - s1 - 1} empty slots, needs {gap}")
    return found


GOALS = ["sponsorFinish", "sponsorIdle", "finish", "buildingChanges", "breakSlots"]


def solve(problem: Problem, cross_gap: int, seconds: float, workers: int, log):
    """Lexicographic CP-SAT solve. Returns (status, placement or None)."""
    from ortools.sat.python import cp_model

    rooms, tasks = problem.rooms, problem.tasks
    last_slot = problem.slot_count - 1
    model = cp_model.CpModel()
    tracked = []

    def int_var(lo: int, hi: int, name: str):
        v = model.new_int_var(lo, hi, name)
        tracked.append(v)
        return v

    def flag(name: str):
        v = model.new_bool_var(name)
        tracked.append(v)
        return v

    building_index = {b: i for i, b in enumerate(sorted({r.building_id for r in rooms}))}
    room_index_by_id = {r.id: i for i, r in enumerate(rooms)}
    rooms_for = defaultdict(list)
    for i, room in enumerate(rooms):
        rooms_for[room.challenge_id].append(i)

    start, building, choices = [], [], []
    in_room = defaultdict(list)  # room index -> [(task index, literal)]
    for i, task in enumerate(tasks):
        eligible = rooms_for[task.challenge_id]
        s = int_var(0, last_slot, f"start_{i}")
        picks = []
        for r in eligible:
            lit = flag(f"task_{i}_room_{r}")
            picks.append((r, lit))
            in_room[r].append((i, lit))
        model.add_exactly_one(lit for _, lit in picks)
        values = [building_index[rooms[r].building_id] for r in eligible]
        b = int_var(min(values), max(values), f"building_{i}")
        model.add(b == sum(building_index[rooms[r].building_id] * lit for r, lit in picks))
        start.append(s)
        building.append(b)
        choices.append(picks)

    # A room holds one presentation per slot. Every presentation is one slot
    # long, so this is "all different" over the presentations it holds.
    for r, members in in_room.items():
        model.add_no_overlap(
            model.new_optional_fixed_size_interval_var(start[i], 1, lit, f"in_{r}_{i}")
            for i, lit in members
        )

    # Each team's presentations form a chain in time. A circuit through a depot
    # picks the order; each arc taken says "this one comes right after that
    # one", which is where the break (and any building change) happens.
    by_entry = defaultdict(list)
    for i, task in enumerate(tasks):
        by_entry[task.entry_id].append(i)

    changes, break_terms = [], []
    for entry, members in sorted(by_entry.items()):
        n = len(members)
        if n < 2:
            continue
        differs = {}
        for a in range(n):
            for c in range(a + 1, n):
                i, j = members[a], members[c]
                d = flag(f"differ_{i}_{j}")
                model.add(building[i] != building[j]).only_enforce_if(d)
                model.add(building[i] == building[j]).only_enforce_if(d.Not())
                differs[(i, j)] = differs[(j, i)] = d
        arcs = []
        for a, i in enumerate(members):
            arcs.append((0, a + 1, flag(f"first_{i}")))
            arcs.append((a + 1, 0, flag(f"last_{i}")))
            for c, j in enumerate(members):
                if i == j:
                    continue
                follows = flag(f"next_{i}_{j}")
                arcs.append((a + 1, c + 1, follows))
                d = differs[(i, j)]
                model.add(start[j] >= start[i] + 1 + problem.same_gap).only_enforce_if(follows)
                if cross_gap > problem.same_gap:
                    model.add(start[j] >= start[i] + 1 + cross_gap).only_enforce_if([follows, d])
                moved = flag(f"moved_{i}_{j}")
                model.add_bool_or([follows.Not(), d.Not(), moved])
                model.add_implication(moved, follows)
                model.add_implication(moved, d)
                changes.append(moved)
        model.add_circuit(arcs)

        first = int_var(0, last_slot, f"entry_first_{entry}")
        last = int_var(0, last_slot, f"entry_last_{entry}")
        model.add_min_equality(first, [start[i] for i in members])
        model.add_max_equality(last, [start[i] for i in members])
        # Along a chain the breaks add up to (last - first) - (n - 1).
        break_terms.append(last - first - (n - 1))

    # Goal variables, each defined exactly (not just bounded) so the values a
    # finished stage reports are a consistent hint for the next one.
    finish = int_var(0, problem.slot_count, "finish")
    model.add_max_equality(finish, [s + 1 for s in start])
    sponsor_starts = [start[i] + 1 for i, task in enumerate(tasks) if task.sponsor]
    sponsor_finish = int_var(0, problem.slot_count, "sponsor_finish")
    model.add_max_equality(sponsor_finish, sponsor_starts or [0])

    # Lower bounds from counting alone. Redundant, but they let CP-SAT prove a
    # goal optimal, and move on, the moment a schedule reaches them.
    def busiest(selected) -> int:
        per_challenge = defaultdict(int)
        for task in selected:
            per_challenge[task.challenge_id] += 1
        return max(
            (-(-count // len(rooms_for[c])) for c, count in per_challenge.items()),
            default=0,
        )

    longest_chain = max(
        (n + (n - 1) * problem.same_gap for n in map(len, by_entry.values())), default=0
    )
    model.add(finish >= max(busiest(tasks), longest_chain))
    model.add(sponsor_finish >= busiest([t for t in tasks if t.sponsor]))

    # Idle slots in a sponsor room: its span minus what it holds, 0 if unused.
    idle_terms = []
    for r, members in in_room.items():
        if not rooms[r].sponsor:
            continue
        used = flag(f"room_used_{r}")
        model.add_max_equality(used, [lit for _, lit in members])
        lows, highs = [], []
        for i, lit in members:
            low = int_var(0, last_slot, f"room_{r}_low_{i}")
            high = int_var(0, last_slot, f"room_{r}_high_{i}")
            model.add(low == start[i]).only_enforce_if(lit)
            model.add(low == last_slot).only_enforce_if(lit.Not())
            model.add(high == start[i]).only_enforce_if(lit)
            model.add(high == 0).only_enforce_if(lit.Not())
            lows.append(low)
            highs.append(high)
        lo = int_var(0, last_slot, f"room_first_{r}")
        hi = int_var(0, last_slot, f"room_last_{r}")
        model.add_min_equality(lo, lows)
        model.add_max_equality(hi, highs)
        idle = int_var(0, problem.slot_count, f"room_idle_{r}")
        model.add(idle == hi - lo + 1 - sum(lit for _, lit in members)).only_enforce_if(used)
        model.add(idle == 0).only_enforce_if(used.Not())
        idle_terms.append(idle)

    # Judges: in any slot, a challenge's presentations should not outnumber the
    # judges who may grade it. Kept as a goal, the first, rather than a rule: too
    # few judges must not make a schedule impossible. Each challenge's capacity
    # is its judges plus an extra, the most it is over in any slot.
    overloads = []
    for challenge, judges_for in judge_capacity(problem).items():
        members = [i for i, task in enumerate(tasks) if task.challenge_id == challenge]
        if len(members) <= judges_for:
            continue
        extra = int_var(0, len(members) - judges_for, f"judge_extra_{challenge}")
        model.add_cumulative(
            [model.new_fixed_size_interval_var(start[i], 1, f"at_{i}") for i in members],
            [1] * len(members),
            judges_for + extra,
        )
        overloads.append(extra)

    goals = {
        "judgeShortfall": sum(overloads),
        "sponsorFinish": sponsor_finish,
        "sponsorIdle": sum(idle_terms),
        "finish": finish,
        "buildingChanges": sum(changes),
        "breakSlots": -sum(break_terms),
    }
    stages = [g for g in GOALS if not (g == "sponsorIdle" and not idle_terms)
              and not (g == "sponsorFinish" and not any(t.sponsor for t in tasks))
              and not (g in ("buildingChanges", "breakSlots") and not break_terms)]
    if overloads:
        stages.insert(0, "judgeShortfall")

    def hint_placement(placement: Placement):
        model.clear_hints()
        for i, (r, slot) in placement.items():
            model.add_hint(start[i], slot)
            for room, lit in choices[i]:
                model.add_hint(lit, room == r)

    hinted: Placement = {}
    if problem.hint:
        for i, task in enumerate(tasks):
            got = problem.hint.get((task.entry_id, task.challenge_id))
            if got and got[0] in room_index_by_id:
                hinted[i] = (room_index_by_id[got[0]], got[1])
        hint_placement(hinted)

    def new_solver(limit: float):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(1.0, limit)
        solver.parameters.num_workers = workers
        solver.parameters.random_seed = 7
        return solver

    def take(solver) -> Placement:
        """The solver's schedule, also hinted in full for the next stage."""
        model.clear_hints()
        for v in tracked:
            model.add_hint(v, solver.value(v))
        return {
            i: (next(room for room, lit in choices[i] if solver.boolean_value(lit)),
                solver.value(start[i]))
            for i in range(len(tasks))
        }

    def model_value(goal: str, placement: Placement) -> int:
        return score(problem, placement)[goal] * (-1 if goal == "breakSlots" else 1)

    deadline = time.monotonic() + seconds
    # A complete hint that keeps every rule is already a schedule. Start from
    # it, so running out of time can only fail to improve it.
    best: Placement | None = None
    if hinted and not violations(problem, hinted, cross_gap):
        best = hinted
    else:
        # Nothing to start from: look for any schedule first, with the whole
        # attempt if it takes that, and let the goals share what is left.
        solver = new_solver(deadline - time.monotonic())
        solver.parameters.stop_after_first_solution = True
        model.minimize(goals[stages[0]])
        status = solver.solve(model)
        if status == cp_model.INFEASIBLE:
            return ("infeasible", None)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return ("unknown", None)
        best = take(solver)

    all_optimal = True
    for position, goal in enumerate(stages):
        # Hold this goal where the schedule in hand has it, so this stage can
        # only improve on it and later goals cannot trade it away.
        model.add(goals[goal] <= model_value(goal, best))
        remaining = deadline - time.monotonic()
        # The first goal outranks all the others, so it gets at least half;
        # later stages split what is left evenly.
        share = remaining / (len(stages) - position)
        if position == 0:
            share = max(share, remaining / 2)
        solver = new_solver(share)
        # Presolve costs seconds on a big event and every stage already starts
        # from a complete schedule, so skip it.
        solver.parameters.cp_model_presolve = False
        model.minimize(goals[goal])
        status = solver.solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            all_optimal = False
            log(f"  {goal}: {abs(model_value(goal, best))} "
                f"(no improvement within its time share, {solver.status_name(status)})")
            continue

        all_optimal = all_optimal and status == cp_model.OPTIMAL
        best = take(solver)
        value = int(solver.objective_value)
        log(f"  {goal}: {abs(value)}{'' if status == cp_model.OPTIMAL else ' (time limit)'}")
        model.add(goals[goal] <= value)

    return ("optimal" if all_optimal else "feasible", best)


# Assignment: task index -> judge index, or None when nobody grades it.
Assignment = dict[int, "int | None"]

# The second stage's goals, in order. Lower is better except the last.
JUDGE_GOALS = ["unassigned", "memberOnSponsor", "maxLoad", "loadSpread", "repeats", "dayPartsCovered"]


def may_grade(judge: Judge, task: Task, room: Room) -> bool:
    if task.challenge_id not in judge.challenge_ids:
        return False
    # A guest grades only in their own room, and with no room grades nowhere.
    if judge.room_id is not None:
        return judge.room_id == room.id
    return judge.kind != "guest"


def day_part(problem: Problem, slot: int) -> int:
    return min(DAY_PARTS - 1, slot * DAY_PARTS // problem.slot_count)


def judge_pools(problem: Problem) -> list[list[int]]:
    """Judges who are interchangeable (same challenges, same room); only within
    one of these can the load be evened out."""
    grouped = defaultdict(list)
    for k, judge in enumerate(problem.judges):
        grouped[(tuple(sorted(judge.challenge_ids)), judge.room_id or "")].append(k)
    return list(grouped.values())


def locked_tasks(problem: Problem) -> dict[int, int]:
    """Task index -> judge index for the assignments to keep that name a known
    presentation and judge."""
    task_index = {(t.entry_id, t.challenge_id): i for i, t in enumerate(problem.tasks)}
    judge_index = {j.id: k for k, j in enumerate(problem.judges)}
    return {
        task_index[key]: judge_index[judge_id]
        for key, judge_id in problem.locked.items()
        if key in task_index and judge_id in judge_index
    }


def judges_clash(problem: Problem, placement: Placement, i: int, q: int) -> bool:
    """Whether one judge cannot grade both: at the same time, or too soon to walk
    between their rooms. Staying in one room needs no walk."""
    (room_i, slot_i), (room_q, slot_q) = placement[i], placement[q]
    apart = abs(slot_i - slot_q)
    if apart == 0:
        return True
    if room_i == room_q:
        return False
    same = problem.rooms[room_i].building_id == problem.rooms[room_q].building_id
    return apart <= (problem.same_gap if same else problem.cross_gap)


def assignment_score(problem: Problem, placement: Placement, assignment: Assignment) -> dict[str, float]:
    """The second stage's goals for a finished assignment, from the assignment alone."""
    judges, tasks = problem.judges, problem.tasks
    load = [0] * len(judges)
    rooms_seen = [defaultdict(int) for _ in judges]
    parts_seen = [set() for _ in judges]
    unassigned = member_on_sponsor = 0
    for i, task in enumerate(tasks):
        k = assignment.get(i)
        if k is None:
            unassigned += 1
            continue
        load[k] += 1
        rooms_seen[k][placement[i][0]] += 1
        parts_seen[k].add(day_part(problem, placement[i][1]))
        member_on_sponsor += task.sponsor and judges[k].kind == "member"
    spread = sum(
        max(load[k] for k in pool) - min(load[k] for k in pool)
        for pool in judge_pools(problem)
        if len(pool) > 1
    )
    graders = [k for k in range(len(judges)) if load[k]]
    return {
        "unassigned": unassigned,
        "memberOnSponsor": member_on_sponsor,
        "maxLoad": max(load, default=0),
        "loadSpread": spread,
        "repeats": sum(count - 1 for seen in rooms_seen for count in seen.values()),
        "dayPartsCovered": sum(len(parts) for parts in parts_seen),
        "avgDistinctRooms": round(sum(len(rooms_seen[k]) for k in graders) / len(graders), 2) if graders else 0,
    }


def assignment_violations(problem: Problem, placement: Placement, assignment: Assignment) -> list[str]:
    """Independent re-check of the second stage's hard rules."""
    judges, tasks, rooms = problem.judges, problem.tasks, problem.rooms
    kept = locked_tasks(problem)
    found = []
    mine = defaultdict(list)
    for i, k in assignment.items():
        if k is None:
            continue
        mine[k].append(i)
        if i not in kept and not may_grade(judges[k], tasks[i], rooms[placement[i][0]]):
            found.append(f"judge {judges[k].id} may not grade {tasks[i].entry_id}/{tasks[i].challenge_id}")
    max_gap = max(problem.same_gap, problem.cross_gap)
    for k, members in mine.items():
        members.sort(key=lambda i: placement[i][1])
        for a, i in enumerate(members):
            for q in members[a + 1:]:
                if placement[q][1] - placement[i][1] > max_gap:
                    break
                if judges_clash(problem, placement, i, q):
                    found.append(f"judge {judges[k].id} cannot be at both {tasks[i].entry_id} and {tasks[q].entry_id}")
        run, previous = 0, -2
        for slot in sorted({placement[i][1] for i in members}):
            run = run + 1 if slot == previous + 1 else 1
            previous = slot
            if run == judges[k].max_consecutive + 1:
                found.append(f"judge {judges[k].id} grades more than {judges[k].max_consecutive} slots in a row")
    return found


def assign(problem: Problem, placement: Placement, seconds: float, workers: int, log):
    """Lexicographic CP-SAT solve of who grades what, once the schedule is fixed.
    Returns (status, assignment or None). A presentation nobody may grade, or
    that no judge has time for, is left out rather than failing the solve."""
    from ortools.sat.python import cp_model

    judges, tasks, rooms = problem.judges, problem.tasks, problem.rooms
    n = len(tasks)
    slot_of = [placement[i][1] for i in range(n)]
    room_of = [placement[i][0] for i in range(n)]
    kept = locked_tasks(problem)

    model = cp_model.CpModel()
    tracked = []

    def int_var(lo: int, hi: int, name: str):
        v = model.new_int_var(lo, hi, name)
        tracked.append(v)
        return v

    def flag(name: str):
        v = model.new_bool_var(name)
        tracked.append(v)
        return v

    # A kept presentation may go to its judge alone; the rest to whoever may grade it.
    eligible = [
        [kept[i]] if i in kept
        else [k for k, judge in enumerate(judges) if may_grade(judge, tasks[i], rooms[room_of[i]])]
        for i in range(n)
    ]
    pick = {(i, k): flag(f"task_{i}_judge_{k}") for i in range(n) for k in eligible[i]}
    left_out = [flag(f"left_out_{i}") for i in range(n)]
    for i in range(n):
        model.add_exactly_one([pick[i, k] for k in eligible[i]] + [left_out[i]])
        if i in kept:
            model.add(pick[i, kept[i]] == 1)

    max_gap = max(problem.same_gap, problem.cross_gap)
    by_slot = defaultdict(list)
    for i in range(n):
        by_slot[slot_of[i]].append(i)

    mine = []  # judge -> {task: literal}
    for k, judge in enumerate(judges):
        grades = {i: pick[i, k] for i in range(n) if (i, k) in pick}
        mine.append(grades)
        # One place at a time, and time to walk between rooms.
        for i, lit in grades.items():
            for slot in range(slot_of[i], slot_of[i] + max_gap + 1):
                for q in by_slot.get(slot, ()):
                    if q not in grades or (slot == slot_of[i] and q <= i):
                        continue
                    if judges_clash(problem, placement, i, q):
                        model.add_bool_or([lit.Not(), grades[q].Not()])
        # No more than max_consecutive slots in a row: any window one longer
        # holds at most max_consecutive.
        run = judge.max_consecutive
        in_slot = defaultdict(list)
        for i, lit in grades.items():
            in_slot[slot_of[i]].append(lit)
        for first in range(problem.slot_count - run):
            window = [lit for slot in range(first, first + run + 1) for lit in in_slot.get(slot, ())]
            if len(window) > run:
                model.add(sum(window) <= run)

    load = []
    for k, grades in enumerate(mine):
        v = int_var(0, len(grades), f"load_{k}")
        model.add(v == sum(grades.values()))
        load.append(v)

    # Goals, each (name, expression to minimise, whether it has anything to decide).
    member_on_sponsor = [
        pick[i, k] for (i, k) in pick if tasks[i].sponsor and judges[k].kind == "member"
    ]
    busiest = int_var(0, n, "busiest")
    if load:
        model.add_max_equality(busiest, load)
    spreads = []
    for pool in judge_pools(problem):
        if len(pool) < 2:
            continue
        high, low = int_var(0, n, "pool_high"), int_var(0, n, "pool_low")
        for k in pool:
            model.add(high >= load[k])
            model.add(low <= load[k])
        spreads.append(high - low)
    rooms_used, parts_used = [], []
    for k, grades in enumerate(mine):
        in_room, in_part = defaultdict(list), defaultdict(list)
        for i, lit in grades.items():
            in_room[room_of[i]].append(lit)
            in_part[day_part(problem, slot_of[i])].append(lit)
        for lits, used in ((in_room, rooms_used), (in_part, parts_used)):
            for group in lits.values():
                seen = flag(f"seen_{k}_{len(used)}")
                model.add(seen <= sum(group))
                used.append(seen)

    stages = [
        ("unassigned", sum(left_out), n > 0),
        ("memberOnSponsor", sum(member_on_sponsor), bool(member_on_sponsor)),
        ("maxLoad", busiest, bool(load)),
        ("loadSpread", sum(spreads), bool(spreads)),
        ("repeats", -sum(rooms_used), bool(rooms_used)),
        ("dayPartsCovered", -sum(parts_used), bool(parts_used)),
    ]
    stages = [(name, expression) for name, expression, decides in stages if decides]

    def new_solver(limit: float):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(1.0, limit)
        solver.parameters.num_workers = workers
        solver.parameters.random_seed = 7
        # Presolve and the symmetry search cost seconds on a big event, longer
        # than a stage's share, and every stage after the first starts from a
        # complete assignment, so skip both.
        solver.parameters.cp_model_presolve = False
        solver.parameters.symmetry_level = 0
        return solver

    def take(solver) -> Assignment:
        model.clear_hints()
        for v in tracked:
            model.add_hint(v, solver.value(v))
        return {
            i: next((k for k in eligible[i] if solver.boolean_value(pick[i, k])), None)
            for i in range(n)
        }

    # Start from the hinted assignment where it names a pair the model has. One
    # that keeps every rule is already an answer, as a good `hint` is for the
    # placement, so running out of time can only fail to improve it.
    judge_index = {j.id: k for k, j in enumerate(judges)}
    task_index = {(t.entry_id, t.challenge_id): i for i, t in enumerate(tasks)}
    hinted: Assignment = {i: kept.get(i) for i in range(n)}
    for key, judge_id in problem.assignment_hint.items():
        i, k = task_index.get(key), judge_index.get(judge_id)
        if i is not None and k is not None and (i, k) in pick and i not in kept:
            hinted[i] = k
    deadline = time.monotonic() + seconds
    best: Assignment | None = None
    if problem.assignment_hint:
        model.clear_hints()
        for (i, k), lit in pick.items():
            model.add_hint(lit, hinted[i] == k)
        for i in range(n):
            model.add_hint(left_out[i], hinted[i] is None)
        if not assignment_violations(problem, placement, hinted):
            best = hinted
    all_optimal = True
    for position, (name, expression) in enumerate(stages):
        remaining = deadline - time.monotonic()
        share = remaining / (len(stages) - position)
        if position == 0:
            share = max(share, remaining / 2)
        solver = new_solver(share)
        model.minimize(expression)
        status = solver.solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if status == cp_model.INFEASIBLE and position == 0:
                return ("infeasible", None)
            if best is None:
                return ("unknown", None)
            all_optimal = False
            log(f"  {name}: no improvement within its time share, {solver.status_name(status)}")
            continue
        all_optimal = all_optimal and status == cp_model.OPTIMAL
        best = take(solver)
        value = int(solver.objective_value)
        shown = assignment_score(problem, placement, best)[name]
        log(f"  {name}: {shown}{'' if status == cp_model.OPTIMAL else ' (time limit)'}")
        model.add(expression <= value)

    if best is None:
        # Nothing to decide: every presentation is left out or settled by its kept judge.
        best = {i: kept.get(i) for i in range(n)}
    return ("optimal" if all_optimal else "feasible", best)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("problem", help="problem.json exported from the judging console, "
                                        "or - to read it from stdin")
    parser.add_argument("-o", "--output", help="where to write solution.json (default: stdout)")
    parser.add_argument("--time-limit", type=float, default=120.0,
                        help="seconds for each attempt (strict, then relaxed); default 120")
    parser.add_argument("--workers", type=int, default=8,
                        help="search threads; default 8. With 1, a run repeats exactly only if "
                             "no goal is cut short by the time limit")
    args = parser.parse_args(argv)

    def log(message: str):
        print(message, file=sys.stderr)

    from_stdin = args.problem == "-"
    try:
        if from_stdin:
            text = sys.stdin.buffer.read().decode("utf-8-sig")
        else:
            with open(args.problem, encoding="utf-8-sig") as handle:
                text = handle.read()
        problem = load_problem(json.loads(text))
    except (OSError, ValueError, KeyError, TypeError, InputError) as error:
        log(f"cannot read {'stdin' if from_stdin else args.problem}: {error}")
        return 1

    try:
        import ortools
    except ImportError:
        log("OR-Tools is not installed. Run this with `uv run`, or `pip install ortools` first.")
        return 1

    log(f"{len(problem.tasks)} presentations, {len(problem.rooms)} rooms, "
        f"{problem.slot_count} slots (OR-Tools {ortools.__version__})")

    began = time.monotonic()
    status, placement, relaxed = "infeasible", None, False
    reasons: list[str] = []
    if problem.fixed is not None:
        # The schedule is decided; only the judges remain.
        room_index = {r.id: i for i, r in enumerate(problem.rooms)}
        placement = {
            i: (room_index[problem.fixed[t.entry_id, t.challenge_id][0]],
                problem.fixed[t.entry_id, t.challenge_id][1])
            for i, t in enumerate(problem.tasks)
        }
        status = "optimal"
    else:
        attempts = [(False, problem.cross_gap)]
        if problem.cross_gap > problem.same_gap:
            attempts.append((True, problem.same_gap))

        reasons = capacity_problems(problem, problem.same_gap)
        for relaxed, cross_gap in [] if reasons else attempts:
            log("relaxed: cross-building walks get the same-building break" if relaxed
                else "strict: full cross-building breaks")
            status, placement = solve(problem, cross_gap, args.time_limit, args.workers, log)
            if placement is not None:
                broken = violations(problem, placement, cross_gap)
                if broken:
                    # Would be a bug in the model above; never hand the portal a bad file.
                    log("internal check failed: " + "; ".join(broken[:5]))
                    return 1
                break
            if status == "unknown":
                # Running out of time proves nothing, so the breaks are only
                # shortened once the full ones are shown to be impossible.
                break

    assignment: Assignment | None = None
    assignment_status = None
    if placement is not None and problem.judges:
        log(f"{len(problem.judges)} judges")
        assignment_status, assignment = assign(problem, placement, args.time_limit, args.workers, log)
        if assignment is not None:
            broken = assignment_violations(problem, placement, assignment)
            if broken:
                log("internal check failed: " + "; ".join(broken[:5]))
                return 1
        elif problem.fixed is not None:
            # Nothing else to hand back.
            status = assignment_status
            reasons = ["the assignments to keep break the judges' rules"] if status == "infeasible" else []

    solved = placement is not None and (problem.fixed is None or assignment is not None)
    solution = {
        "format": SOLUTION_FORMAT,
        "version": VERSION,
        "fingerprint": problem.fingerprint,
        "status": status if not (solved and problem.fixed is not None) else assignment_status,
        "relaxed": relaxed if solved else False,
        "objective": score(problem, placement) if solved else None,
        "placements": [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "roomId": problem.rooms[r].id,
                "slot": slot,
            }
            for i, (r, slot) in sorted(placement.items())
        ] if solved else [],
        "reasons": reasons,
        "solver": {
            "name": "cp-sat",
            "ortools": ortools.__version__,
            "seconds": round(time.monotonic() - began, 2),
        },
    }
    if assignment is not None:
        solution["assignmentStatus"] = assignment_status
        solution["judging"] = assignment_score(problem, placement, assignment)
        solution["assignments"] = [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "judgeId": problem.judges[k].id,
            }
            for i, k in sorted(assignment.items())
            if k is not None
        ]
    text = json.dumps(solution, indent=2) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(text)
    else:
        sys.stdout.write(text)

    if solved:
        log(f"{solution['status']}{', relaxed' if solution['relaxed'] else ''}: "
            + ", ".join(f"{k} {v}" for k, v in solution["objective"].items()))
        if assignment is not None:
            log(f"judges ({assignment_status}): "
                + ", ".join(f"{k} {v}" for k, v in solution["judging"].items()))
        return 0
    if status == "unknown":
        log("no schedule found within the time limit; try a larger --time-limit")
        return 3
    log("no schedule exists for this window and these rooms")
    for reason in reasons:
        log(f"  {reason}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
