import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

// Lets any agent see and use the site, whichever model is behind it: plain
// arguments in, one JSON object on stdout, and the page as both screenshots
// and an accessibility tree, so a model without vision can read it too. The
// .mts extension makes it a module on Node's type stripping (22.18+), with no
// build step.

const HELP = `Drive the site in a real browser and report what happened as JSON.

Usage:
  node sites/hacklytics2027/scripts/capture-vision.mts [options] [steps...]

Options:
  --url <url>     Page to open (default http://localhost:3000)
  --size <WxH>    Viewport (default 1440x900; a phone is 390x844)
  --theme <name>  light or dark (default dark)
  --out <dir>     Screenshot folder (default test-results/vision in the site)
  --help          Show this

Steps run in order and stop at the first failure. With none, it takes one
screenshot. Selectors are Playwright's, and act on the first visible match:
#faqs, text=Schedule, role=link[name="Schedule"].

  click:<selector>   Click
  hover:<selector>   Hover
  press:<key>        Press a key, like Escape or Tab
  scroll:<selector>  Scroll to an element
  goto:<path>        Open a path or URL, like /nope
  wait:<ms>          Wait
  shot:<name>        Screenshot the viewport
  full:<name>        Screenshot the whole page, after scrolling through it so
                     everything that waits to be seen has started

Output on stdout: { ok, url, title, steps, screenshots, consoleErrors,
pageErrors, accessibility, error }. accessibility is the final page as a YAML
tree of roles and names, ready to turn into role= selectors.

Exit code: 0 when every step passed, 1 when one failed or the page would not
load, 2 for bad arguments.

Example, open the phone menu and go to the FAQ:
  node sites/hacklytics2027/scripts/capture-vision.mts --size 390x844 \\
    'click:role=button[name="Toggle menu"]' shot:menu \\
    'click:#mobile-menu >> text=FAQ' shot:faq
`;

/** Long enough for hover states, the menu and scroll-into-view to finish. */
const SETTLE_MS = 400;
/** The hero bed's bloom wave plays for about 2.4s after load. */
const LOAD_SETTLE_MS = 2500;
const STEP_TIMEOUT_MS = 5000;
const LOAD_TIMEOUT_MS = 30000;

const usage = (message: string): never => {
  console.error(`${message}\n\nRun with --help for usage.`);
  process.exit(2);
};

const parse = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        url: { type: "string", default: "http://localhost:3000" },
        size: { type: "string", default: "1440x900" },
        theme: { type: "string", default: "dark" },
        out: {
          type: "string",
          default: path.join(import.meta.dirname, "..", "test-results", "vision"),
        },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
};

const { values, positionals } = parse();

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const [width, height] = values.size.split("x").map(Number);
if (!width || !height) usage(`--size wants WxH, got "${values.size}"`);
if (values.theme !== "light" && values.theme !== "dark") {
  usage(`--theme wants light or dark, got "${values.theme}"`);
}

const VERBS = ["click", "hover", "press", "scroll", "goto", "wait", "shot", "full"];
const steps = positionals.length ? positionals : ["shot:page"];
for (const step of steps) {
  if (!VERBS.includes(step.split(":")[0])) usage(`Unknown step "${step}"`);
}

const report = {
  ok: false,
  url: values.url,
  title: "",
  steps: [] as { step: string; ok: boolean; error?: string }[],
  screenshots: [] as string[],
  consoleErrors: [] as string[],
  pageErrors: [] as string[],
  accessibility: "",
  error: undefined as string | undefined,
};

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0];

const browser = await chromium
  .launch()
  .catch((error: unknown) => {
    report.error = `${message(error)} (try: pnpm --filter hacklytics2027 exec playwright install chromium)`;
    return null;
  });

if (browser) {
  try {
    // No service worker: a cached page would hide the change being tested.
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: values.theme as "light" | "dark",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.on("console", (entry) => {
      if (entry.type() === "error") report.consoleErrors.push(entry.text());
    });
    page.on("pageerror", (error) => report.pageErrors.push(error.message));

    mkdirSync(values.out, { recursive: true });
    const load = (url: string) =>
      page.goto(url, { waitUntil: "networkidle", timeout: LOAD_TIMEOUT_MS });
    const visible = (selector: string) =>
      page.locator(selector).locator("visible=true").first();
    const shoot = async (name: string, fullPage: boolean) => {
      const count = String(report.screenshots.length + 1).padStart(2, "0");
      const file = path.resolve(values.out, `${count}-${name || "page"}.png`);
      await page.screenshot({ path: file, fullPage });
      report.screenshots.push(file);
    };
    // Nav links scroll smoothly, for longer than any fixed wait on a long page.
    const settle = async () => {
      await page.waitForTimeout(SETTLE_MS);
      let last = -1;
      for (let i = 0; i < 50; i++) {
        const y = await page.evaluate(() => window.scrollY);
        if (y === last) return;
        last = y;
        await page.waitForTimeout(100);
      }
    };
    const scrollThrough = async () => {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let top = 0; top < total; top += height) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(SETTLE_MS * 4);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(SETTLE_MS);
    };
    // A full-page capture loses elements held in place by finished CSS
    // animations, and the page stays wrong afterwards: 7 flowers in bloom came
    // out as 3. Under reduced motion the site draws the same end state with no
    // animation, so there is nothing for the capture to disturb.
    const shootFull = async (name: string) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(SETTLE_MS);
      await shoot(name, true);
      // Turning motion back on plays the bloom again from the start.
      await page.emulateMedia({ reducedMotion: null });
      await page.waitForTimeout(LOAD_SETTLE_MS);
    };

    const run = async (step: string) => {
      const [verb, ...rest] = step.split(":");
      const arg = rest.join(":");
      switch (verb) {
        case "click":
          await visible(arg).click();
          break;
        case "hover":
          await visible(arg).hover();
          break;
        case "press":
          await page.keyboard.press(arg);
          break;
        case "scroll":
          await visible(arg).evaluate((el) =>
            el.scrollIntoView({ behavior: "instant", block: "start" }),
          );
          break;
        case "goto":
          await load(new URL(arg, page.url()).href);
          return;
        case "wait":
          await page.waitForTimeout(Number(arg));
          return;
        case "shot":
          return shoot(arg, false);
        case "full":
          await scrollThrough();
          return shootFull(arg);
      }
      await settle();
    };

    await load(values.url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(LOAD_SETTLE_MS);

    for (const step of steps) {
      try {
        await run(step);
        report.steps.push({ step, ok: true });
      } catch (error) {
        report.steps.push({ step, ok: false, error: message(error) });
        report.error = `Step failed: ${step}`;
        break;
      }
    }

    report.url = page.url();
    report.title = await page.title();
    report.accessibility = await page.locator("body").ariaSnapshot();
    report.ok = !report.error;
  } catch (error) {
    report.error = message(error);
  } finally {
    await browser.close();
  }
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
