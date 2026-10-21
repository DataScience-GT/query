import { describe, expect, it } from "vitest";
import {
  DevpostFileError,
  httpUrl,
  parseCsv,
  parseDevpostDate,
  readDevpostExport,
  splitList,
  submissionKey,
} from "./devpost";

describe("parseCsv", () => {
  it("splits plain rows and cells", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas, doubled quotes and line breaks inside quoted cells", () => {
    const text =
      'title,about\n"Tidewater, v2","We said ""ship it""\r\nand did"\n';
    expect(parseCsv(text)).toEqual([
      ["title", "about"],
      ["Tidewater, v2", 'We said "ship it"\r\nand did'],
    ]);
  });

  it("reads CRLF, LF and bare CR line endings alike", () => {
    expect(parseCsv("a,b\r\n1,2\r3,4\n5,6")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  it("drops a byte-order mark", () => {
    const [header] = parseCsv("\uFEFFProject Title,Submission Url\n");
    expect(header![0]).toBe("Project Title");
  });

  it("drops blank lines and rows of bare commas", () => {
    expect(parseCsv("a,b\n\n1,2\r\n,,\n\r\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps an empty last cell and a final row with no newline", () => {
    expect(parseCsv("a,b\n1,")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });

  it("reads an empty quoted cell as empty", () => {
    expect(parseCsv('a,"",c\n')).toEqual([["a", "", "c"]]);
  });

  it("keeps a stray quote in the middle of an unquoted cell", () => {
    expect(parseCsv('a,6" monitor\n')).toEqual([["a", '6" monitor']]);
  });

  it("refuses a quote that is never closed", () => {
    expect(() => parseCsv('a,b\n"open,2\n3,4\n')).toThrow(DevpostFileError);
  });
});

describe("helpers", () => {
  it("httpUrl keeps http and https only, without the fragment", () => {
    expect(httpUrl(" https://tidewater.vercel.app/#demo ")).toBe(
      "https://tidewater.vercel.app/",
    );
    expect(httpUrl("http://example.org/a?b=1")).toBe("http://example.org/a?b=1");
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("ftp://files.example.org/x")).toBeNull();
    expect(httpUrl("github.com/team/repo")).toBeNull();
    expect(httpUrl("")).toBeNull();
  });

  it("submissionKey treats a trailing slash and host case as the same URL", () => {
    expect(submissionKey("https://Devpost.com/software/tidewater/")).toBe(
      submissionKey("https://devpost.com/software/tidewater"),
    );
    expect(submissionKey("devpost.com/software/tidewater")).toBeNull();
  });

  it("splitList splits on semicolons, commas and newlines, once each", () => {
    expect(splitList("python; react,  Snowflake\nreact\r\n")).toEqual([
      "python",
      "react",
      "Snowflake",
    ]);
    expect(splitList("")).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
  });

  describe("parseDevpostDate", () => {
    const expected = new Date("2027-02-08T14:03:22Z");

    it("reads ISO-style and US-style timestamps without a zone as UTC", () => {
      expect(parseDevpostDate("2027-02-08 14:03:22")).toEqual(expected);
      expect(parseDevpostDate("02/08/2027 14:03:22")).toEqual(expected);
      expect(parseDevpostDate("2/8/2027 2:03:22 PM")).toEqual(expected);
    });

    it("applies an explicit offset", () => {
      expect(parseDevpostDate("2027-02-08 09:03:22 -0500")).toEqual(expected);
      expect(parseDevpostDate("2027-02-08T14:03:22Z")).toEqual(expected);
    });

    it("handles midnight and noon on a 12-hour clock", () => {
      expect(parseDevpostDate("02/08/2027 12:00 AM")).toEqual(
        new Date("2027-02-08T00:00:00Z"),
      );
      expect(parseDevpostDate("02/08/2027 12:00 PM")).toEqual(
        new Date("2027-02-08T12:00:00Z"),
      );
    });

    it("is null for blank or unreadable values", () => {
      expect(parseDevpostDate("")).toBeNull();
      expect(parseDevpostDate("sometime Saturday")).toBeNull();
      expect(parseDevpostDate("13/40/2027 10:00")).toBeNull();
    });
  });
});

// A Devpost submissions export, written the way Devpost writes it: one row
// per opt-in prize, team members as triples after the count.
const COLUMNS = [
  "Project Title",
  "Submission Url",
  "Project Status",
  "Judging Status",
  "Highest Step Completed",
  "Project Created At",
  "About The Project",
  '"Try it out" Links',
  "Video Demo Link",
  "Opt-In Prize",
  "Built With",
  "Notes",
  "Team Colleges/Universities",
  "Submitter Screen Name",
  "Submitter First Name",
  "Submitter Last Name",
  "Submitter Email",
  "Project Submitted At",
  "Additional Team Member Count",
  "Team Member 1 First Name",
  "Team Member 1 Last Name",
  "Team Member 1 Email",
  "Team Member 2 First Name",
  "Team Member 2 Last Name",
  "Team Member 2 Email",
  "Team Member 3 First Name",
  "Team Member 3 Last Name",
  "Team Member 3 Email",
] as const;

type Teammate = [first: string, last: string, email: string];

type Fixture = {
  title: string;
  url: string;
  status?: string;
  about?: string;
  links?: string;
  video?: string;
  prize?: string;
  builtWith?: string;
  universities?: string;
  first: string;
  last: string;
  email: string;
  createdAt?: string;
  submittedAt?: string;
  count?: string;
  team?: Teammate[];
};

const quote = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function row(f: Fixture): string[] {
  const team = f.team ?? [];
  return [
    f.title,
    f.url,
    f.status ?? "Submitted (Gallery/Visible)",
    "Pending",
    "Submit",
    f.createdAt ?? "2027-02-07 20:15:00",
    f.about ?? "",
    f.links ?? "",
    f.video ?? "",
    f.prize ?? "",
    f.builtWith ?? "",
    "",
    f.universities ?? "",
    f.first.toLowerCase(),
    f.first,
    f.last,
    f.email,
    f.submittedAt ?? "2027-02-08 09:41:07",
    f.count ?? String(team.length),
    ...team.flat(),
  ];
}

function exportOf(
  fixtures: Fixture[],
  columns: readonly string[] = COLUMNS,
): string {
  const lines = [columns, ...fixtures.map(row)].map((cells) =>
    cells.map(quote).join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const tidewater: Fixture = {
  title: "Tidewater",
  url: "https://devpost.com/software/tidewater",
  about:
    "Flood risk from street-level photos.\n\nWe fine-tuned a segmentation model on 4,000 images of Atlanta storm drains.",
  links:
    "https://tidewater.vercel.app, https://github.com/tidewater-gt/tidewater; javascript:alert(1)",
  video: "https://youtu.be/dQw4w9WgXcQ",
  prize: "Best Use of Snowflake",
  builtWith: "python, pytorch, react, snowflake",
  universities: "Georgia Institute of Technology; Emory University",
  first: "Priya",
  last: "Raman",
  email: "Priya.Raman@gatech.edu",
  team: [
    ["Marcus", "Hill", "mhill42@gatech.edu"],
    ["Ana", "Souza", "ana.souza@emory.edu"],
  ],
};

const ledgerLens: Fixture = {
  title: "LedgerLens",
  url: "https://devpost.com/software/ledgerlens",
  about: "Explains a 10-K in plain English.",
  prize: "[MLH] Best Use of MongoDB Atlas",
  builtWith: "next.js;mongodb",
  first: "Jordan",
  last: "Lee",
  email: "jlee@gatech.edu",
};

const courtVision: Fixture = {
  title: "Court Vision",
  url: "https://devpost.com/software/court-vision",
  about: "Shot charts from broadcast footage.",
  prize: "",
  first: "Sam",
  last: "Okafor",
  email: "sokafor3@gatech.edu",
  team: [["Lena", "Park", "lpark@gsu.edu"]],
};

describe("readDevpostExport", () => {
  it("reads a clean export into projects", () => {
    const result = readDevpostExport(
      exportOf([tidewater, ledgerLens, courtVision]),
    );

    expect(result.rejected).toEqual([]);
    expect(result.drafts).toBe(0);
    expect(result.collapsedRows).toBe(0);
    expect(result.projects.map((p) => p.title)).toEqual([
      "Tidewater",
      "LedgerLens",
      "Court Vision",
    ]);

    const [first] = result.projects;
    expect(first).toEqual({
      submissionUrl: "https://devpost.com/software/tidewater",
      title: "Tidewater",
      description: tidewater.about,
      demoLinks: [
        "https://tidewater.vercel.app/",
        "https://github.com/tidewater-gt/tidewater",
      ],
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      technologies: ["python", "pytorch", "react", "snowflake"],
      universities: ["Georgia Institute of Technology", "Emory University"],
      prizeCategories: ["Best Use of Snowflake"],
      participantCount: 3,
      members: [
        { name: "Priya Raman", email: "priya.raman@gatech.edu", order: 0 },
        { name: "Marcus Hill", email: "mhill42@gatech.edu", order: 1 },
        { name: "Ana Souza", email: "ana.souza@emory.edu", order: 2 },
      ],
      projectCreatedAt: new Date("2027-02-07T20:15:00Z"),
      submittedAt: new Date("2027-02-08T09:41:07Z"),
    });
    expect(result.projects[2]!.prizeCategories).toEqual([]);
    expect(result.labels).toEqual([
      "[MLH] Best Use of MongoDB Atlas",
      "Best Use of Snowflake",
    ]);
  });

  it("folds one row per prize into one project and unions the prizes", () => {
    const result = readDevpostExport(
      exportOf([
        tidewater,
        { ...tidewater, url: `${tidewater.url}/`, prize: "Best Sustainability Hack" },
        { ...tidewater, prize: "best use of  snowflake" },
        { ...ledgerLens, prize: "Best Sustainability Hack" },
      ]),
    );

    expect(result.collapsedRows).toBe(2);
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]!.prizeCategories).toEqual([
      "Best Sustainability Hack",
      "Best Use of Snowflake",
    ]);
    expect(result.labels).toEqual([
      "Best Sustainability Hack",
      "Best Use of Snowflake",
    ]);
  });

  it("counts draft-only projects once and leaves them out", () => {
    const draft: Fixture = {
      ...courtVision,
      title: "Half-built",
      url: "https://devpost.com/software/half-built",
      status: "Draft",
    };
    const result = readDevpostExport(
      exportOf([
        tidewater,
        draft,
        { ...draft, prize: "Best Use of Snowflake" },
        { ...ledgerLens, status: "Draft" },
        ledgerLens,
        { ...draft, url: "", title: "Unnamed draft", status: "Draft" },
      ]),
    );

    expect(result.projects.map((p) => p.title)).toEqual([
      "Tidewater",
      "LedgerLens",
    ]);
    // Half-built and the URL-less draft; LedgerLens was also submitted.
    expect(result.drafts).toBe(2);
  });

  it("rejects submitted rows with a missing or non-web submission URL", () => {
    const result = readDevpostExport(
      exportOf([
        tidewater,
        { ...ledgerLens, url: "" },
        { ...courtVision, url: "devpost.com/software/court-vision" },
      ]),
    );

    expect(result.projects).toHaveLength(1);
    expect(result.rejected).toEqual([
      {
        project: "LedgerLens",
        reason: "It is marked submitted but has no submission URL.",
      },
      {
        project: "Court Vision",
        reason: expect.stringContaining("is not an http or https link"),
      },
    ]);
  });

  it("rejects a project whose rows disagree about the team", () => {
    const result = readDevpostExport(
      exportOf([
        tidewater,
        {
          ...tidewater,
          prize: "Best Sustainability Hack",
          team: [["Marcus", "Hill", "marcus.hill@gatech.edu"], tidewater.team![1]!],
        },
        ledgerLens,
      ]),
    );

    expect(result.projects.map((p) => p.title)).toEqual(["LedgerLens"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ project: "Tidewater" });
    expect(result.rejected[0]!.reason).toContain("lines 2 and 3");
  });

  it("rejects a project whose rows disagree about the description", () => {
    const result = readDevpostExport(
      exportOf([
        ledgerLens,
        { ...ledgerLens, about: "A different pitch.", prize: "Best Fintech" },
        courtVision,
      ]),
    );
    expect(result.rejected.map((r) => r.project)).toEqual(["LedgerLens"]);
  });

  it("rejects more than three teammates", () => {
    const result = readDevpostExport(
      exportOf([tidewater, { ...ledgerLens, count: "4" }]),
    );
    expect(result.rejected).toEqual([
      {
        project: "LedgerLens",
        reason: "It lists 4 teammates besides the submitter; teams are at most 4 people.",
      },
    ]);
  });

  it("rejects a teammate count that is not a whole number", () => {
    const result = readDevpostExport(
      exportOf([tidewater, { ...ledgerLens, count: "two" }]),
    );
    expect(result.rejected[0]!.reason).toContain('"two" is not a whole number');
  });

  it("skips blank teammate triples but still counts the seat", () => {
    const result = readDevpostExport(
      exportOf([
        {
          ...courtVision,
          team: [
            ["", "", ""],
            ["Lena", "Park", "lpark@gsu.edu"],
          ],
        },
      ]),
    );
    const [project] = result.projects;
    expect(project!.participantCount).toBe(3);
    expect(project!.members.map((m) => [m.name, m.order])).toEqual([
      ["Sam Okafor", 0],
      ["Lena Park", 1],
    ]);
  });

  it("rejects a teammate with a name but no email, or the reverse", () => {
    const result = readDevpostExport(
      exportOf([
        { ...courtVision, team: [["Lena", "Park", ""]] },
        { ...ledgerLens, team: [["", "", "ghost@gsu.edu"]] },
        tidewater,
      ]),
    );
    expect(result.rejected).toEqual([
      { project: "Court Vision", reason: "Teammate 1 has a name but no email." },
      { project: "LedgerLens", reason: "Teammate 1 has an email but no name." },
    ]);
  });

  it("rejects an address that is not an email", () => {
    const result = readDevpostExport(
      exportOf([tidewater, { ...ledgerLens, email: "jlee at gatech" }]),
    );
    expect(result.rejected[0]!.reason).toContain("is not an email address");
  });

  it("rejects a project with no submitter name", () => {
    const result = readDevpostExport(
      exportOf([tidewater, { ...ledgerLens, first: "", last: "" }]),
    );
    expect(result.rejected[0]!.reason).toBe(
      "It is missing the submitter's name or email.",
    );
  });

  it("rejects a title over 255 characters", () => {
    const result = readDevpostExport(
      exportOf([tidewater, { ...ledgerLens, title: "L".repeat(256) }]),
    );
    expect(result.rejected[0]!.reason).toBe(
      "The title is longer than 255 characters.",
    );
  });

  it("keeps only web links and drops a video link that is not one", () => {
    const result = readDevpostExport(
      exportOf([
        {
          ...ledgerLens,
          links:
            "https://ledgerlens.app\nhttps://ledgerlens.app\ndata:text/html,hi;not a url",
          video: "javascript:void(0)",
        },
      ]),
    );
    expect(result.projects[0]!.demoLinks).toEqual(["https://ledgerlens.app/"]);
    expect(result.projects[0]!.videoUrl).toBeNull();
  });

  it("keeps a project whose dates cannot be read, without them", () => {
    const result = readDevpostExport(
      exportOf([{ ...ledgerLens, createdAt: "", submittedAt: "Saturday" }]),
    );
    expect(result.projects[0]).toMatchObject({
      projectCreatedAt: null,
      submittedAt: null,
    });
  });

  it("accepts the long universities heading and loosely spelled headings", () => {
    const columns = COLUMNS.map((name) =>
      name === "Team Colleges/Universities"
        ? "List All Of The Universities Or Schools That Your Team Members Currently Attend."
        : name === '"Try it out" Links'
          ? "Try it out links"
          : name === "Project Title"
            ? " project title "
            : name,
    );
    const result = readDevpostExport(exportOf([tidewater], columns));
    expect(result.projects[0]!.universities).toEqual([
      "Georgia Institute of Technology",
      "Emory University",
    ]);
    expect(result.projects[0]!.demoLinks).toHaveLength(2);
  });

  it("names every missing required column", () => {
    const columns = COLUMNS.filter(
      (name) => name !== "Submitter Email" && name !== "Project Status",
    );
    expect(() => readDevpostExport(`${columns.join(",")}\n`)).toThrow(
      /no Project Status, Submitter Email columns/,
    );
  });

  it("refuses an empty file and a file with headings only", () => {
    expect(() => readDevpostExport("")).toThrow(DevpostFileError);
    expect(() => readDevpostExport("\uFEFF\r\n\r\n")).toThrow(/empty/);
    expect(() => readDevpostExport(exportOf([]))).toThrow(
      /no projects under them/,
    );
  });

  it("refuses a file of drafts only", () => {
    expect(() =>
      readDevpostExport(exportOf([{ ...tidewater, status: "Draft" }])),
    ).toThrow(/only drafts/);
  });

  it("refuses a file where every submitted project is rejected", () => {
    expect(() =>
      readDevpostExport(exportOf([{ ...tidewater, count: "5" }])),
    ).toThrow(/first problem: Tidewater: It lists 5 teammates/);
  });
});
