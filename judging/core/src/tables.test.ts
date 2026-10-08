import { describe, expect, it } from "vitest";
import { assignTables } from "./tables";

describe("assignTables", () => {
  it("alternates tracks across table numbers", () => {
    const seated = assignTables(
      [
        { id: "a1", trackId: "sponsor" },
        { id: "a2", trackId: "sponsor" },
        { id: "b1", trackId: "general" },
        { id: "b2", trackId: "general" },
      ],
      [
        { number: 1, zoneId: "hall" },
        { number: 2, zoneId: "hall" },
        { number: 3, zoneId: "hall" },
        { number: 4, zoneId: "hall" },
      ],
    );
    expect(seated.map((row) => row.projectId)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(seated.map((row) => row.tableNumber)).toEqual([1, 2, 3, 4]);
  });

  it("leaves extra projects unseated when tables run out", () => {
    const seated = assignTables(
      [
        { id: "a", trackId: null },
        { id: "b", trackId: null },
      ],
      [{ number: 9, zoneId: null }],
    );
    expect(seated).toEqual([{ projectId: "a", tableNumber: 9, zoneId: null }]);
  });
});
