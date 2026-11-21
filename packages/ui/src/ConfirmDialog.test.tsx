// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, ConfirmHost, confirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("shows the title, body and confirm label", () => {
    render(
      <ConfirmDialog
        title="Delete room"
        body="Delete Room 101?"
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Delete room" })).toBeTruthy();
    expect(screen.getByText("Delete Room 101?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("disables both buttons while busy and ignores Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        body="Go?"
        busy
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("confirmDialog", () => {
  function ask(options: Parameters<typeof confirmDialog>[0]) {
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = confirmDialog(options);
    });
    return answer;
  }

  it("resolves true when confirmed", async () => {
    render(<ConfirmHost />);
    const answer = ask({ body: "Remove Sam?", confirmLabel: "Remove" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(await answer).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves false when cancelled", async () => {
    render(<ConfirmHost />);
    const answer = ask("Remove Sam?");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await answer).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves false on Escape", async () => {
    render(<ConfirmHost />);
    const answer = ask("Remove Sam?");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(await answer).toBe(false);
  });

  it("resolves false when no host is mounted", async () => {
    expect(await confirmDialog("Remove Sam?")).toBe(false);
  });
});
