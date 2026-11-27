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
          location: "Klaus Advanced Computing Building",
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

/** A chip inside the group the label names, since "Morning" appears more than once. */
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

const hasField = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll("label")].some((l) =>
    l.textContent?.startsWith(label),
  );

const alert = (view: HTMLElement) =>
  view.querySelector('[role="alert"]')?.textContent ?? "";

/** The steps shown above the form, in order. */
const stepLabels = (view: HTMLElement) =>
  [...view.querySelectorAll("ol > li")].map((li) => li.textContent);

const savedVenue: VolunteerAnswers = {
  mode: "in_person",
  affiliation: "alum",
  availability: ["fri_setup", "sun_closing"],
  roles: ["photography"],
  experience: "Ran registration, twice.",
  shirtSize: "L",
  dietary: ["Vegan", "Other: no shellfish"],
  phone: "(404) 555-0142",
  acknowledged: true,
};

const savedMentor: VolunteerAnswers = {
  mode: "online",
  affiliation: "industry",
  topics: ["python", "other"],
  topicOther: "Rust",
  onlineAvailability: ["o_fri_evening"],
  mentorExperience: "Four years on ML services.",
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

  describe("the first question", () => {
    it("asks how they want to help, in three choices, before anything else", () => {
      const view = render();
      expect(view.textContent).toContain("How do you want to help?");
      const choices = [...view.querySelectorAll("button")]
        .map((b) => b.textContent)
        .filter((t) => /In person|Online|Both/.test(t ?? ""));
      expect(choices).toEqual(["In person at Klaus", "Online mentor", "Both"]);
      // The venue's questions are not on the page yet.
      expect(view.textContent).not.toContain("Shirt size");
    });

    it("explains the choice that is picked", () => {
      const view = render();
      press(view, "Online mentor");
      expect(view.textContent).toContain(
        "Answer hackers' questions from wherever you are, for example in the Discord.",
      );
      press(view, "In person at Klaus");
      expect(view.textContent).toContain(
        "Run the weekend at Klaus: check-in, meals, rooms and help for hackers.",
      );
    });

    it("will not go on without it, and then without what describes them", () => {
      const view = render();
      press(view, "Continue");
      expect(alert(view)).toBe("Choose how you want to help.");
      press(view, "Online mentor");
      press(view, "Continue");
      expect(alert(view)).toBe("Choose what describes you.");
    });

    it("shows the steps the choice needs: three for one way, four for both", () => {
      const view = render();
      expect(stepLabels(view)).toEqual(["How you'll help", "Last details"]);
      press(view, "In person at Klaus");
      expect(stepLabels(view)).toEqual([
        "How you'll help",
        "In person",
        "Day-of details",
      ]);
      press(view, "Online mentor");
      expect(stepLabels(view)).toEqual([
        "How you'll help",
        "Online mentoring",
        "Last details",
      ]);
      press(view, "Both");
      expect(stepLabels(view)).toEqual([
        "How you'll help",
        "In person",
        "Online mentoring",
        "Day-of details",
      ]);
    });
  });

  describe("in person", () => {
    const toVenue = (view: HTMLElement) => {
      press(view, "In person at Klaus");
      press(view, "Georgia Tech student");
      press(view, "Continue");
    };

    it("asks for the venue weekend: blocks under the edition's days, roles and experience", () => {
      const view = render();
      toVenue(view);
      expect(view.textContent).toContain("Friday, Feb 26");
      expect(view.textContent).toContain("Sunday, Feb 28");
      expect(view.textContent).toContain("Check-in desk and badges");
      expect(view.textContent).toContain("Judging logistics (runners, room hosts)");
      expect(view.textContent).toContain("Volunteering or event experience (optional)");
      // None of the mentor's questions.
      expect(view.textContent).not.toContain("Topics you can help with");
    });

    it("needs at least one block, and then a shirt size and a phone", () => {
      const view = render();
      toVenue(view);
      press(view, "Continue");
      expect(alert(view)).toBe("Pick at least one time block you can cover.");

      chip(view, "Saturday", "Morning");
      press(view, "Continue");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe("Choose a shirt size.");

      press(view, "M");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe(
        "Enter a phone number we can reach on event days.",
      );
      expect(mocks.submit).not.toHaveBeenCalled();
    });

    it("holds the day-of details to the same rules as the server", () => {
      const view = render();
      toVenue(view);
      chip(view, "Friday", "Overnight");
      press(view, "Continue");

      press(view, "M");
      chip(view, "Dietary restrictions", "Other");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe("Tell us your dietary restriction.");

      type(field(view, "Your dietary restriction"), "no shellfish");
      type(field(view, "Phone"), "call me maybe");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe("Use digits, spaces and + ( ) - only in the phone number.");

      type(field(view, "Phone"), "(404) 555-0142");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe(
        "Confirm that you understand how volunteers are confirmed.",
      );
      expect(mocks.submit).not.toHaveBeenCalled();
    });

    it("says only that the phone reaches them during the event, and words the acknowledgement as asked", () => {
      const view = render();
      toVenue(view);
      chip(view, "Friday", "Overnight");
      press(view, "Continue");
      expect(view.textContent).toContain("Only used to reach you during the event.");
      expect(view.textContent).toContain(
        "I understand volunteers are confirmed by organizers and must join the Hacklytics Discord.",
      );
      // The phone is required here.
      expect(hasField(view, "Phone *")).toBe(true);
    });

    it("sends the in-person answers as the server stores them", () => {
      const view = render();
      press(view, "In person at Klaus");
      press(view, "Georgia Tech student");
      press(view, "Continue");
      type(field(view, "Volunteering or event experience"), "A career fair.");
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
          mode: "in_person",
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
  });

  describe("online mentor", () => {
    const toMentor = (view: HTMLElement) => {
      press(view, "Online mentor");
      press(view, "Industry");
      press(view, "Continue");
    };

    it("asks for topics, hours online in Eastern time and a line of experience", () => {
      const view = render();
      toMentor(view);
      expect(view.textContent).toContain("Topics you can help with");
      for (const topic of [
        "Python",
        "Data analysis",
        "Machine learning",
        "LLMs and AI apps",
        "Web and frontend",
        "Backend and APIs",
        "Databases and SQL",
        "Data visualization",
        "Cloud and deployment",
        "Pitching and presenting",
        "Other",
      ]) {
        expect(
          [...view.querySelectorAll("button")].some((b) => b.textContent === topic),
          topic,
        ).toBe(true);
      }
      expect(view.textContent).toContain("All times are Eastern time.");
      expect(view.textContent).toContain("Friday, Feb 26");
      expect(hasField(view, "Your mentoring or technical experience")).toBe(true);
      // Nothing about the venue.
      expect(view.textContent).not.toContain("Check-in desk and badges");
      expect(view.textContent).not.toContain("Afternoon setup");
    });

    it("needs a topic, an hour online and a line of experience, one step at a time", () => {
      const view = render();
      toMentor(view);
      press(view, "Continue");
      expect(alert(view)).toBe("Pick at least one topic you can help with.");

      chip(view, "Topics you can help with", "Other");
      press(view, "Continue");
      expect(alert(view)).toBe("Tell us which other topic you can help with.");

      type(field(view, "Your other topic"), "Rust");
      press(view, "Continue");
      expect(alert(view)).toBe("Pick at least one time you can be online.");

      chip(view, "Friday", "6 to 10 pm");
      press(view, "Continue");
      expect(alert(view)).toBe("Add a line about your experience.");
    });

    it("asks for no shirt size, diet or phone, and sends only the mentor's answers", () => {
      const view = render();
      toMentor(view);
      chip(view, "Topics you can help with", "Python");
      chip(view, "Topics you can help with", "LLMs and AI apps");
      chip(view, "Saturday", "10 pm to 2 am");
      chip(view, "Friday", "6 to 10 pm");
      type(
        field(view, "Your mentoring or technical experience"),
        "Four years on ML services.",
      );
      press(view, "Continue");

      expect(view.textContent).toContain("Last details");
      expect(view.textContent).not.toContain("Shirt size");
      expect(view.textContent).not.toContain("Dietary restrictions");
      // The phone is offered, not required.
      expect(hasField(view, "Phone (optional)")).toBe(true);
      expect(hasField(view, "Phone *")).toBe(false);

      act(() => field(view, "I understand").click());
      press(view, "Apply to volunteer");

      expect(mocks.submit).toHaveBeenCalledTimes(1);
      expect(mocks.submit).toHaveBeenCalledWith({
        hackathonId: "h1",
        answers: {
          mode: "online",
          affiliation: "industry",
          topics: ["python", "llm_apps"],
          topicOther: undefined,
          onlineAvailability: ["o_sat_late", "o_fri_evening"],
          mentorExperience: "Four years on ML services.",
          phone: undefined,
          acknowledged: true,
        },
      });
    });

    it("takes a phone if given, and refuses half of one", () => {
      const view = render();
      toMentor(view);
      chip(view, "Topics you can help with", "Python");
      chip(view, "Friday", "6 to 10 pm");
      type(field(view, "Your mentoring or technical experience"), "A lot.");
      press(view, "Continue");
      act(() => field(view, "I understand").click());

      type(field(view, "Phone"), "123");
      press(view, "Apply to volunteer");
      expect(alert(view)).toBe("That phone number looks too short.");
      expect(mocks.submit).not.toHaveBeenCalled();

      type(field(view, "Phone"), " (678) 555-0100 ");
      press(view, "Apply to volunteer");
      expect(mocks.submit.mock.calls[0]?.[0].answers.phone).toBe("(678) 555-0100");
    });

    it("keeps the other topic's text only while that topic is picked", () => {
      const view = render();
      toMentor(view);
      chip(view, "Topics you can help with", "Other");
      type(field(view, "Your other topic"), "Rust");
      chip(view, "Topics you can help with", "Other");
      chip(view, "Topics you can help with", "Python");
      chip(view, "Friday", "6 to 10 pm");
      type(field(view, "Your mentoring or technical experience"), "A lot.");
      press(view, "Continue");
      act(() => field(view, "I understand").click());
      press(view, "Apply to volunteer");
      expect(mocks.submit.mock.calls[0]?.[0].answers.topicOther).toBeUndefined();
    });
  });

  describe("both", () => {
    it("asks both sets, one after the other, and sends both", () => {
      const view = render();
      press(view, "Both");
      press(view, "Alum");
      press(view, "Continue");

      // The venue half.
      expect(view.textContent).toContain("Check-in desk and badges");
      press(view, "Continue");
      expect(alert(view)).toBe("Pick at least one time block you can cover.");
      chip(view, "Saturday", "Morning");
      press(view, "Continue");

      // Then the mentoring half.
      expect(view.textContent).toContain("Topics you can help with");
      press(view, "Continue");
      expect(alert(view)).toBe("Pick at least one topic you can help with.");
      chip(view, "Topics you can help with", "Data analysis");
      chip(view, "Friday", "10 pm to 2 am");
      type(field(view, "Your mentoring or technical experience"), "Taught SQL labs.");
      press(view, "Continue");

      // And the details need the phone, because they will be at the venue.
      expect(hasField(view, "Phone *")).toBe(true);
      press(view, "M");
      type(field(view, "Phone"), "(404) 555-0142");
      act(() => field(view, "I understand").click());
      press(view, "Apply to volunteer");

      expect(mocks.submit).toHaveBeenCalledWith({
        hackathonId: "h1",
        answers: {
          mode: "both",
          affiliation: "alum",
          availability: ["sat_morning"],
          roles: [],
          experience: undefined,
          shirtSize: "M",
          dietary: [],
          topics: ["data_analysis"],
          topicOther: undefined,
          onlineAvailability: ["o_fri_late"],
          mentorExperience: "Taught SQL labs.",
          phone: "(404) 555-0142",
          acknowledged: true,
        },
      });
    });

    it("sends none of the venue's leftovers when someone changes to online", () => {
      const view = render();
      press(view, "In person at Klaus");
      press(view, "Alum");
      press(view, "Continue");
      chip(view, "Saturday", "Morning");
      press(view, "Back");
      // Changed their mind on the first step.
      press(view, "Online mentor");
      press(view, "Continue");
      chip(view, "Topics you can help with", "Python");
      chip(view, "Friday", "6 to 10 pm");
      type(field(view, "Your mentoring or technical experience"), "A lot.");
      press(view, "Continue");
      act(() => field(view, "I understand").click());
      press(view, "Apply to volunteer");

      const sent = mocks.submit.mock.calls[0]?.[0].answers;
      expect(sent.mode).toBe("online");
      expect(sent).not.toHaveProperty("availability");
      expect(sent).not.toHaveProperty("shirtSize");
      expect(sent).not.toHaveProperty("dietary");
    });
  });

  describe("saved answers", () => {
    it("opens on a saved in-person application and saves a correction instead of applying again", () => {
      const view = render({ saved: savedVenue, editing: true });
      expect(view.querySelector('button[aria-pressed="true"]')?.textContent).toBe(
        "In person at Klaus",
      );
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
        answers: {
          mode: "in_person",
          affiliation: "alum",
          availability: ["fri_setup", "sun_closing"],
        },
      });
    });

    it("opens on a saved online application, with the other topic's text back in its field", () => {
      const view = render({ saved: savedMentor, editing: true });
      expect(stepLabels(view)).toEqual([
        "How you'll help",
        "Online mentoring",
        "Last details",
      ]);
      press(view, "Continue");
      expect(field(view, "Your other topic").value).toBe("Rust");
      expect(field(view, "Your mentoring or technical experience").value).toBe(
        "Four years on ML services.",
      );
      press(view, "Continue");
      press(view, "Save changes");
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.update.mock.calls[0]?.[0].answers).toMatchObject({
        mode: "online",
        topics: ["python", "other"],
        topicOther: "Rust",
        onlineAvailability: ["o_fri_evening"],
      });
    });

    it("applies again from a withdrawn application's answers", () => {
      const view = render({ saved: savedVenue, editing: false });
      press(view, "Continue");
      press(view, "Continue");
      press(view, "Apply to volunteer");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.submit).toHaveBeenCalledTimes(1);
    });
  });
});
