// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VolunteerAnswers } from "@query/db/constants";
import { VolunteerForm } from "./VolunteerForm";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (mutate: (input: unknown) => void) => () => ({
    isPending: false,
    mutate,
  });
  return {
    trpc: {
      useUtils: () => ({
        volunteer: { myApplication: { invalidate: () => Promise.resolve() } },
      }),
      volunteer: {
        submit: { useMutation: mutation((input) => mocks.submit(input)) },
        update: { useMutation: mutation((input) => mocks.update(input)) },
      },
    },
  };
});

let mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];

function render(props: { saved?: VolunteerAnswers; editing?: boolean } = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  act(() =>
    root.render(
      <VolunteerForm
        hackathon={{
          id: "h1",
          name: "Hacklytics: Digital Bloom",
          startDate: "2027-02-26T22:00:00Z",
        }}
        saved={props.saved}
        editing={props.editing ?? false}
        onDone={() => undefined}
        onCancel={() => undefined}
      />,
    ),
  );
  return el;
}

function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected the element to be there");
  return value;
}

const press = (view: HTMLElement, label: string) => {
  const button = [...view.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (!button) throw new Error(`no "${label}" button`);
  act(() => button.click());
};

/** A chip inside the group the label names, since "Overnight" appears twice. */
const chip = (view: HTMLElement, group: string, label: string) => {
  const node = [...view.querySelectorAll('[role="group"]')].find((g) =>
    document
      .getElementById(g.getAttribute("aria-labelledby") ?? "")
      ?.textContent?.startsWith(group),
  );
  const button = [...(node?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === label,
  );
  if (!button) throw new Error(`no "${label}" chip in "${group}"`);
  act(() => button.click());
};

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const set = must(Object.getOwnPropertyDescriptor(proto, "value")).set;
  act(() => {
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const field = (view: HTMLElement, label: string) =>
  must(
    [...view.querySelectorAll("label")]
      .find((l) => l.textContent?.startsWith(label))
      ?.control as HTMLInputElement | HTMLTextAreaElement | null,
  );

const alert = (view: HTMLElement) =>
  view.querySelector('[role="alert"]')?.textContent ?? "";

const saved: VolunteerAnswers = {
  affiliation: "alum",
  availability: ["fri_setup", "sun_closing"],
  roles: ["photography"],
  experience: "Ran registration, twice.",
  shirtSize: "L",
  dietary: ["Vegan", "Other: no shellfish"],
  phone: "(404) 555-0142",
  acknowledged: true,
};

describe("VolunteerForm", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
    mocks.update.mockReset();
  });
  afterEach(() => {
    for (const { root, el } of mounted) {
      act(() => root.unmount());
      el.remove();
    }
    mounted = [];
  });

  it("asks three short questions, each step holding its own answers", () => {
    const view = render();
    expect(view.textContent).toContain("About you");
    expect(view.textContent).toContain("What describes you?");
    // The weekend's days, from the edition's dates, are on step two.
    press(view, "Alum");
    press(view, "Continue");
    expect(view.textContent).toContain("Friday, Feb 26");
    expect(view.textContent).toContain("Sunday, Feb 28");
    expect(view.textContent).toContain("Check-in desk and badges");
    expect(view.textContent).toContain(
      "Judging logistics (runners, room hosts)",
    );
  });

  it("will not leave a step without what it needs, and says what", () => {
    const view = render();
    press(view, "Continue");
    expect(alert(view)).toBe("Choose what describes you.");

    press(view, "Industry");
    press(view, "Continue");
    press(view, "Continue");
    expect(alert(view)).toBe("Pick at least one time block you can cover.");

    chip(view, "Saturday", "Morning");
    press(view, "Continue");
    press(view, "Apply to volunteer");
    expect(alert(view)).toBe("Choose a shirt size.");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("holds the day-of details to the same rules as the server", () => {
    const view = render();
    press(view, "Industry");
    press(view, "Continue");
    chip(view, "Friday", "Overnight");
    press(view, "Continue");

    press(view, "M");
    chip(view, "Dietary restrictions", "Other");
    press(view, "Apply to volunteer");
    expect(alert(view)).toBe("Tell us your dietary restriction.");

    type(field(view, "Your dietary restriction"), "no shellfish");
    press(view, "Apply to volunteer");
    expect(alert(view)).toBe(
      "Enter a phone number we can reach on event days.",
    );

    type(field(view, "Phone"), "call me maybe");
    press(view, "Apply to volunteer");
    expect(alert(view)).toBe(
      "Use digits, spaces and + ( ) - only in the phone number.",
    );

    type(field(view, "Phone"), "(404) 555-0142");
    press(view, "Apply to volunteer");
    expect(alert(view)).toBe(
      "Confirm that you understand how volunteers are confirmed.",
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("says only that the phone reaches them during the event, and words the acknowledgement as asked", () => {
    const view = render();
    press(view, "Industry");
    press(view, "Continue");
    chip(view, "Friday", "Overnight");
    press(view, "Continue");
    expect(view.textContent).toContain("Only used to reach you during the event.");
    expect(view.textContent).toContain(
      "I understand volunteers are confirmed by organizers and must join the Hacklytics Discord.",
    );
  });

  it("sends the answers as the server stores them", () => {
    const view = render();
    press(view, "Georgia Tech student");
    type(field(view, "Volunteering or event experience"), "A career fair.");
    press(view, "Continue");

    chip(view, "Saturday", "Evening");
    chip(view, "Friday", "Afternoon setup");
    chip(view, "Roles you", "Meals and snacks");
    chip(view, "Roles you", "Hacker help desk");
    press(view, "Continue");

    press(view, "XL");
    chip(view, "Dietary restrictions", "Vegetarian");
    chip(view, "Dietary restrictions", "Other");
    type(field(view, "Your dietary restriction"), "  no shellfish ");
    type(field(view, "Phone"), "(404) 555-0142");
    act(() => field(view, "I understand").click());
    press(view, "Apply to volunteer");

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledWith({
      hackathonId: "h1",
      answers: {
        affiliation: "gt_student",
        availability: ["sat_evening", "fri_setup"],
        roles: ["meals", "help_desk"],
        experience: "A career fair.",
        shirtSize: "XL",
        dietary: ["Vegetarian", "Other: no shellfish"],
        phone: "(404) 555-0142",
        acknowledged: true,
      },
    });
  });

  it("opens on the saved answers and saves a correction instead of applying again", () => {
    const view = render({ saved, editing: true });
    press(view, "Continue");
    // Their blocks and role are already chosen.
    const pressed = [...view.querySelectorAll('button[aria-pressed="true"]')].map(
      (b) => b.textContent,
    );
    expect(pressed).toEqual(["Afternoon setup", "Closing and teardown", "Photography"]);
    press(view, "Continue");
    // The Other chip carries its text back into the field.
    expect(field(view, "Your dietary restriction").value).toBe("no shellfish");
    expect(field(view, "Phone").value).toBe("(404) 555-0142");

    press(view, "Save changes");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
      hackathonId: "h1",
      answers: { affiliation: "alum", availability: ["fri_setup", "sun_closing"] },
    });
  });

  it("applies again from a withdrawn application's answers", () => {
    const view = render({ saved, editing: false });
    press(view, "Continue");
    press(view, "Continue");
    press(view, "Apply to volunteer");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
