import { describe, expect, it } from "vitest";
import { volunteerCsv } from "./volunteer-csv";
import type { VolunteerCsvRow } from "./volunteer-csv";

const start = "2027-02-26T22:00:00Z";

const row = (over: Partial<VolunteerCsvRow> = {}): VolunteerCsvRow => ({
  status: "approved",
  createdAt: "2027-01-12T15:30:00.000Z",
  user: { name: "Mara Okafor", email: "mara@example.com" },
  answers: {
    affiliation: "alum",
    availability: ["fri_setup", "sat_morning"],
    roles: ["check_in", "meals"],
    experience: "Ran registration, twice.",
    shirtSize: "M",
    dietary: ["Vegetarian", "Other: no shellfish"],
    phone: "(404) 555-0142",
    acknowledged: true,
  },
  ...over,
});

describe("volunteerCsv", () => {
  it("writes a header and one line per volunteer, with labels instead of ids", () => {
    const [header, line, ...rest] = volunteerCsv([row()], start).split("\n");
    expect(rest).toEqual([]);
    expect(header).toBe(
      "Name,Email,Phone,Status,Affiliation,Availability,Roles,Experience,Shirt size,Dietary restrictions,Applied at",
    );
    expect(line).toBe(
      [
        "Mara Okafor",
        "mara@example.com",
        "(404) 555-0142",
        "approved",
        "Alum",
        '"Friday, Feb 26: Afternoon setup; Saturday, Feb 27: Morning"',
        "Check-in desk and badges; Meals and snacks",
        "\"Ran registration, twice.\"",
        "M",
        "Vegetarian; Other: no shellfish",
        "2027-01-12T15:30:00.000Z",
      ].join(","),
    );
  });

  it("does not let a typed cell run as a spreadsheet formula", () => {
    const csv = volunteerCsv(
      [
        row({
          user: { name: '=HYPERLINK("http://x","y")', email: "m@example.com" },
          answers: { ...row().answers, experience: "+1 everything" },
        }),
      ],
      start,
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain("'+1 everything");
  });

  it("reads 'None' for no dietary restriction and an empty cell for no note", () => {
    const csv = volunteerCsv(
      [row({ answers: { ...row().answers, dietary: [], experience: undefined } })],
      start,
    );
    expect(csv.split("\n")[1]).toContain(",,M,None,");
  });
});
