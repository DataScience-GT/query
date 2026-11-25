// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DiscordCard } from "./DiscordCard";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ hackathon: { myDiscord: { invalidate: vi.fn() } } }),
    hackathon: {
      myDiscord: {
        useQuery: () => ({
          data: {
            eligible: true,
            enabled: false,
            inviteUrl: null,
            linked: false,
            username: null,
            foodGroup: { key: "lily", number: 4, name: "Lily" },
            fasting: false,
            ramadanOptIn: false,
          },
        }),
      },
      unlinkDiscord: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

function render(bloom?: boolean) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<DiscordCard hackathonId="h1" bloom={bloom} />));
  return container;
}

describe("DiscordCard food group", () => {
  it("draws the flower beside the name on a Hacklytics edition", () => {
    const view = render(true);
    expect(view.textContent).toContain("Food group: Lily");
    expect(view.querySelector("img")?.getAttribute("src")).toMatch(
      /^data:image\/svg\+xml,/,
    );
  });

  it("keeps any other hackathon to the plain text", () => {
    const view = render();
    expect(view.textContent).toContain("Food group: Lily");
    expect(view.querySelector("img")).toBeNull();
  });
});
