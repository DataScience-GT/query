// Pure helpers over one edition's challenge list. Challenges form a shallow
// tree: a group (say "MLH Challenges") holds child challenges, and a child is
// judged the way its root is. Rooms serve a root, and guest judges are locked
// to their room's challenge and everything below it.

export type ChallengeMode = "scheduled" | "unscheduled" | "remote";

/** The columns these helpers need from a judging_challenge row. */
export type ChallengeNode = {
  id: string;
  parentId: string | null;
  mode: ChallengeMode;
};

/**
 * The top of the tree that `id` sits in: itself when it has no parent. Null
 * when `id` is not in the list, or when the parent links loop.
 */
export function rootOf<T extends ChallengeNode>(
  challenges: readonly T[],
  id: string,
): T | null {
  const byId = new Map(challenges.map((c) => [c.id, c]));
  let current = byId.get(id);
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const parent = current.parentId ? byId.get(current.parentId) : undefined;
    if (!parent) return current;
    current = parent;
  }

  return null;
}

/** How a challenge is judged: always its root's mode. Null when unknown. */
export function effectiveMode(
  challenges: readonly ChallengeNode[],
  id: string,
): ChallengeMode | null {
  return rootOf(challenges, id)?.mode ?? null;
}

/**
 * Every challenge below `id` (children, their children, …), not `id` itself,
 * in list order within each level.
 */
export function descendantsOf<T extends ChallengeNode>(
  challenges: readonly T[],
  id: string,
): T[] {
  const found: T[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];

  while (frontier.length > 0) {
    const parents = new Set(frontier);
    frontier = [];
    for (const challenge of challenges) {
      if (
        challenge.parentId &&
        parents.has(challenge.parentId) &&
        !seen.has(challenge.id)
      ) {
        seen.add(challenge.id);
        found.push(challenge);
        frontier.push(challenge.id);
      }
    }
  }

  return found;
}

/** A label as stored: trimmed, runs of whitespace collapsed to one space. */
export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

/** Whether two labels name the same challenge, ignoring case and spacing. */
export function sameLabel(a: string, b: string): boolean {
  return normalizeLabel(a).toLowerCase() === normalizeLabel(b).toLowerCase();
}
