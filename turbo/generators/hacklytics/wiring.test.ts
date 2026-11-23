import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { listEditions } from "./editions";
import {
  archiveSiteId,
  firebaseProjectOf,
  liveTargetOf,
  wireCi,
  wireFirebaseJson,
  wireFirebaseRc,
} from "./wiring";

const handover = { prev: 2027, next: 2028 };

const FIREBASE = `${JSON.stringify(
  {
    hosting: [
      { site: "main-site", public: "sites/mainweb/out" },
      {
        target: "live",
        public: "sites/hacklytics2027/out",
        cleanUrls: true,
        headers: [{ source: "**", headers: [{ key: "X", value: "1" }] }],
      },
      { target: "live2026", public: "sites/hacklytics2026/out" },
    ],
  },
  null,
  2,
)}\n`;

const RC = `${JSON.stringify(
  {
    projects: { default: "proj" },
    targets: {
      proj: { hosting: { live: ["site-2027"], live2026: ["site-2026"] } },
    },
  },
  null,
  2,
)}\n`;

const job = (year: number | "", head: string) => `  ${head}-live${year}:
    name: ${head} Live ${year}
    needs: verify
    steps:
      - uses: actions/checkout@v6

      - uses: actions/download-artifact@v8
        with:
          name: live${year}-out
          path: sites/hacklytics${year || 2027}/out

      - uses: deploy@v0
        with:
          target: live${year}
`;

const CI = `name: CI

jobs:
  verify:
    name: Verify
    steps:
      - uses: actions/checkout@v6

      - name: Upload live build
        uses: actions/upload-artifact@v7
        with:
          name: live-out
          path: sites/hacklytics2027/out

      - name: Upload live 2026 build
        uses: actions/upload-artifact@v7
        with:
          name: live2026-out
          path: sites/hacklytics2026/out

${job("", "preview")}
${job("", "deploy")}
${job(2026, "preview")}
${job(2026, "deploy")}`;

describe("firebase.json", () => {
  it("finds the target that serves the latest edition, before and after the edit", () => {
    expect(liveTargetOf(FIREBASE, handover)).toBe("live");
    expect(liveTargetOf(wireFirebaseJson(FIREBASE, handover), handover)).toBe(
      "live",
    );
  });

  it("points the live entry at the new edition and archives the old one as it was", () => {
    const wired = JSON.parse(wireFirebaseJson(FIREBASE, handover));
    const before = JSON.parse(FIREBASE);
    expect(
      wired.hosting.map((entry: { target?: string }) => entry.target),
    ).toEqual([undefined, "live", "live2027", "live2026"]);
    expect(wired.hosting[1]).toEqual({
      ...before.hosting[1],
      public: "sites/hacklytics2028/out",
    });
    expect(wired.hosting[2]).toEqual({
      ...before.hosting[1],
      target: "live2027",
    });
  });

  it("changes nothing when it is already wired", () => {
    const once = wireFirebaseJson(FIREBASE, handover);
    expect(wireFirebaseJson(once, handover)).toBe(once);
  });

  it("says so when it cannot find the live edition", () => {
    expect(() =>
      wireFirebaseJson(FIREBASE, { prev: 2030, next: 2031 }),
    ).toThrow(/sites\/hacklytics2030\//);
  });
});

describe(".firebaserc", () => {
  it("maps the archive target to a placeholder site id beside the live target", () => {
    const wired = JSON.parse(wireFirebaseRc(RC, handover, "live"));
    expect(Object.entries(wired.targets.proj.hosting)).toEqual([
      ["live", ["site-2027"]],
      ["live2027", [archiveSiteId("live", 2027)]],
      ["live2026", ["site-2026"]],
    ]);
  });

  it("keeps an id that is already set, and names the project that owns the target", () => {
    const set = wireFirebaseRc(RC, handover, "live").replace(
      "live2027-archive",
      "chosen",
    );
    expect(wireFirebaseRc(set, handover, "live")).toBe(set);
    expect(firebaseProjectOf(RC, "live")).toBe("proj");
  });
});

describe("ci.yml", () => {
  const wired = wireCi(CI, handover, "live");

  it("builds the new edition on the live jobs and keeps the archives where they were", () => {
    expect(wired).toContain("path: sites/hacklytics2028/out");
    expect(wired).not.toContain(
      "name: live-out\n          path: sites/hacklytics2027/out",
    );
    expect(wired).toContain(
      "name: live2026-out\n          path: sites/hacklytics2026/out",
    );
  });

  it("gives the old edition an upload step and preview and deploy jobs of its own", () => {
    expect(wired).toContain("      - name: Upload live 2027 build");
    expect(wired).toContain(
      "name: live2027-out\n          path: sites/hacklytics2027/out",
    );
    for (const head of ["preview", "deploy"]) {
      expect(wired).toContain(
        `  ${head}-live2027:\n    name: ${head} Live 2027`,
      );
      expect(wired).toContain(
        `  ${head}-live2026:\n    name: ${head} Live 2026`,
      );
    }
    expect(wired).toContain("          target: live2027\n");
  });

  it("puts the archives newest first, after the live jobs", () => {
    const order = [
      "  deploy-live:",
      "  preview-live2027:",
      "  deploy-live2027:",
      "  preview-live2026:",
    ];
    const positions = order.map((header) => wired.indexOf(header));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position > 0)).toBe(true);
  });

  it("changes nothing when it is already wired", () => {
    expect(wireCi(wired, handover, "live")).toBe(wired);
  });

  it("adds no archive jobs when the file has none to copy", () => {
    const withoutArchives = CI.slice(0, CI.indexOf("  preview-live2026:"));
    const wiredWithout = wireCi(withoutArchives, handover, "live");
    expect(wiredWithout).not.toMatch(/preview-live\d{4}:/);
    expect(wireCi(wiredWithout, handover, "live")).toBe(wiredWithout);
  });
});

describe("the repo's own deploy files", () => {
  const root = new URL("../../../", import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, root), "utf8");
  const years = listEditions(fileURLToPath(root));
  const next = { prev: Math.max(...years), next: Math.max(...years) + 1 };

  it("can be wired for the next edition, and then again with no further change", () => {
    const live = liveTargetOf(read("firebase.json"), next);
    const files = {
      "firebase.json": wireFirebaseJson(read("firebase.json"), next),
      ".firebaserc": wireFirebaseRc(read(".firebaserc"), next, live),
      ".github/workflows/ci.yml": wireCi(
        read(".github/workflows/ci.yml"),
        next,
        live,
      ),
    };
    expect(wireFirebaseJson(files["firebase.json"], next)).toBe(
      files["firebase.json"],
    );
    expect(wireFirebaseRc(files[".firebaserc"], next, live)).toBe(
      files[".firebaserc"],
    );
    expect(wireCi(files[".github/workflows/ci.yml"], next, live)).toBe(
      files[".github/workflows/ci.yml"],
    );
    expect(files[".github/workflows/ci.yml"]).toContain(
      `hacklytics${next.next}/out`,
    );
  });
});
