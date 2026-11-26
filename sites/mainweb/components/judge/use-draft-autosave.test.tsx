// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDraftAutosave } from "./use-draft-autosave";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

type Props = Parameters<typeof useDraftAutosave>[0];

function Harness(props: Props) {
  useDraftAutosave(props);
  return null;
}

let root: Root;

function render(props: Props) {
  act(() => root.render(React.createElement(Harness, props)));
}

const saved = () => ({ revision: 1, savedAt: new Date() });

beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useDraftAutosave onSaved", () => {
  it("fires once after a save reaches the server, not on opening", async () => {
    const save = vi.fn(async () => saved());
    const onSaved = vi.fn();
    const base = {
      enabled: true,
      revision: 0,
      save,
      serverKey: "a",
      storageKey: null,
      onSaved,
    };

    render({ ...base, answersKey: "a" });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    render({ ...base, answersKey: "b" });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Nothing new to save: the sweep must not call it again.
    await act(async () => void vi.advanceTimersByTime(3_000));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("calls the newest handler when it changes while a save is in flight", async () => {
    let finish: (value: ReturnType<typeof saved>) => void = () => {};
    const save = vi.fn(
      () => new Promise<ReturnType<typeof saved>>((r) => (finish = r)),
    );
    const first = vi.fn();
    const second = vi.fn();
    const base = {
      answersKey: "b",
      enabled: true,
      revision: 0,
      save,
      serverKey: "a",
      storageKey: null,
    };

    render({ ...base, onSaved: first });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(save).toHaveBeenCalledTimes(1);

    render({ ...base, onSaved: second });
    await act(async () => finish(saved()));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the save fails", async () => {
    const save = vi.fn(async () => {
      throw new Error("offline");
    });
    const onSaved = vi.fn();

    render({
      answersKey: "b",
      enabled: true,
      revision: 0,
      save,
      serverKey: "a",
      storageKey: null,
      onSaved,
    });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
