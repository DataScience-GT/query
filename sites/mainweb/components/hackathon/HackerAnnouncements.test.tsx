// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { HackerAnnouncements } from "./HackerAnnouncements";

Object.assign(globalThis, { React });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    hackathon: {
      listForMe: { useQuery: () => ({ data: mocks.data }) },
    },
  },
}));

const long = "word ".repeat(80);
const older = {
  heading: "Parking",
  body: long,
  cta: null,
  sentAt: "2026-11-01T12:00:00.000Z",
};
const newer = {
  heading: "Doors open",
  body: "Short.",
  cta: null,
  sentAt: "2026-11-02T12:00:00.000Z",
};

describe("HackerAnnouncements", () => {
  // The list is newest first and refetched, so a new announcement lands above
  // the others; an index in the key would remount them and fold them shut.
  it("keeps an expanded announcement open when a newer one arrives above it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    mocks.data = [older];
    await act(async () => root.render(<HackerAnnouncements hackathonId="h" />));
    const toggle = () => {
      const button = container.querySelector<HTMLButtonElement>(
        "button[aria-expanded]",
      );
      if (!button) throw new Error("no Show more button");
      return button;
    };
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    mocks.data = [newer, older];
    await act(async () => root.render(<HackerAnnouncements hackathonId="h" />));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    await act(async () => root.unmount());
    container.remove();
  });
});
