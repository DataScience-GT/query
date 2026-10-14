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

Exit codes: 0 solved, 2 no schedule exists, 3 the time limit ran out before
any schedule was found, 1 bad input.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from dataclasses import dataclass

PROBLEM_FORMAT = "query-judging-schedule-problem"
SOLUTION_FORMAT = "query-judging-schedule-solution"
VERSION = 1


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


@dataclass
class Problem:
    fingerprint: str
    slot_count: int
    same_gap: int
    cross_gap: int
    rooms: list[Room]
    tasks: list[Task]
    hint: dict[tuple[str, str], tuple[str, int]]


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

    return Problem(
        fingerprint=_require(raw, "fingerprint", str, "problem"),
        slot_count=slot_count,
        same_gap=same_gap,
        cross_gap=cross_gap,
        rooms=rooms,
        tasks=tasks,
        hint=hint,
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
    return {
        "sponsorFinish": sponsor_finish,
        "sponsorIdle": sponsor_idle,
        "finish": finish,
        "buildingChanges": changes,
        "breakSlots": breaks,
    }


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

    goals = {
        "sponsorFinish": sponsor_finish,
        "sponsorIdle": sum(idle_terms),
        "finish": finish,
        "buildingChanges": sum(changes),
        "breakSlots": -sum(break_terms),
    }
    stages = [g for g in GOALS if not (g == "sponsorIdle" and not idle_terms)
              and not (g == "sponsorFinish" and not any(t.sponsor for t in tasks))
              and not (g in ("buildingChanges", "breakSlots") and not break_terms)]

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
    attempts = [(False, problem.cross_gap)]
    if problem.cross_gap > problem.same_gap:
        attempts.append((True, problem.same_gap))

    status, placement, relaxed = "infeasible", None, False
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

    solution = {
        "format": SOLUTION_FORMAT,
        "version": VERSION,
        "fingerprint": problem.fingerprint,
        "status": status,
        "relaxed": relaxed if placement is not None else False,
        "objective": score(problem, placement) if placement is not None else None,
        "placements": [
            {
                "entryId": problem.tasks[i].entry_id,
                "challengeId": problem.tasks[i].challenge_id,
                "roomId": problem.rooms[r].id,
                "slot": slot,
            }
            for i, (r, slot) in sorted(placement.items())
        ] if placement is not None else [],
        "reasons": reasons,
        "solver": {
            "name": "cp-sat",
            "ortools": ortools.__version__,
            "seconds": round(time.monotonic() - began, 2),
        },
    }
    text = json.dumps(solution, indent=2) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(text)
    else:
        sys.stdout.write(text)

    if placement is not None:
        log(f"{status}{', relaxed' if solution['relaxed'] else ''}: "
            + ", ".join(f"{k} {v}" for k, v in solution["objective"].items()))
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
