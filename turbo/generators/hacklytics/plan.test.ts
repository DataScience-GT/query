import { describe, expect, it } from "vitest";

import type { Edition } from "./editions";
import type { Answers, Inputs } from "./plan";
import {
  buildPlan,
  validateEnd,
  validateStart,
  validateTheme,
  validateYear,
} from "./plan";
import { extractTheme, splitTopLevel } from "./theme";

const ZONE = "America/New_York";

const latest: Edition = {
  year: 2027,
  dir: "sites/hacklytics2027",
  timeZone: ZONE,
  core: {
    brand: "Series",
    year: 2027,
    theme: {
      name: "Old Theme",
      ground: { light: "#ffffff", dark: "#000000" },
      storageKey: "key",
    },
    start: "2027-02-26T17:00:00-05:00",
    end: "2027-02-28T16:00:00-05:00",
    hacking: {
      start: "2027-02-26T21:00:00-05:00",
      end: "2027-02-28T09:00:00-05:00",
    },
    timeZone: ZONE,
    venue: { name: "The Hall" },
    links: {
      social: [{ label: "Chat", href: "https://chat.example.test/room" }],
    },
    registration: {
      url: "https://example.test/form",
      validFrom: "2026-08-01T00:00:00-04:00",
    },
    someFieldTheKitAddedLater: { kept: true },
  },
  seo: {
    tagline: "A tagline",
    description: "old description",
    shareDescription: "old share",
    summary: "old summary",
    eventDescription: "old event",
    image: "/share.jpg",
    url: "https://example.test",
  },
  imports: [
    {
      from: "@query/core",
      imported: "VENUE_TZ",
      local: "VENUE_TZ",
      value: ZONE,
    },
    {
      from: "@query/core",
      imported: "SOCIAL_LINKS",
      local: "SOCIAL_LINKS",
      value: { chat: "https://chat.example.test/room" },
    },
  ],
  kit: { publicFiles: ["/favicon.ico", "/sw.js"] },
};

const CSS = `/* The art, described. */
@import "tailwindcss";
@import "@query/event-kit/styles.css";

@custom-variant short (@media (max-height: 820px));

@theme inline {
  --font-display: var(--x);
}

/* Night. */
:root {
  --ground: #000000;
  --navbar-height: 72px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1); /* the one curve */
}

.pixelated { image-rendering: pixelated; }

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { --ground: #ffffff; }
}

@media (prefers-reduced-motion: reduce) {
  .flower { animation: none; }
}
`;

const inputs: Inputs = {
  latest,
  existing: [2026, 2027],
  themeCss: CSS,
  packageJson: JSON.stringify({
    name: "hacklytics2027",
    scripts: {
      build: "astro build",
      vision: "node scripts/capture-vision.mts",
    },
    devDependencies: { playwright: "1.0.0", astro: "catalog:" },
  }),
};

const answers: Answers = {
  year: "2099",
  theme: "  Neon Dawn ",
  start: "2099-02-26",
  end: "2099-02-28",
};

describe("answers", () => {
  it("accepts a year after every existing edition, and only that", () => {
    expect(validateYear("2028", [2026, 2027])).toBe(true);
    expect(validateYear("2027", [2026, 2027])).toMatch(
      /greater than the latest edition, 2027/,
    );
    expect(validateYear("2025", [2026, 2027])).toMatch(/greater than/);
    expect(validateYear("28", [2026, 2027])).toMatch(/four digits/);
  });

  it("wants the start date in the edition's year", () => {
    expect(validateStart("2099-02-26", "2099")).toBe(true);
    expect(validateStart("2098-12-31", "2099")).toMatch(/must be in 2099/);
    expect(validateStart("2099-02-30", "2099")).toMatch(/real date/);
  });

  it("wants an end date that leaves the weekend in order", () => {
    const pattern = {
      start: "17:00",
      end: "16:00",
      hackStart: { days: 0, clock: "21:00" },
      hackEnd: { days: 0, clock: "09:00" },
    };
    expect(validateEnd("2099-02-28", "2099-02-26", pattern, ZONE)).toBe(true);
    expect(validateEnd("2099-02-25", "2099-02-26", pattern, ZONE)).toMatch(
      /before the start/,
    );
    expect(validateEnd("2099-02-26", "2099-02-26", pattern, ZONE)).toMatch(
      /would not run in order/,
    );
  });

  it("wants a theme name", () => {
    expect(validateTheme("Neon Dawn")).toBe(true);
    expect(validateTheme("   ")).not.toBe(true);
  });
});

