import { describe, expect, it } from "vitest";

import type { Imported } from "./source";
import {
  importLines,
  parseNamedImports,
  propertiesOf,
  referencesOf,
  sourceOf,
} from "./source";

const CORE = "@query/core";
const imports: Imported[] = [
  {
    from: CORE,
    imported: "VENUE_TZ",
    local: "VENUE_TZ",
    value: "Test/Zone",
  },
  {
    from: CORE,
    imported: "SOCIAL_LINKS",
    local: "SOCIAL_LINKS",
    value: { mastodon: "https://social.test/a", "not-an-id": "https://x.test" },
  },
  {
    from: "@query/other",
    imported: "ORG",
    local: "ORG_NAME",
    value: "The Org",
  },
  { from: CORE, imported: "LIMIT", local: "LIMIT", value: 5 },
];

describe("named imports of a config", () => {
  it("reads each specifier, with its alias, from one or many lines", () => {
    const source = `import {
  MLH_CODE_OF_CONDUCT_URL,
  ORG as ORG_NAME,
  type Shape,
} from "@query/core";
import type { Other } from "@query/other";
import { defineEvent } from '@query/event-kit';
import Default from "./thing";
const x = 1;`;
    expect(parseNamedImports(source)).toEqual([
      {
        from: CORE,
        imported: "MLH_CODE_OF_CONDUCT_URL",
        local: "MLH_CODE_OF_CONDUCT_URL",
      },
      { from: CORE, imported: "ORG", local: "ORG_NAME" },
      {
        from: "@query/event-kit",
        imported: "defineEvent",
        local: "defineEvent",
      },
    ]);
  });
});

describe("carrying a value that an import holds", () => {
  const references = referencesOf(imports);

  it("finds the strings of constants and of the properties of objects", () => {
    expect(references.get("Test/Zone")?.expression).toBe("VENUE_TZ");
    expect(references.get("https://social.test/a")?.expression).toBe(
      "SOCIAL_LINKS.mastodon",
    );
    expect(references.get("The Org")?.expression).toBe("ORG_NAME");
    expect(references.has("https://x.test")).toBe(false);
    expect(references.has("5")).toBe(false);
  });

  it("writes such a value as the import, and every other value as a literal", () => {
    const used = new Set<Imported>();
    const text = sourceOf(
      {
        timeZone: "Test/Zone",
        plain: "Test/Zonee",
        n: 3,
        list: ["The Org"],
        none: [],
      },
      references,
      used,
    );
    expect(text).toBe(
      [
        "{",
        '  "timeZone": VENUE_TZ,',
        '  "plain": "Test/Zonee",',
        '  "n": 3,',
        '  "list": [',
        "    ORG_NAME",
        "  ],",
        '  "none": []',
        "}",
      ].join("\n"),
    );
    expect(used.size).toBe(2);
  });

  it("gives the properties without the braces, indented like the rest of the config", () => {
    const text = propertiesOf({ a: { b: "Test/Zone" } }, references, new Set());
    expect(text).toBe('  "a": {\n    "b": VENUE_TZ\n  }');
  });

  it("imports exactly the names a carried value used, once each, with aliases kept", () => {
    const used = new Set<Imported>();
    sourceOf(
      ["The Org", "https://social.test/a", "Test/Zone"],
      references,
      used,
    );
    sourceOf(["https://social.test/a"], references, used);
    expect(importLines(used)).toBe(
      [
        'import { SOCIAL_LINKS, VENUE_TZ } from "@query/core";',
        'import { ORG as ORG_NAME } from "@query/other";',
      ].join("\n"),
    );
    expect(importLines(new Set())).toBe("");
  });
});
