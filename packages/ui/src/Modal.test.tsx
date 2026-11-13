// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function Opener({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal
          label="Edit event"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        >
          <p>Body</p>
        </Modal>
      )}
    </>
  );
}

function openFromTrigger(onClose: () => void) {
  render(<Opener onClose={onClose} />);
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

beforeEach(() => {
  document.body.style.overflow = "scroll";
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("renders a labelled modal dialog around its children", () => {
    render(
      <Modal onClose={() => undefined} maxWidth="2xl" label="Edit event">
        <p>Body</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit event" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("max-w-2xl");
    expect(dialog.textContent).toBe("Body");
  });

  it("moves focus to the panel and locks page scroll while open", () => {
    openFromTrigger(() => undefined);

    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape, returns focus to the trigger and restores scroll", () => {
    const onClose = vi.fn();
    const trigger = openFromTrigger(onClose);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    openFromTrigger(onClose);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("stops listening for Escape once it has closed", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from the backdrop button", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps focus where it is and uses the newest onClose when the handler changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const content = <input aria-label="Name" />;
    const { rerender } = render(<Modal onClose={first}>{content}</Modal>);

    const field = screen.getByLabelText("Name");
    field.focus();
    rerender(<Modal onClose={second}>{content}</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(field);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
