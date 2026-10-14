import { describe, expect, it } from "vitest";
import { uniqueAddresses } from "./notify";

describe("uniqueAddresses", () => {
  it("mails a linked member at their account, an unlinked one at the listed address", () => {
    expect(
      uniqueAddresses([
        { listedEmail: "ada@devpost.example", accountEmail: "ada@gatech.edu" },
        { listedEmail: "grace@devpost.example", accountEmail: null },
      ]),
    ).toEqual(["ada@gatech.edu", "grace@devpost.example"]);
  });

  it("sends one message per address regardless of case or project", () => {
    expect(
      uniqueAddresses([
        { listedEmail: "Ada@Example.com", accountEmail: null },
        { listedEmail: "ada@example.com ", accountEmail: null },
        { listedEmail: "other@example.com", accountEmail: "ada@example.com" },
      ]),
    ).toEqual(["Ada@Example.com"]);
  });

  it("skips members with no address", () => {
    expect(
      uniqueAddresses([{ listedEmail: "  ", accountEmail: null }]),
    ).toEqual([]);
  });
});
