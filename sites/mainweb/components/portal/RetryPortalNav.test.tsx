// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RetryPortalNav } from "./RetryPortalNav";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
});
afterEach(() => vi.useRealTimers());

function mount() {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(React.createElement(RetryPortalNav)));
  return root;
}

describe("RetryPortalNav", () => {
  it("asks the server to draw the route again, three times with backoff", () => {
    mount();
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(8_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(20_000));
    expect(refresh).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once the layout no longer renders it", () => {
    const root = mount();
    act(() => vi.advanceTimersByTime(2_000));
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
