// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SavedRegistration } from "./RegistrationForm";
import { RegistrationForm } from "./RegistrationForm";
import { DRAFT_QUIET_MS } from "./use-draft-save";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout, so no scrolling.
Element.prototype.scrollIntoView = vi.fn();

const mocks = vi.hoisted(() => ({
  getMyDraft: vi.fn(),
  save: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Ada Lovelace" } },
    status: "authenticated",
  }),
}));

vi.mock("@/components/portal/ResumeSection", () => ({
  ResumeSection: () => null,
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({
    isPending: false,
    isSuccess: false,
    mutate: () => undefined,
    mutateAsync: () => Promise.resolve(),
  });
  return {
    trpc: {
      useUtils: () => ({ hackathon: {} }),
      resume: { me: { useQuery: () => ({ data: null }) } },
      hackathon: {
        getMyDraft: { useQuery: mocks.getMyDraft },
        saveMyDraft: {
          useMutation: () => ({
            ...mutation(),
            mutateAsync: mocks.save,
          }),
        },
        register: { useMutation: mutation },
        updateMyRegistration: { useMutation: mutation },
      },
    },
  };
});

const KEY = "reg-draft:h1:u1";

type Rendered = ReturnType<typeof render>;
let mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];

function render(
  props: { saved?: SavedRegistration; onCancel?: () => void } = {},
) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  // The form loads its school list through React Query, as it does in the portal.
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationForm
          hackathonId="h1"
          hackathonName="Hacklytics: Digital Bloom"
          startDate="2027-02-26T14:00:00Z"
          endDate="2027-02-28T17:00:00Z"
          saved={props.saved}
          onRegistered={() => undefined}
          onUpdated={() => undefined}
          onCancel={props.onCancel ?? (() => undefined)}
        />
      </QueryClientProvider>,
    ),
  );
  return el;
}

/** The element a test needs, or a failure that says so. */
function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected the element to be there");
  return value;
}

const firstName = (view: HTMLElement) =>
  view.querySelector<HTMLInputElement>('input[placeholder="John"]');
const nameField = (view: HTMLElement) => must(firstName(view));
const statusLine = (view: HTMLElement) =>
  must(view.querySelector('[role="status"]')).textContent;

