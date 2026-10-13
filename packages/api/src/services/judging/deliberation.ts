// A judge's private shortlist: sections they name ("Top three", "Maybe"),
// each holding projects they have finished judging, with a note apiece. Pure
// helpers for ordering; the desk router does the reads and writes.

/**
 * Whether `requested` is a reordering of `current`: the same ids, each once.
 * A list from a stale screen (a row added or removed in another tab) is not,
 * and is refused rather than half-applied.
 */
export function isReordering(
  current: readonly string[],
  requested: readonly string[],
): boolean {
  if (current.length !== requested.length) return false;
  const remaining = new Set(current);
  for (const id of requested) {
    if (!remaining.delete(id)) return false;
  }
  return remaining.size === 0;
}

/** The display order for a row appended after rows holding `orders`. */
export function nextOrder(orders: readonly number[]): number {
  let highest = -1;
  for (const order of orders) if (order > highest) highest = order;
  return highest + 1;
}

/** Sections, each with its entries, both by display order; ties keep input order. */
export function groupSections<
  S extends { id: string; displayOrder: number },
  E extends { sectionId: string; displayOrder: number },
>(sections: readonly S[], entries: readonly E[]): (S & { entries: E[] })[] {
  const byOrder = <T extends { displayOrder: number }>(a: T, b: T) =>
    a.displayOrder - b.displayOrder;
  return [...sections].sort(byOrder).map((section) => ({
    ...section,
    entries: entries
      .filter((entry) => entry.sectionId === section.id)
      .sort(byOrder),
  }));
}
