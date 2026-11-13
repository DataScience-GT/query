// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

afterEach(cleanup);

describe("Switch", () => {
  it("exposes an on switch named by its label", () => {
    render(
      <>
        <label htmlFor="sw">Publish</label>
        <Switch id="sw" checked onChange={() => undefined} />
      </>,
    );

    const control = screen.getByRole("switch", { name: "Publish" });
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("exposes an off switch", () => {
    render(<Switch id="sw" checked={false} onChange={() => undefined} />);

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("reports the opposite of its current state when clicked", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch id="sw" checked={false} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Switch id="sw" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("does not report a click while disabled and shows its title", () => {
    const onChange = vi.fn();
    render(
      <Switch
        id="sw"
        checked={false}
        disabled
        title="Read-only"
        onChange={onChange}
      />,
    );

    const control = screen.getByRole("switch") as HTMLButtonElement;
    fireEvent.click(control);

    expect(control.disabled).toBe(true);
    expect(control.title).toBe("Read-only");
    expect(onChange).not.toHaveBeenCalled();
  });
});
