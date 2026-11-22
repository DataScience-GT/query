// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("shows its line alone", () => {
    render(<EmptyState>No projects yet.</EmptyState>);
    expect(screen.getByText("No projects yet.")).toBeTruthy();
  });

  it("adds a title and an action when given", () => {
    render(
      <EmptyState title="Nothing here" action={<button>Add one</button>}>
        No projects yet.
      </EmptyState>,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add one" })).toBeTruthy();
  });
});
