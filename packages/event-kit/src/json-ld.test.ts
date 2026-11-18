import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
  it("cannot close the script tag it is embedded in", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).toContain(String.fromCharCode(92) + "u003c/script>");
  });

  it("parses back to the original value", () => {
    const value = { name: "a < b </script>", nested: ["<x>"] };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });
});
