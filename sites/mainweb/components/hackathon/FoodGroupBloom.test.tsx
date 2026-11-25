// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { FOOD_GROUPS } from "@query/api/discord-config";

import { FoodGroupBloom } from "./FoodGroupBloom";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return container;
}

describe("FoodGroupBloom", () => {
  it("names the hacker's flower and draws it", () => {
    const [, sunflower] = FOOD_GROUPS;
    const view = render(<FoodGroupBloom group={sunflower} />);
    expect(view.querySelector("h2")?.textContent).toBe("Your bloom: Sunflower");
    expect(view.textContent).toContain("Your flower for the weekend");
    expect(view.textContent).not.toMatch(/food group/i);
    expect(view.textContent).toContain("Discord");
    const image = view.querySelector("img");
    expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("draws a different picture for each group", () => {
    const sources = FOOD_GROUPS.map((group) =>
      render(<FoodGroupBloom group={group} />)
        .querySelector("img")
        ?.getAttribute("src"),
    );
    expect(new Set(sources).size).toBe(FOOD_GROUPS.length);
  });

  it("renders nothing without a food group", () => {
    expect(render(<FoodGroupBloom group={null} />).innerHTML).toBe("");
    expect(render(<FoodGroupBloom group={undefined} />).innerHTML).toBe("");
  });
});
