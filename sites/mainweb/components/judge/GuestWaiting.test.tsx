import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestWaiting } from "./GuestWaiting";
import type { DeskContext } from "./desk";

// A static render: the screen has no state of its own. The desk polls its
// context and swaps this out once an organizer lets the guest in.

Object.assign(globalThis, { React });

const context = {
  kind: "guest",
  admitted: false,
  needsName: false,
  judge: { id: "j", displayName: "Remy" },
  hackathon: { id: "h", name: "Hacklytics 2027" },
  room: {
    id: "r",
    name: "Table 4",
    kind: "table",
    buildingName: "Hall A",
    challengeLabel: "Best Use of AI",
  },
} as unknown as DeskContext;

describe("GuestWaiting", () => {
  const html = renderToStaticMarkup(
    <GuestWaiting hackathonId="h" context={context} />,
  );

  it("says the guest is waiting for an organizer to let them in", () => {
    expect(html).toContain("Waiting for an organizer to let you in");
  });

  it("names the guest and the station they will judge", () => {
    expect(html).toContain("Remy");
    expect(html).toContain("Best Use of AI at Table 4");
  });

  it("points an approved judge to sign in instead", () => {
    expect(html).toContain("Sign in instead");
  });
});
