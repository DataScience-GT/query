import { describe, expect, it } from "vitest";
import { formatResultsCsv, formatResultsJson, parseProjectCsv } from "./csv";

describe("parseProjectCsv", () => {
  it("reads a Devpost-style header", () => {
    const rows = parseProjectCsv(
      "Project Title,Submission Url,Team Name,Table\nAlpha,https://example.com/a,A Team,4\n",
    );
    expect(rows).toEqual([
      {
        externalId: "https://example.com/a",
        name: "Alpha",
        teamName: "A Team",
        tableNumber: 4,
      },
    ]);
  });

  it("uses a column map when the headers are not the defaults", () => {
    const rows = parseProjectCsv("Title,Squad\nBeta,B Team\n", { name: "Title", team: "Squad" });
    expect(rows[0]?.name).toBe("Beta");
    expect(rows[0]?.teamName).toBe("B Team");
  });

  it("rejects a sheet with no name column", () => {
    expect(() => parseProjectCsv("notes\nhello\n")).toThrow(/name/);
  });
});

describe("formatResultsCsv", () => {
  it("quotes a name that contains a comma", () => {
    expect(
      formatResultsCsv([{ project: "A, B", track: "general", placement: 1, score: 7.71 }]),
    ).toBe('project,track,placement,score\n"A, B",general,1,7.71\n');
  });

  it("writes the same rows as JSON", () => {
    const rows = [{ project: "Alpha", track: "general", placement: 1, score: 7.71 }];
    expect(JSON.parse(formatResultsJson(rows))).toEqual(rows);
  });
});
