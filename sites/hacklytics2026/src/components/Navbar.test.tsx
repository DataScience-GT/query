// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Navbar from "./Navbar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.restoreAllMocks());

describe("Navbar", () => {
  it("removes the exact mousemove listener it added", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<Navbar />));
    await act(async () => root.unmount());
    container.remove();

    const added = add.mock.calls.filter(([type]) => type === "mousemove");
    const removed = remove.mock.calls.filter(([type]) => type === "mousemove");
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(removed[0]?.[1]).toBe(added[0]?.[1]);
  });
});
