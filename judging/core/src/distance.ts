/**
 * How far one table is from another.
 *
 * Same zone: the difference in table numbers, which is the walk.
 * Another zone: a hop larger than any table gap, then the number difference,
 * so a same-zone walk always beats changing rooms.
 * When both tables have coordinates, the floor plan wins and the distance
 * is Euclidean.
 */

export type TablePoint = {
  number: number;
  zoneId: string | null;
  x: number | null;
  y: number | null;
};

/** Larger than any table-number gap, so a zone change never sorts as "near". */
export const ZONE_HOP = 1_000_000;

export function distance(a: TablePoint, b: TablePoint): number {
  if (a.x !== null && a.y !== null && b.x !== null && b.y !== null) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  const diff = Math.abs(a.number - b.number);
  if (a.zoneId !== null && b.zoneId !== null && a.zoneId !== b.zoneId) {
    return ZONE_HOP + diff;
  }
  return diff;
}
