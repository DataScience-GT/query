// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DiscordCard, linkedRolesHint, requiredLine } from "./DiscordCard";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const NO_ROLES = { hacker: false, judge: false, volunteer: false };
const FLOWER = { key: "lily", number: 4, name: "Lily" };

const mock = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ hackathon: { myDiscord: { invalidate: vi.fn() } } }),
    hackathon: {
      myDiscord: { useQuery: () => ({ data: mock.data }) },
      unlinkDiscord: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

/** What `hackathon.myDiscord` answers, with the parts a test cares about set. */
function answer(over: Record<string, unknown> = {}) {
  mock.data = {
    hackathon: { id: "h1", name: "Hacklytics 2027" },
    enabled: true,
    eligible: true,
    roles: { ...NO_ROLES, hacker: true },
    awaitingConfirmation: false,
    linked: false,
    username: null,
    foodGroup: FLOWER,
    fasting: false,
    ramadanOptIn: false,
    ...over,
  };
}

function render(props: { bloom?: boolean; hackathonId?: string } = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<DiscordCard hackathonId="h1" {...props} />));
  return container;
}

const joinLink = (view: HTMLElement) =>
  [...view.querySelectorAll("a")].find(
    (a) => a.textContent === "Join the Hacklytics Discord",
  );

describe("DiscordCard bloom", () => {
  it("draws the flower beside the name on a Hacklytics edition", () => {
    answer({ enabled: false });
    const view = render({ bloom: true });
    expect(view.textContent).toContain("Your bloom: Lily");
    expect(view.querySelector("img")?.getAttribute("src")).toMatch(
      /^data:image\/svg\+xml,/,
    );
  });

  it("keeps any other hackathon to the plain text", () => {
    answer({ enabled: false });
    const view = render();
    expect(view.textContent).toContain("Your bloom: Lily");
    expect(view.querySelector("img")).toBeNull();
  });
});

describe("DiscordCard roles", () => {
  it("lets a hacker who confirmed join, without calling it required", () => {
    answer();
    const view = render();
    expect(view.textContent).toContain("Join the DS@GT Discord");
    expect(view.textContent).not.toContain("required");
    expect(joinLink(view)?.getAttribute("href")).toBe(
      "/api/discord/connect?hackathon=h1&then=invite",
    );
  });

  it("asks an accepted hacker who has not confirmed to confirm, and offers no invite", () => {
    answer({
      eligible: false,
      roles: NO_ROLES,
      awaitingConfirmation: true,
    });
    const view = render();
    expect(view.textContent).toContain(
      "Confirm you're coming to get the Discord invite.",
    );
    expect(view.textContent).toContain("Your bloom: Lily");
    expect(joinLink(view)).toBeUndefined();
  });

  it("tells a judge joining is required and why", () => {
    answer({ roles: { ...NO_ROLES, judge: true }, foodGroup: null });
    const view = render();
    expect(view.textContent).toContain(
      "Join the Hacklytics Discord. It's required for judges: schedules and room changes are posted there.",
    );
    expect(view.textContent).toContain("to get your judge role");
    expect(joinLink(view)).toBeDefined();
  });

  it("tells a volunteer joining is required", () => {
    answer({ roles: { ...NO_ROLES, volunteer: true }, foodGroup: null });
    const view = render();
    expect(view.textContent).toContain(
      "It's required for volunteers: shifts and desk changes are posted there.",
    );
  });

  it("finds the edition itself when the page names none", () => {
    answer({ roles: { ...NO_ROLES, volunteer: true }, foodGroup: null });
    const view = render({ hackathonId: undefined });
    expect(joinLink(view)?.getAttribute("href")).toContain("hackathon=h1");
  });

  it("shows a linked judge their account and the way to update it", () => {
    answer({
      roles: { ...NO_ROLES, judge: true },
      foodGroup: null,
      linked: true,
      username: "ada",
    });
    const view = render();
    expect(view.textContent).toContain("Linked as @ada");
    expect(view.textContent).toContain("Update my roles");
    expect(view.textContent).toContain("Unlink");
  });

  it("keeps a hacker linked before the confirmation step linked, and still asks to confirm", () => {
    answer({
      eligible: false,
      roles: NO_ROLES,
      awaitingConfirmation: true,
      linked: true,
      username: "ada",
    });
    const view = render();
    expect(view.textContent).toContain("Linked as @ada");
    expect(view.textContent).toContain("Confirm you're coming");
    expect(view.textContent).toContain("Unlink");
  });

  it("draws nothing for someone with no role, or when it has no edition", () => {
    answer({
      hackathon: null,
      eligible: false,
      roles: NO_ROLES,
      foodGroup: null,
    });
    expect(render({ hackathonId: undefined }).innerHTML).toBe("");
    answer({ eligible: false, roles: NO_ROLES, foodGroup: null });
    expect(render().innerHTML).toBe("");
  });
});

describe("DiscordCard copy", () => {
  it("names what each role is joining for", () => {
    expect(requiredLine(NO_ROLES)).toBeNull();
    expect(requiredLine({ judge: true, volunteer: true })).toContain(
      "judges and volunteers",
    );
  });

  it("names the roles to claim", () => {
    expect(linkedRolesHint({ hacker: true, judge: false, volunteer: false })).toContain(
      "get your flower role.",
    );
    expect(linkedRolesHint({ hacker: true, judge: true, volunteer: false })).toContain(
      "flower role and judge role.",
    );
    expect(linkedRolesHint({ hacker: true, judge: true, volunteer: true })).toContain(
      "flower role, judge role and volunteer role.",
    );
  });
});
