import { describe, expect, it } from "vitest";
import { volunteerCsv } from "./volunteer-csv";
import type { VolunteerCsvRow } from "./volunteer-csv";

const start = "2027-02-26T22:00:00Z";

const inPerson: VolunteerCsvRow = {
  status: "approved",
  mode: "in_person",
  createdAt: "2027-01-12T15:30:00.000Z",
  user: { name: "Mara Okafor", email: "mara@example.com" },
  answers: {
    mode: "in_person",
    affiliation: "alum",
    availability: ["fri_setup", "sat_morning"],
    roles: ["check_in", "meals"],
    experience: "Ran registration, twice.",
    shirtSize: "M",
    dietary: ["Vegetarian", "Other: no shellfish"],
    phone: "(404) 555-0142",
    acknowledged: true,
  },
};

const mentor: VolunteerCsvRow = {
  status: "pending",
  mode: "online",
  createdAt: "2027-01-13T09:00:00.000Z",
  user: { name: "Jun Park", email: "jun@example.com" },
  answers: {
    mode: "online",
    affiliation: "industry",
    topics: ["python", "other"],
    topicOther: "Rust",
    onlineAvailability: ["o_fri_evening", "o_sat_late"],
    mentorExperience: "Four years on ML services.",
    acknowledged: true,
  },
};

const both: VolunteerCsvRow = {
  ...inPerson,
  mode: "both",
  answers: {
    ...inPerson.answers,
    ...mentor.answers,
    mode: "both",
    phone: "(404) 555-0142",
    availability: ["sat_morning"],
    roles: ["help_desk"],
    shirtSize: "L",
    dietary: [],
  } as VolunteerCsvRow["answers"],
};

const HEADER =
  "Name,Email,Phone,Status,Type,Affiliation,Availability,Roles,Experience,Shirt size,Dietary restrictions,Mentor topics,Online availability (Eastern),Mentor experience,Applied at";

describe("volunteerCsv", () => {
  it("writes the type, and labels instead of ids, for someone in person", () => {
    const [header, line, ...rest] = volunteerCsv([inPerson], start).split("\n");
    expect(rest).toEqual([]);
    expect(header).toBe(HEADER);
    expect(line).toBe(
      [
        "Mara Okafor",
        "mara@example.com",
        "(404) 555-0142",
        "approved",
        "In person",
        "Alum",
        '"Friday, Feb 26: Afternoon setup; Saturday, Feb 27: Morning"',
        "Check-in desk and badges; Meals and snacks",
        '"Ran registration, twice."',
        "M",
        "Vegetarian; Other: no shellfish",
        "", // Mentor topics
        "", // Online availability
        "", // Mentor experience
        "2027-01-12T15:30:00.000Z",
      ].join(","),
    );
  });

  it("writes an online mentor's topics, hours in Eastern time and experience, with the venue's cells empty", () => {
    const line = volunteerCsv([mentor], start).split("\n")[1];
    expect(line).toBe(
      [
        "Jun Park",
        "jun@example.com",
        "", // No phone given
        "pending",
        "Online mentor",
        "Industry",
        "", // Availability
        "", // Roles
        "", // Experience
        "", // Shirt size
        "", // Dietary
        "Python; Other: Rust",
        '"Friday, Feb 26: 6 to 10 pm ET; Saturday, Feb 27: 10 pm to 2 am ET"',
        "Four years on ML services.",
        "2027-01-13T09:00:00.000Z",
      ].join(","),
    );
  });

  it("fills both halves for someone who chose both", () => {
    const cells = volunteerCsv([both], start).split("\n")[1] ?? "";
    expect(cells).toContain(",Both,");
    expect(cells).toContain("Friday, Feb 26: 6 to 10 pm ET");
    expect(cells).toContain("Saturday, Feb 27: Morning");
    expect(cells).toContain(",L,None,");
  });

  it("does not let a typed cell run as a spreadsheet formula", () => {
    const csv = volunteerCsv(
      [
        {
          ...inPerson,
          user: { name: '=HYPERLINK("http://x","y")', email: "m@example.com" },
          answers: { ...inPerson.answers, experience: "+1 everything" } as VolunteerCsvRow["answers"],
        },
        {
          ...mentor,
          answers: { ...mentor.answers, mentorExperience: "@sum(a1)" } as VolunteerCsvRow["answers"],
        },
      ],
      start,
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain("'+1 everything");
    expect(csv).toContain("'@sum(a1)");
  });

  it("reads 'None' for no dietary restriction and an empty cell for no note", () => {
    const csv = volunteerCsv(
      [
        {
          ...inPerson,
          answers: { ...inPerson.answers, dietary: [], experience: undefined } as VolunteerCsvRow["answers"],
        },
      ],
      start,
    );
    expect(csv.split("\n")[1]).toContain(",,M,None,");
  });
});
