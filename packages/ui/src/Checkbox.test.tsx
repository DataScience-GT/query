// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("labels the input and reflects checked", () => {
    render(
      <Checkbox
        id="box"
        checked
        label="Self check-in"
        onChange={() => undefined}
      />,
    );

    const input = screen.getByLabelText("Self check-in") as HTMLInputElement;
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true);
  });

  it("reports the new checked state when clicked", () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        id="box"
        checked={false}
        label="Sold out"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Sold out"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows its title and disables the input", () => {
    render(
      <Checkbox
        id="box"
        checked={false}
        disabled
        title="Read-only"
        label="Self check-in"
        onChange={() => undefined}
      />,
    );

    const input = screen.getByLabelText("Self check-in") as HTMLInputElement;

    expect(screen.getByTitle("Read-only")).toBeTruthy();
    expect(input.disabled).toBe(true);
  });

  it("has no tooltip when no title is given", () => {
    render(
      <Checkbox
        id="box"
        checked={false}
        label="Sold out"
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByTitle(/.+/)).toBeNull();
  });
});
