import { describe, expect, it } from "vitest";
import { hashApiKey, roleForScopes } from "./auth";

describe("api keys", () => {
  it("hashes a token the same way every time", () => {
    expect(hashApiKey("panel_live_key")).toBe(hashApiKey("panel_live_key"));
    expect(hashApiKey("panel_live_key")).not.toBe(hashApiKey("panel_live_other"));
  });

  it("uses the strongest scope as the role", () => {
    expect(roleForScopes(["volunteer", "organizer"])).toBe("organizer");
    expect(roleForScopes(["admin"])).toBe("admin");
    expect(roleForScopes(["import"])).toBe("organizer");
    expect(roleForScopes(["read"])).toBe(null);
  });
});
