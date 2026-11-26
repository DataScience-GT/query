// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VerifyPage from "./page";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("email=a%40b.co"),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("verify page", () => {
  it("puts the cursor in the first digit box on arrival", async () => {
    await act(async () => root.render(React.createElement(VerifyPage)));

    const boxes = host.querySelectorAll("input");
    expect(boxes).toHaveLength(6);
    expect(document.activeElement).toBe(boxes[0]);
  });
});
