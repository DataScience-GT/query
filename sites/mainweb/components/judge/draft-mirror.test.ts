import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMirror,
  mirrorKey,
  readMirror,
  writeMirror,
} from "./draft-mirror";

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const KEY = mirrorKey("judge", "entry", "challenge");
const answers = JSON.stringify([
  { quality: 4 },
  { notes: { value: "Strong demo", isPublic: false } },
]);

describe("draft mirror", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is keyed by judge, project and challenge", () => {
    expect(mirrorKey("j", "e", "c")).not.toBe(mirrorKey("k", "e", "c"));
    expect(mirrorKey("j", "e", "c")).not.toBe(mirrorKey("j", "f", "c"));
    expect(mirrorKey("j", "e", "c")).not.toBe(mirrorKey("j", "e", "d"));
  });

  it("restores answers kept after the server's copy", () => {
    writeMirror(KEY, answers, 2_000);
    expect(readMirror(KEY, 1_000)).toEqual({
      ratings: { quality: 4 },
      responses: { notes: { value: "Strong demo", isPublic: false } },
    });
  });

  it("ignores answers the server has since overtaken", () => {
    writeMirror(KEY, answers, 2_000);
    expect(readMirror(KEY, 2_000)).toBeNull();
    expect(readMirror(KEY, 3_000)).toBeNull();
  });

  it("is null once cleared, or when nothing was kept", () => {
    expect(readMirror(KEY, 0)).toBeNull();
    writeMirror(KEY, answers, 2_000);
    clearMirror(KEY);
    expect(readMirror(KEY, 0)).toBeNull();
  });

  it("drops what is not an answer", () => {
    writeMirror(
      KEY,
      JSON.stringify([
        { quality: "high", craft: 3 },
        { notes: { value: 7 }, ok: { value: "fine", isPublic: true } },
      ]),
      2_000,
    );
    expect(readMirror(KEY, 0)).toEqual({
      ratings: { craft: 3 },
      responses: { ok: { value: "fine", isPublic: true } },
    });
  });

  it("is null for a damaged copy", () => {
    localStorage.setItem(KEY, "not json");
    expect(readMirror(KEY, 0)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ key: "{}", at: 5 }));
    expect(readMirror(KEY, 0)).toBeNull();
  });

  it("does nothing where storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => writeMirror(KEY, answers)).not.toThrow();
    expect(() => clearMirror(KEY)).not.toThrow();
    expect(readMirror(KEY, 0)).toBeNull();
  });
});
