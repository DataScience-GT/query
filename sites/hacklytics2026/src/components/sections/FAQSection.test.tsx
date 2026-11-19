// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import FAQSection from "./FAQSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FAQSection", () => {
  it("opens and closes a question from the keyboard", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<FAQSection />));

    const card = container.querySelector<HTMLElement>('[role="button"]');
    if (!card) throw new Error("no FAQ card rendered");
    expect(card.tabIndex).toBe(0);
    expect(card.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(card.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });
    expect(card.getAttribute("aria-expanded")).toBe("false");

    await act(async () => root.unmount());
    container.remove();
  });
});
