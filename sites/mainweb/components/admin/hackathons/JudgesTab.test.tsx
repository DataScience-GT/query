// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JudgesTab } from "./JudgesTab";

Object.assign(globalThis, { React });

// The tRPC hooks are stubbed, as in DangerZone.test.tsx; only the clipboard
// button matters here.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => false,
  usePortalContext: () => ({ data: { role: "admin" } }),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ isPending: false, mutate: () => undefined });
  return {
    trpc: {
      useUtils: () => ({ judge: { list: { invalidate: () => undefined } } }),
      judge: {
        list: {
          useQuery: () => ({
            data: [],
            isLoading: false,
            isError: false,
            error: null,
            refetch: () => undefined,
          }),
        },
        create: { useMutation: mutation },
        setActive: { useMutation: mutation },
        remove: { useMutation: mutation },
      },
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function openCopyButton() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<JudgesTab hackathonId="h1" />));
  const buttons = () => [...container.querySelectorAll("button")];
  const add = buttons().find((b) => b.textContent?.includes("Add"));
  if (!add) throw new Error("no Add judge button");
  await act(async () => add.click());
  const copy = buttons().find((b) =>
    b.textContent?.includes("Copy apply link"),
  );
  if (!copy) throw new Error("no Copy apply link button");
  return { container, copy };
}

describe("JudgesTab apply link", () => {
  it("shows the link instead of failing silently when the clipboard rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(() => Promise.reject(new Error("denied"))),
      },
    });
    const { container, copy } = await openCopyButton();

    await act(async () => copy.click());

    expect(container.textContent).toContain("Couldn't copy. The link is");
    expect(container.textContent).toContain("/judge/register?hackathonId=h1");
  });

  it("says Copied when the clipboard accepts", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    const { container, copy } = await openCopyButton();

    await act(async () => copy.click());

    expect(container.textContent).toContain("Copied");
    expect(container.textContent).not.toContain("Couldn't copy");
  });
});
