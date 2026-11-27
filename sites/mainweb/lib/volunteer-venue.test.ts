import { describe, expect, it } from "vitest";
import { volunteerVenue } from "./volunteer-venue";

describe("volunteerVenue", () => {
  it("is Klaus for a Hacklytics edition, whatever its location says", () => {
    expect(
      volunteerVenue({
        name: "Hacklytics: Digital Bloom",
        location: "Klaus Advanced Computing Building",
      }),
    ).toBe("Klaus");
    expect(volunteerVenue({ name: "Hacklytics 2028" })).toBe("Klaus");
  });

  it("is another edition's own location, or the venue when it has none", () => {
    expect(volunteerVenue({ name: "Spring Build Jam", location: " Tech Square " })).toBe(
      "Tech Square",
    );
    expect(volunteerVenue({ name: "Spring Build Jam", location: null })).toBe("the venue");
    expect(volunteerVenue({ name: "Spring Build Jam", location: "  " })).toBe("the venue");
  });
});
