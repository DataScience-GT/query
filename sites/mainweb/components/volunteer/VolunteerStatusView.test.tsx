// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VolunteerAnswers, VolunteerStatus } from "@query/db/constants";
import { VolunteerStatusView } from "./VolunteerStatusView";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const answers: VolunteerAnswers = {
  mode: "in_person",
  affiliation: "gt_student",
  availability: ["fri_setup", "sat_morning"],
  roles: ["check_in"],
  shirtSize: "M",
  dietary: [],
  phone: "(404) 555-0142",
  acknowledged: true,
};

const mentorAnswers: VolunteerAnswers = {
  mode: "online",
  affiliation: "industry",
  topics: ["python", "other"],
  topicOther: "Rust",
  onlineAvailability: ["o_fri_evening", "o_sat_late"],
  mentorExperience: "Four years on ML services.",
  acknowledged: true,
};

const bothAnswers: VolunteerAnswers = {
  ...answers,
  ...mentorAnswers,
  mode: "both",
  phone: "(404) 555-0142",
} as VolunteerAnswers;

let mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];

function render(
  status: VolunteerStatus,
  over: {
    accepting?: boolean;
    canEdit?: boolean;
    name?: string;
    answers?: VolunteerAnswers;
    discordCard?: React.ReactNode;
  } = {},
) {
  const calls = { edit: vi.fn(), withdraw: vi.fn(), again: vi.fn() };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  act(() =>
    root.render(
      <VolunteerStatusView
        hackathon={{
          name: over.name ?? "Hacklytics: Digital Bloom",
          startDate: "2027-02-26T22:00:00Z",
        }}
        application={{ status, answers: over.answers ?? answers }}
        accepting={over.accepting ?? true}
        canEdit={over.canEdit ?? true}
        eventHref="/hackathons/hacklytics-digital-bloom"
        discordCard={over.discordCard}
        contactEmail="hello@hacklytics.io"
        busy={false}
        onEdit={calls.edit}
        onWithdraw={calls.withdraw}
        onApplyAgain={calls.again}
      />,
    ),
  );
  const buttons = () =>
    [...el.querySelectorAll("button")].map((b) => b.textContent);
  const press = (label: string) =>
    act(() =>
      [...el.querySelectorAll("button")]
        .find((b) => b.textContent === label)
        ?.click(),
    );
  return { el, calls, buttons, press };
}

afterEach(() => {
  for (const { root, el } of mounted) {
    act(() => root.unmount());
    el.remove();
  }
  mounted = [];
});

describe("VolunteerStatusView", () => {
  it("shows a pending application with its answers, and lets the person edit or withdraw", () => {
    const view = render("pending");
    expect(view.el.textContent).toContain("Pending review");
    expect(view.el.textContent).toContain("Application received");
    expect(view.el.textContent).toContain("Friday, Feb 26: Afternoon setup");
    expect(view.el.textContent).toContain("(404) 555-0142");
    expect(view.buttons()).toEqual(["Edit answers", "Withdraw"]);

    view.press("Edit answers");
    view.press("Withdraw");
    expect(view.calls.edit).toHaveBeenCalledTimes(1);
    expect(view.calls.withdraw).toHaveBeenCalledTimes(1);
  });

  it("takes the edit button away once the edition is over", () => {
    const view = render("pending", { canEdit: false });
    expect(view.buttons()).toEqual(["Withdraw"]);
    expect(view.el.textContent).toContain("It can no longer be edited.");
  });

  it("confirms an approved volunteer, says the Discord is required, and points at the event page", () => {
    const view = render("approved");
    expect(view.el.textContent).toContain("Confirmed");
    expect(view.el.textContent).toContain("You're confirmed as a volunteer");
    expect(view.el.textContent).toContain(
      "Join the Hacklytics Discord. It's required for volunteers",
    );
    expect(
      view.el.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
    ).toBe("/hackathons/hacklytics-digital-bloom");
    // Plans change after approval too, so the way out stays.
    expect(view.buttons()).toEqual(["Withdraw"]);
  });

  it("puts the Discord card in an approved volunteer's page, and in no other state", () => {
    const card = <p data-testid="discord-card">Join the Hacklytics Discord</p>;
    const approved = render("approved", { discordCard: card });
    expect(approved.el.querySelector("[data-testid=discord-card]")).not.toBeNull();
    for (const s of ["pending", "declined", "withdrawn"] as const) {
      expect(
        render(s, { discordCard: card }).el.querySelector("[data-testid=discord-card]"),
      ).toBeNull();
    }
  });

  it("declines kindly, with no answers and nothing to do", () => {
    const view = render("declined");
    expect(view.el.textContent).toContain("Not placed this time");
    expect(view.el.textContent).toContain("hello@hacklytics.io");
    expect(view.el.textContent).not.toContain("(404) 555-0142");
    expect(view.buttons()).toEqual([]);
  });

  it("offers a withdrawn application again only while applications are open", () => {
    const open = render("withdrawn", { accepting: true });
    expect(open.buttons()).toEqual(["Apply again"]);
    open.press("Apply again");
    expect(open.calls.again).toHaveBeenCalledTimes(1);

    const closed = render("withdrawn", { accepting: false });
    expect(closed.buttons()).toEqual([]);
    expect(closed.el.textContent).toContain("Applications are closed");
  });

  it("keeps the copy calm: no exclamation marks in any state", () => {
    for (const s of ["pending", "approved", "declined", "withdrawn"] as const) {
      expect(render(s).el.textContent).not.toContain("!");
    }
  });

  it("names the event Discord for a hackathon that is not Hacklytics", () => {
    const view = render("approved", { name: "Spring Build Jam" });
    expect(view.el.textContent).toContain("Join the event Discord.");
  });

  it("tells an online mentor the Discord is where hackers' questions come in, and shows only their half", () => {
    const view = render("approved", { answers: mentorAnswers });
    expect(view.el.textContent).toContain(
      "hackers' questions come in through its mentor channels",
    );
    expect(view.el.textContent).toContain("Online mentor");
    expect(view.el.textContent).toContain("Python");
    expect(view.el.textContent).toContain("Other: Rust");
    expect(view.el.textContent).toContain("Friday, Feb 26: 6 to 10 pm ET");
    expect(view.el.textContent).toContain("Four years on ML services.");
    // Nothing about the venue, and no phone they never gave.
    expect(view.el.textContent).not.toContain("Shirt size");
    expect(view.el.textContent).not.toContain("Dietary restrictions");
    expect(view.el.textContent).toContain("Not given");
  });

  it("names shifts, changes and questions for someone who chose both, and shows both halves", () => {
    const view = render("pending", { answers: bothAnswers });
    expect(view.el.textContent).toContain("In person and online mentor");
    expect(view.el.textContent).toContain("Friday, Feb 26: Afternoon setup");
    expect(view.el.textContent).toContain("Friday, Feb 26: 6 to 10 pm ET");
    expect(view.el.textContent).toContain("Shirt size");
    expect(view.el.textContent).toContain("Mentoring experience");

    const approved = render("approved", { answers: bothAnswers });
    expect(approved.el.textContent).toContain(
      "shifts, changes and hackers' questions are all there",
    );
  });
});
