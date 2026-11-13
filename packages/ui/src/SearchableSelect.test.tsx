import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rankOptions, SearchableSelect } from "./SearchableSelect";

const SCHOOLS = [
  "Georgia Institute of Technology",
  "Georgia State University",
  "Emory University",
];

const render = (props: Partial<Parameters<typeof SearchableSelect>[0]> = {}) =>
  renderToStaticMarkup(
    <SearchableSelect
      label="School"
      value=""
      onChange={() => undefined}
      options={SCHOOLS}
      {...props}
    />,
  );

describe("SearchableSelect markup", () => {
  it("labels a closed combobox with no listbox in the page", () => {
    const html = render();

    const inputId = /<input[^>]* id="([^"]+)"/.exec(html)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`<label for="${inputId}"`);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain("aria-activedescendant");
  });

  it("shows the current value while closed", () => {
    expect(render({ value: "Emory University" })).toContain(
      'value="Emory University"',
    );
  });

  it("marks a required field in the label and on the input", () => {
    const html = render({ required: true });

    expect(html).toContain("School *");
    expect(html).toMatch(/<input[^>]* required=""/);
    expect(render()).not.toContain("School *");
  });

  it("renders the hint under the field", () => {
    expect(render({ hint: "Pick the closest match" })).toContain(
      "Pick the closest match",
    );
  });
});

describe("rankOptions", () => {
  it("lists the first options in their given order for an empty query", () => {
    expect(rankOptions(SCHOOLS, "")).toEqual(SCHOOLS);
    expect(rankOptions(SCHOOLS, "   ")).toEqual(SCHOOLS);
  });

  it("matches every typed word in any order", () => {
    expect(rankOptions(SCHOOLS, "georgia tech")).toEqual([
      "Georgia Institute of Technology",
    ]);
    expect(rankOptions(SCHOOLS, "tech georgia")).toEqual([
      "Georgia Institute of Technology",
    ]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(rankOptions(SCHOOLS, "  EMORY ")).toEqual(["Emory University"]);
  });

  it("returns nothing when a word is missing from every option", () => {
    expect(rankOptions(SCHOOLS, "georgia stanford")).toEqual([]);
  });

  it("ranks an exact match, then word starts, then mid-word hits", () => {
    expect(
      rankOptions(["Biotech Corp", "Atlanta Tech", "Tech"], "tech"),
    ).toEqual(["Tech", "Atlanta Tech", "Biotech Corp"]);
  });

  it("breaks ties with the shorter option", () => {
    expect(
      rankOptions(["Georgia Tech Research", "Georgia Tech"], "georgia"),
    ).toEqual(["Georgia Tech", "Georgia Tech Research"]);
  });

  it("caps the list at 50 options", () => {
    const many = Array.from({ length: 80 }, (_, i) => `Option ${i}`);

    expect(rankOptions(many, "")).toHaveLength(50);
    expect(rankOptions(many, "option")).toHaveLength(50);
  });
});
