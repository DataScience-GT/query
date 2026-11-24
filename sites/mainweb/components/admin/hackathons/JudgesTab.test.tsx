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

const state = vi.hoisted(() => ({ judges: [] as unknown[] }));

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
            data: state.judges,
            isLoading: false,
            isError: false,
            error: null,
            refetch: () => undefined,
          }),
        },
        create: { useMutation: mutation },
        setActive: { useMutation: mutation },
        setCanAttendInPerson: { useMutation: mutation },
        remove: { useMutation: mutation },
      },
    },
  };
});

afterEach(() => {
  state.judges = [];
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

  it("clears the copy failure once a later copy succeeds", async () => {
    const writeText = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("denied")))
      .mockImplementation(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { container, copy } = await openCopyButton();

    await act(async () => copy.click());
    expect(container.textContent).toContain("Couldn't copy");
    await act(async () => copy.click());

    expect(container.textContent).toContain("Copied");
    expect(container.textContent).not.toContain("Couldn't copy");
  });
});

const judge = (over: Record<string, unknown>) => ({
  id: "j",
  name: "Judge",
  email: null,
  phone: null,
  company: null,
  title: null,
  specialty: null,
  linkedinUrl: null,
  githubUrl: null,
  previousExperience: null,
  dietaryRestrictions: null,
  shirtSize: null,
  canAttendInPerson: null,
  whyJudge: null,
  isActive: false,
  createdAt: new Date("2026-11-01T12:00:00Z"),
  user: null,
  assignments: [],
  ...over,
});

async function renderRoster() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<JudgesTab hackathonId="h1" />));
  const button = (text: string) => {
    const found = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`no ${text} button`);
    return found;
  };
  return { container, button };
}

describe("JudgesTab review", () => {
  const waiting = judge({
    id: "w",
    name: "Waiting Wendy",
    company: "Acme Corp",
    phone: "555-0100",
    githubUrl: "https://github.com/wendy",
    linkedinUrl: "javascript:alert(1)",
    whyJudge: "I like demos",
    dietaryRestrictions: ["vegan", "nut-free"],
    assignments: [
      { hackathon: { id: "h1", name: "H" }, track: "Healthcare", isLead: true },
    ],
  });
  const approvedJudge = judge({
    id: "a",
    name: "Approved Andy",
    isActive: true,
  });

  it("hides the submitted details until Details is opened, then shows all of them", async () => {
    state.judges = [waiting];
    const { container, button } = await renderRoster();
    expect(container.textContent).not.toContain("Acme Corp");

    await act(async () => button("Details").click());

    const text = container.textContent ?? "";
    for (const expected of [
      "Acme Corp",
      "555-0100",
      "Healthcare",
      "I like demos",
      "vegan, nut-free",
      "https://github.com/wendy",
    ]) {
      expect(text).toContain(expected);
    }
    // Unsafe schemes render as text, never as a link.
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelector('a[href="https://github.com/wendy"]')).not.toBeNull();
  });

  it.each([
    [true, "Attends in personYes"],
    [false, "Attends in personNo"],
    [null, "Attends in personNot asked"],
  ])("shows canAttendInPerson=%s in the details", async (answer, expected) => {
    state.judges = [judge({ id: "p", name: "Pat", canAttendInPerson: answer })];
    const { container, button } = await renderRoster();

    await act(async () => button("Details").click());

    expect(container.textContent).toContain(expected);
  });

  it("filters the roster by status", async () => {
    state.judges = [waiting, approvedJudge];
    const { container, button } = await renderRoster();
    expect(container.textContent).toContain("Waiting Wendy");
    expect(container.textContent).toContain("Approved Andy");

    await act(async () => button("Approved").click());
    expect(container.textContent).not.toContain("Waiting Wendy");
    expect(container.textContent).toContain("Approved Andy");

    await act(async () => button("Waiting").click());
    expect(container.textContent).toContain("Waiting Wendy");
    expect(container.textContent).not.toContain("Approved Andy");
  });
});
