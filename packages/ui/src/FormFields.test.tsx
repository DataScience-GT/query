import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormChipSelect, FormMultiChipSelect } from "./FormChipSelect";
import { FormInput } from "./FormInput";
import { FormTextarea } from "./FormTextarea";

const noop = () => undefined;

describe.each([
  ["FormInput", FormInput, "input"],
  ["FormTextarea", FormTextarea, "textarea"],
] as const)("%s", (_name, Field, tag) => {
  it("points the label at the field by the given id", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" id="edit-name" onChange={noop} />,
    );

    expect(html).toContain('<label for="edit-name"');
    expect(html).toContain(`<${tag} `);
    expect(html).toMatch(new RegExp(`<${tag}[^>]* id="edit-name"`));
  });

  it("marks a required field in the label and on the field", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" required onChange={noop} />,
    );

    expect(html).toContain("Name *");
    expect(html).toMatch(new RegExp(`<${tag}[^>]* required=""`));
  });

  it("describes an invalid field by its error message", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" id="n" error="Name is required" onChange={noop} />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="n-error"');
    expect(html).toMatch(/<p id="n-error"[^>]*>Name is required<\/p>/);
    expect(html).toContain("border-[var(--danger)]");
  });

  it("leaves out the error markup for a valid field", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" id="n" onChange={noop} />,
    );

    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("<p");
  });

  it("renders a hint under the field and keeps the caller's classes", () => {
    const html = renderToStaticMarkup(
      <Field
        label="Name"
        hint="As on your ID"
        className="min-h-11"
        onChange={noop}
      />,
    );

    expect(html).toContain("<p");
    expect(html).toContain("As on your ID");
    expect(html).toContain("min-h-11");
  });
});

describe("FormTextarea", () => {
  it("is not resizable", () => {
    expect(
      renderToStaticMarkup(<FormTextarea label="Bio" onChange={noop} />),
    ).toContain("resize-none");
  });
});

describe("chip selects", () => {
  it("labels the group and presses the chosen chip", () => {
    const html = renderToStaticMarkup(
      <FormChipSelect
        label="Shirt size"
        required
        options={["S", "M", "L"]}
        value="M"
        onChange={noop}
      />,
    );

    const labelId = /<span id="([^"]+)"/.exec(html)?.[1];
    expect(labelId).toBeTruthy();
    expect(html).toContain("Shirt size *");
    expect(html).toContain(`role="group" aria-labelledby="${labelId}"`);
    expect(html).toMatch(/<button[^>]* aria-pressed="false"[^>]*>S</);
    expect(html).toMatch(/<button[^>]* aria-pressed="true"[^>]*>M</);
    expect(html).toMatch(/<button[^>]* aria-pressed="false"[^>]*>L</);
  });

  it("presses every selected chip of a multi select", () => {
    const html = renderToStaticMarkup(
      <FormMultiChipSelect
        label="Dietary"
        options={["None", "Vegan", "Halal"]}
        selected={["Vegan", "Halal"]}
        onChange={noop}
      />,
    );

    expect(html).not.toContain("Dietary *");
    expect(html).toMatch(/<button[^>]* aria-pressed="false"[^>]*>None</);
    expect(html).toMatch(/<button[^>]* aria-pressed="true"[^>]*>Vegan</);
    expect(html).toMatch(/<button[^>]* aria-pressed="true"[^>]*>Halal</);
  });
});
