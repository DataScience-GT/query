import { describe, expect, it } from "vitest";
import { distance, ZONE_HOP } from "./distance";

const table = (
  number: number,
  zoneId: string | null = null,
  x: number | null = null,
  y: number | null = null,
) => ({ number, zoneId, x, y });

describe("distance", () => {
  it("is the table-number gap inside one zone", () => {
    expect(distance(table(4, "hall"), table(11, "hall"))).toBe(7);
  });

  it("is the same gap when neither table has a zone", () => {
    expect(distance(table(4), table(11))).toBe(7);
  });

  it("adds a zone hop when the rooms differ", () => {
    expect(distance(table(4, "hall"), table(6, "atrium"))).toBe(ZONE_HOP + 2);
  });

  it("uses the floor plan when both tables have coordinates", () => {
    expect(distance(table(1, "hall", 0, 0), table(9, "atrium", 3, 4))).toBe(5);
  });

  it("falls back to numbers when only one table is placed", () => {
    expect(distance(table(1, "hall", 0, 0), table(4, "hall"))).toBe(3);
  });
});
