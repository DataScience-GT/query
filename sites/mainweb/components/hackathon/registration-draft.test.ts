// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLocalDraft,
  newestDraft,
  readLocalDraft,
  writeLocalDraft,
} from "./registration-draft";

const KEY = "reg-draft:h1:u1";

describe("the browser draft", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the answers with their time", () => {
    writeLocalDraft(KEY, JSON.stringify({ firstName: "Ada" }), 1234);
    expect(readLocalDraft(KEY)).toEqual({
      answers: { firstName: "Ada" },
      savedAt: 1234,
    });
  });

  it("reads a draft from before drafts were stamped as the oldest possible", () => {
    localStorage.setItem(KEY, JSON.stringify({ firstName: "Ada" }));
    expect(readLocalDraft(KEY)).toEqual({
      answers: { firstName: "Ada" },
      savedAt: 0,
    });
  });

  it("treats a missing, broken or non-object draft as none", () => {
    expect(readLocalDraft(KEY)).toBeNull();
    for (const bad of ["{oops", "null", "[1,2]", '"text"', "7"]) {
      localStorage.setItem(KEY, bad);
      expect(readLocalDraft(KEY)).toBeNull();
    }
  });

  it("clears the draft", () => {
    writeLocalDraft(KEY, "{}");
    clearLocalDraft(KEY);
    expect(readLocalDraft(KEY)).toBeNull();
  });
});

describe("newestDraft", () => {
  const server = (updatedAt: number | string | Date) => ({
    data: { firstName: "Server" },
    updatedAt: new Date(updatedAt),
  });
  const local = (savedAt: number) => ({
    answers: { firstName: "Local" },
    savedAt,
  });

  it("opens empty with neither", () => {
    expect(newestDraft(null, null)).toEqual({});
    expect(newestDraft(null, undefined)).toEqual({});
  });

  it("uses the only one there is", () => {
    expect(newestDraft(local(5), null)).toEqual({ firstName: "Local" });
    expect(newestDraft(null, server(5))).toEqual({ firstName: "Server" });
  });

  it("prefers the later of the two", () => {
    expect(newestDraft(local(2000), server(1000))).toEqual({
      firstName: "Local",
    });
    expect(newestDraft(local(1000), server(2000))).toEqual({
      firstName: "Server",
    });
  });

  it("takes the server's on a tie, and over an unstamped browser draft", () => {
    expect(newestDraft(local(1000), server(1000))).toEqual({
      firstName: "Server",
    });
    expect(newestDraft(local(0), server("2027-01-01T00:00:00Z"))).toEqual({
      firstName: "Server",
    });
  });

  it("reads the server's time from a string as well as a date", () => {
    expect(
      newestDraft(local(Date.parse("2027-01-02T00:00:00Z")), {
        data: { firstName: "Server" },
        updatedAt: "2027-01-01T00:00:00Z",
      }),
    ).toEqual({ firstName: "Local" });
  });
});