function type(input: HTMLInputElement, value: string) {
  const set = must(
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"),
  ).set;
  act(() => {
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const press = (view: Rendered, label: string) => {
  const button = [...view.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (!button) throw new Error(`no "${label}" button`);
  act(() => button.click());
};

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const serverDraft = (
  data: Record<string, unknown>,
  updatedAt = "2027-01-01T00:00:00Z",
) => ({ isPending: false, data: { data, updatedAt: new Date(updatedAt) } });

describe("RegistrationForm draft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mocks.getMyDraft.mockReset();
    mocks.getMyDraft.mockReturnValue({ isPending: false, data: null });
    mocks.save.mockReset();
    mocks.save.mockResolvedValue({ savedAt: new Date() });
  });
  afterEach(() => {
    for (const { root, el } of mounted) {
      act(() => root.unmount());
      el.remove();
    }
    mounted = [];
    vi.useRealTimers();
  });

  it("holds the form back until the server draft has been read", () => {
    mocks.getMyDraft.mockReturnValue({ isPending: true, data: undefined });
    const view = render();
    expect(view.textContent).toContain("Loading…");
    expect(firstName(view)).toBeNull();
  });

  it("asks for the draft of this edition, and only for a new application", () => {
    render();
    expect(mocks.getMyDraft).toHaveBeenLastCalledWith(
      { hackathonId: "h1" },
      expect.objectContaining({ enabled: true }),
    );

    render({ saved: {} as SavedRegistration });
    expect(mocks.getMyDraft).toHaveBeenLastCalledWith(
      { hackathonId: "h1" },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("reopens on the answers the server holds", () => {
    mocks.getMyDraft.mockReturnValue(
      serverDraft({ firstName: "Grace", lastName: "Hopper" }),
    );
    const view = render();
    expect(firstName(view)?.value).toBe("Grace");
  });

  it("falls back to the account's name when nothing was saved", () => {
    expect(firstName(render())?.value).toBe("Ada");
  });

  it("takes the browser's draft when it was saved after the server's", () => {
    mocks.getMyDraft.mockReturnValue(
      serverDraft({ firstName: "Server" }, "2027-01-01T00:00:00Z"),
    );
    localStorage.setItem(
      KEY,
      JSON.stringify({
        savedAt: Date.parse("2027-01-02T00:00:00Z"),
        answers: { firstName: "Local" },
      }),
    );
    expect(firstName(render())?.value).toBe("Local");
  });

  it("takes the server's draft when the browser's is older", () => {
    mocks.getMyDraft.mockReturnValue(
      serverDraft({ firstName: "Server" }, "2027-01-02T00:00:00Z"),
    );
    localStorage.setItem(
      KEY,
      JSON.stringify({
        savedAt: Date.parse("2027-01-01T00:00:00Z"),
        answers: { firstName: "Local" },
      }),
    );
    expect(firstName(render())?.value).toBe("Server");
  });

  it("does not save a form that was only opened", async () => {
    render();
    await wait(DRAFT_QUIET_MS * 4);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("saves once, a moment after the last change", async () => {
    const view = render();
    type(nameField(view), "Adaline");
    await wait(DRAFT_QUIET_MS - 1);
    expect(mocks.save).not.toHaveBeenCalled();

    // Typing again starts the wait over.
    type(nameField(view), "Adalinee");
    await wait(DRAFT_QUIET_MS - 1);
    expect(mocks.save).not.toHaveBeenCalled();

    await wait(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const sent = mocks.save.mock.calls[0]?.[0];
    expect(sent.hackathonId).toBe("h1");
    expect(sent.data.firstName).toBe("Adalinee");
    // Nothing the browser draft leaves out goes to the server either.
    for (const left of [
      "phone",
      "age",
      "gender",
      "race",
      "usCitizen",
      "ramadanFasting",
      "emergencyContact",
      "agreeToCodeOfConduct",
    ]) {
      expect(sent.data).not.toHaveProperty(left);
    }
    // The browser copy is kept as well, stamped.
    expect(
      JSON.parse(localStorage.getItem(KEY) ?? "{}").answers.firstName,
    ).toBe("Adalinee");

    await wait(DRAFT_QUIET_MS * 4);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("says when it is saving and when it has saved", async () => {
    let finish!: () => void;
    mocks.save.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const view = render();
    const line = () => statusLine(view);
    expect(line()).toBe("");

    type(nameField(view), "Adaline");
    await wait(DRAFT_QUIET_MS);
    expect(line()).toBe("Saving…");

    await act(async () => finish());
    expect(line()).toBe("Draft saved");
  });

  it("keeps changes made during a save for the next one, after it", async () => {
    const releases: (() => void)[] = [];
    mocks.save.mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const view = render();
    type(nameField(view), "One");
    await wait(DRAFT_QUIET_MS);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    // Edited while the first is still in flight: no second request yet.
    type(nameField(view), "Two");
    await wait(DRAFT_QUIET_MS * 2);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    await act(async () => releases[0]?.());
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1]?.[0].data.firstName).toBe("Two");
  });

  it("owns up to a save that failed, and tries again on the next change", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    const view = render();
    type(nameField(view), "Adaline");
    await wait(DRAFT_QUIET_MS);
    expect(statusLine(view)).toContain("kept on this device");

    type(nameField(view), "Adaline L");
    await wait(DRAFT_QUIET_MS);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(statusLine(view)).toBe("Draft saved");
  });

  it("sends right away when the person cancels", async () => {
    const onCancel = vi.fn();
    const view = render({ onCancel });
    type(nameField(view), "Adaline");
    await act(async () => press(view, "Cancel"));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("sends right away when the person moves to the next step", async () => {
    const view = render();
    type(nameField(view), "Adaline");
    type(
      must(
        view.querySelector<HTMLInputElement>(
          'input[placeholder="(555) 123-4567"]',
        ),
      ),
      "5551234567",
    );
    type(
      must(view.querySelector<HTMLInputElement>('input[placeholder="21"]')),
      "21",
    );
    press(view, "Yes");
    await act(async () => press(view, "Continue"));

    // Well inside the quiet time, so this is the step change sending it.
    expect(view.textContent).toContain("Academic information");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0]?.[0].data.firstName).toBe("Adaline");
  });

  it("neither reads nor saves a draft while editing a submitted application", async () => {
    const view = render({ saved: { firstName: "Ada" } as SavedRegistration });
    type(nameField(view), "Adaline");
    await wait(DRAFT_QUIET_MS * 3);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(view.querySelector('[role="status"]')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