describe("buildPlan", () => {
  it("lays the latest edition's clock times on the new dates in winter and in daylight time", () => {
    const winter = buildPlan(answers, inputs);
    expect(winter.core).toContain('"start": "2099-02-26T17:00:00-05:00"');
    expect(winter.core).toContain('"end": "2099-02-28T16:00:00-05:00"');

    const spring = buildPlan(
      { ...answers, start: "2099-03-26", end: "2099-03-28" },
      inputs,
    );
    expect(spring.core).toContain('"start": "2099-03-26T17:00:00-04:00"');
    expect(spring.core).toContain(
      '"hacking": {\n    "start": "2099-03-26T21:00:00-04:00",\n    "end": "2099-03-28T09:00:00-04:00"',
    );
  });

  it("carries over every field the answers do not decide, including ones it has never heard of", () => {
    const plan = buildPlan(answers, inputs);
    expect(plan.carried).toBe(
      "brand, timeZone, venue, links, registration, someFieldTheKitAddedLater",
    );
    expect(plan.core).toContain('"someFieldTheKitAddedLater"');
    expect(plan.core).toContain('"storageKey": "key"');
    expect(plan.core).toContain('"name": "Neon Dawn"');
    expect(plan.core).not.toContain("Old Theme");
  });

  it("writes new copy for the description fields and carries the rest of seo", () => {
    const plan = buildPlan(answers, inputs);
    expect(plan.seo).toContain('"tagline": "A tagline"');
    expect(plan.seo).toContain('"url": "https://example.test"');
    expect(plan.seo).not.toContain("old description");
    expect(plan.shareImage).toBe("/share.jpg");
  });

  it("keeps a value the latest config read from a package as that import, and imports it", () => {
    const plan = buildPlan(answers, inputs);
    expect(plan.core).toContain('"timeZone": VENUE_TZ');
    expect(plan.core).toContain('"href": SOCIAL_LINKS.chat');
    expect(plan.core).not.toContain("America/New_York");
    expect(plan.core).not.toContain("chat.example.test");
    expect(plan.imports).toBe(
      'import { SOCIAL_LINKS, VENUE_TZ } from "@query/core";',
    );
  });

  it("imports nothing when the latest config imports nothing", () => {
    const plan = buildPlan(answers, {
      ...inputs,
      latest: { ...latest, imports: [] },
    });
    expect(plan.imports).toBe("");
    expect(plan.core).toContain('"timeZone": "America/New_York"');
  });

  it("moves the offer's start to the new year", () => {
    expect(buildPlan(answers, inputs).core).toContain(
      '"validFrom": "2098-08-01T00:00:00-04:00"',
    );
  });

  it("points the schedule board at the event's days, not at typed weekdays", () => {
    const { board } = buildPlan(answers, inputs);
    expect(board.map((row) => row.when)).toEqual([
      "${dates.days[0].key} 5:00 PM",
      "${dates.days[0].key} 9:00 PM",
      "${dates.days[2].key} 9:00 AM",
      "${dates.days[2].key} 4:00 PM",
    ]);
  });

  it("copies the theme's tokens and fonts, and not the art", () => {
    const plan = buildPlan(answers, inputs);
    expect(plan.themeCss).toContain("--ground: #000000;");
    expect(plan.themeCss).toContain("@theme inline");
    expect(plan.themeCss).not.toContain("pixelated");
    expect(plan.themeCss).not.toContain("flower");
    expect(plan.themeCss).not.toContain("The art, described");
    expect(plan.copies.map(([from]) => from)).toContain("public/fonts");
  });

  it("copies the files the kit says it links to, and nothing it does not", () => {
    const copied = buildPlan(answers, inputs).copies.map(([from]) => from);
    expect(copied).toEqual(
      expect.arrayContaining([
        "public/favicon.ico",
        "public/sw.js",
        "public/share.jpg",
      ]),
    );
    expect(copied).not.toContain("public/apple-icon.png");
  });

  it("drops the package.json entries that belong to a script the new site lacks", () => {
    const pkg = JSON.parse(buildPlan(answers, inputs).packageJson);
    expect(pkg.name).toBe("hacklytics2099");
    expect(pkg.scripts).toEqual({ build: "astro build" });
    expect(pkg.devDependencies).toEqual({ astro: "catalog:" });
  });

  it("fails before writing anything when the answers do not make an edition", () => {
    expect(() => buildPlan({ ...answers, year: "2027" }, inputs)).toThrow(
      /greater than/,
    );
    expect(() => buildPlan({ ...answers, end: "2099-02-20" }, inputs)).toThrow(
      /before the start/,
    );
  });
});

describe("theme CSS", () => {
  it("splits a stylesheet into comments, statements and blocks", () => {
    const items = splitTopLevel(CSS);
    expect(items.map((item) => item.kind)).toEqual([
      "comment",
      "statement",
      "statement",
      "statement",
      "block",
      "comment",
      "block",
      "block",
      "block",
      "block",
    ]);
    expect(items[7].prelude).toBe(".pixelated");
  });

  it("keeps each theme block with the comment above it", () => {
    const theme = extractTheme(CSS);
    expect(theme).toContain(
      '@import "tailwindcss";\n@import "@query/event-kit/styles.css";',
    );
    expect(theme).toContain("/* Night. */\n:root {");
    expect(theme).toContain("@media (prefers-color-scheme: light)");
  });
});
