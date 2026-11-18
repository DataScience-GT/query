/**
 * `turbo gen hacklytics`: a complete, buildable site for a new Hacklytics
 * edition on the event kit, with its deploy wired. The latest edition is the
 * source of every default (see editions.ts), so the generator holds no venue,
 * link, clock time or target name of its own.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlopTypes } from "@turbo/gen";

import type { Edition } from "./editions";
import type { Answers, Plan } from "./plan";
import type { Handover } from "./wiring";
import { patternOf } from "./dates";
import { listEditions, loadEdition } from "./editions";
import { editionDirName, SITES_DIR } from "./paths";
import {
  buildPlan,
  validateEnd,
  validateStart,
  validateTheme,
  validateYear,
} from "./plan";
import {
  archiveSiteId,
  archiveTarget,
  firebaseProjectOf,
  liveTargetOf,
  wireCi,
  wireFirebaseJson,
  wireFirebaseRc,
} from "./wiring";

const FIREBASE_JSON = "firebase.json";
const FIREBASE_RC = ".firebaserc";
const CI = ".github/workflows/ci.yml";

type State = Answers &
  Plan & {
    handover: Handover;
    live: string;
    firebaseProject: string;
  };

const TEMPLATES = "templates/hacklytics";
const SITE_FILES: [path: string, template: string][] = [
  ["astro.config.mjs", "astro.config.mjs.hbs"],
  ["tsconfig.json", "tsconfig.json.hbs"],
  ["turbo.json", "turbo.json.hbs"],
  ["oxlint.config.mts", "oxlint.config.mts.hbs"],
  [".gitignore", "gitignore.hbs"],
  ["README.md", "README.md.hbs"],
  ["src/event.config.ts", "event.config.ts.hbs"],
  ["src/layouts/Layout.astro", "Layout.astro.hbs"],
  ["src/pages/index.astro", "index.astro.hbs"],
  ["src/pages/404.astro", "404.astro.hbs"],
];

export function registerHacklytics(plop: PlopTypes.NodePlopAPI): void {
  const root = () => plop.getDestBasePath();
  const read = (file: string) => readFileSync(join(root(), file), "utf8");

  let loading: Promise<Edition> | undefined;
  const latest = () => {
    const years = listEditions(root());
    if (years.length === 0)
      throw new Error("There is no sites/hacklytics<year> to start from.");
    loading ??= loadEdition(root(), Math.max(...years));
    return loading;
  };

  plop.setGenerator("hacklytics", {
    description:
      "Create a Hacklytics edition site on the event kit and wire its deploy (firebase.json, .firebaserc, ci.yml)",
    prompts: [
      {
        type: "input",
        name: "year",
        message: "Year of the new edition",
        default: () => String(Math.max(...listEditions(root())) + 1),
        validate: (value: string) =>
          validateYear(value.trim(), listEditions(root())),
        filter: (value: string) => value.trim(),
      },
      {
        type: "input",
        name: "theme",
        message: "Theme name",
        validate: (value: string) => validateTheme(value),
        filter: (value: string) => value.trim(),
      },
      {
        type: "input",
        name: "start",
        message: "Start date, when check-in opens (YYYY-MM-DD)",
        validate: (value: string, answers?: Partial<Answers>) =>
          validateStart(value.trim(), answers?.year ?? ""),
        filter: (value: string) => value.trim(),
      },
      {
        type: "input",
        name: "end",
        message: "End date, when the weekend closes (YYYY-MM-DD)",
        validate: async (value: string, answers?: Partial<Answers>) => {
          const edition = await latest();
          return validateEnd(
            value.trim(),
            answers?.start ?? "",
            patternOf(edition.core, edition.timeZone),
            edition.timeZone,
          );
        },
        filter: (value: string) => value.trim(),
      },
      {
        type: "confirm",
        name: "copyTheme",
        message: "Copy the theme (CSS and fonts) from the latest edition?",
        default: true,
      },
    ],
    actions: [
      async (rawAnswers) => {
        const state = rawAnswers as State;
        const edition = await latest();
        const plan = buildPlan(state, {
          latest: edition,
          existing: listEditions(root()),
          themeCss: read(`${edition.dir}/src/styles/globals.css`),
          packageJson: read(`${edition.dir}/package.json`),
        });
        for (const [source] of plan.copies) {
          if (!existsSync(join(root(), plan.latestDir, source))) {
            throw new Error(
              `${plan.latestDir}/${source} does not exist, and a new site needs it`,
            );
          }
        }
        Object.assign(state, plan);
        state.handover = { prev: plan.prev, next: plan.year };
        state.live = liveTargetOf(read(FIREBASE_JSON), state.handover);
        state.firebaseProject = firebaseProjectOf(
          read(FIREBASE_RC),
          state.live,
        );
        return `Planned ${plan.siteName} from ${plan.latestDir}`;
      },

      // The deploy wiring goes first. Each edit is a no-op once made, so a run
      // that stops after it can be repeated, and the site directory (which
      // later runs count editions by) is created last.
      {
        type: "modify",
        path: FIREBASE_JSON,
        transform: (content, state) =>
          wireFirebaseJson(content, (state as State).handover),
      },
      {
        type: "modify",
        path: FIREBASE_RC,
        transform: (content, state) =>
          wireFirebaseRc(
            content,
            (state as State).handover,
            (state as State).live,
          ),
      },
      {
        type: "modify",
        path: CI,
        transform: (content, state) =>
          wireCi(content, (state as State).handover, (state as State).live),
      },

      ...SITE_FILES.map(([path, template]): PlopTypes.ActionType => ({
        type: "add",
        path: `${SITES_DIR}/{{ siteName }}/${path}`,
        templateFile: `${TEMPLATES}/${template}`,
      })),
      {
        type: "add",
        path: `${SITES_DIR}/{{ siteName }}/package.json`,
        template: "{{{ packageJson }}}",
      },
      {
        type: "add",
        path: `${SITES_DIR}/{{ siteName }}/src/styles/globals.css`,
        template: "{{{ themeCss }}}",
      },

      (rawAnswers) => {
        const state = rawAnswers as State;
        const from = join(root(), state.latestDir);
        const to = join(root(), SITES_DIR, state.siteName);
        for (const [source, target] of state.copies) {
          cpSync(join(from, source), join(to, target), { recursive: true });
        }
        const worker = join(to, "public/sw.js");
        writeFileSync(
          worker,
          readFileSync(worker, "utf8").replace(
            /^\/\/ Service Worker for .*$/m,
            `// Service Worker for ${state.heading}`,
          ),
        );
        return `Copied ${state.copies.length} files from ${state.latestDir}`;
      },

      (rawAnswers) => {
        const { siteName } = rawAnswers as State;
        execSync("pnpm install --no-frozen-lockfile", {
          stdio: "inherit",
          cwd: root(),
        });
        execSync(
          `pnpm prettier --write ${SITES_DIR}/${siteName}/src/event.config.ts ${SITES_DIR}/${siteName}/package.json`,
          { stdio: "inherit", cwd: root() },
        );
        return `Installed ${siteName}`;
      },

      (rawAnswers) => {
        const state = rawAnswers as State;
        const { prev, year, live, firebaseProject } = state;
        return [
          `Created ${SITES_DIR}/${editionDirName(year)}. Next: edit src/event.config.ts and src/styles/globals.css.`,
          `${archiveTarget(live, prev)} now serves the ${prev} edition and ${live} serves ${year}.`,
          `One step is yours: create the Firebase Hosting site "${archiveSiteId(live, prev)}" in the console (project ${firebaseProject}, Hosting, Add another site). Or put the id of an existing site in .firebaserc under ${archiveTarget(live, prev)}. The deploy-${archiveTarget(live, prev)} job fails on main until that site exists.`,
        ].join("\n");
      },
    ],
  });
}
