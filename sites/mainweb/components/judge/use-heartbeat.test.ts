import { describe, expect, it, vi } from "vitest";
import { HEARTBEAT_POLL, beatOnReturn } from "./use-heartbeat";

function target() {
  const handlers = new Map<string, () => void>();
  return {
    visibilityState: "hidden" as DocumentVisibilityState,
    addEventListener: vi.fn((type: string, fn: () => void) => {
      handlers.set(type, fn);
    }),
    removeEventListener: vi.fn((type: string) => {
      handlers.delete(type);
    }),
    fire: (type: string) => handlers.get(type)?.(),
  };
}

describe("heartbeat polling", () => {
  it("keeps beating in a hidden tab", () => {
    expect(HEARTBEAT_POLL.refetchIntervalInBackground).toBe(true);
  });
});

describe("beatOnReturn", () => {
  it("beats when the tab becomes visible, not when it hides", () => {
    const doc = target();
    const win = target();
    const beat = vi.fn();
    beatOnReturn(doc as never, win as never, beat);
    doc.fire("visibilitychange");
    expect(beat).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.fire("visibilitychange");
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it("beats when the window regains focus", () => {
    const doc = target();
    const win = target();
    const beat = vi.fn();
    beatOnReturn(doc as never, win as never, beat);
    win.fire("focus");
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it("stops listening on cleanup", () => {
    const doc = target();
    const win = target();
    const beat = vi.fn();
    beatOnReturn(doc as never, win as never, beat)();
    win.fire("focus");
    expect(beat).not.toHaveBeenCalled();
  });
});
