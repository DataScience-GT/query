/**
 * Everything the generator decides, computed before it touches a file. The
 * inputs are the answers, the latest edition as loaded through the kit, and
 * the text of the files the edition's theme and package come from. The
 * output is plain data the templates render, so a bad answer fails here, with
 * nothing written.
 */
import type { Moments, SchedulePattern } from "./dates";
import type { Edition, EventCore } from "./editions";
import {
  applyPattern,
  boardTime,
  daysBetween,
  parseDay,
  patternOf,
  sameMomentInYear,
  yearOfIso,
} from "./dates";
import { editionDirName } from "./paths";
import { declaredValue, extractTheme, NEUTRAL, neutralTheme } from "./theme";

export interface Answers {
  year: string;
  theme: string;
  start: string;
  end: string;
  copyTheme: boolean;
}

/** Where a site keeps its fonts: the files, the CSS that declares them, and the preload list. */
const FONT_FILES = [
  "public/fonts",
  "src/styles/fonts.generated.css",
  "src/lib/fonts.generated.ts",
] as const;

/** `package.json` entries tied to `scripts/capture-vision.mts`, which a new site does not get. */
const NOT_CARRIED = {
  scripts: ["vision"],
  devDependencies: ["playwright"],
} as const;

/** Core fields the answers decide. Everything else in the core is carried over as it is. */
const ANSWERED = ["year", "theme", "start", "end", "hacking"] as const;

/** Copy this generator writes new for each edition. Every other `seo` field is carried over. */
const NEW_SEO = [
  "description",
  "shareDescription",
  "summary",
  "eventDescription",
] as const;

export interface Inputs {
  latest: Edition;
  existing: number[];
  /** The latest edition's `src/styles/globals.css`. */
  themeCss: string;
  /** The latest edition's `package.json`. */
  packageJson: string;
}

export function validateYear(value: string, existing: number[]): true | string {
  if (!/^\d{4}$/.test(value)) return "Use four digits, like 2028.";
  const latest = Math.max(...existing);
  if (Number(value) <= latest) {
    return `${value} must be greater than the latest edition, ${latest}. Existing: ${existing.join(", ")}.`;
  }
  return true;
}

export function validateTheme(value: string): true | string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 60 || /\p{Cc}/u.test(trimmed)) {
    return "Give the theme a name of up to 60 characters.";
  }
  return true;
}

function dayOrMessage(value: string, what: string) {
  const day = parseDay(value);
  return day ?? `${what} must be a real date written YYYY-MM-DD.`;
}

export function validateStart(value: string, year: string): true | string {
  const day = dayOrMessage(value, "The start date");
  if (typeof day === "string") return day;
  if (String(day.year) !== year) return `The start date must be in ${year}.`;
  return true;
}

/** Lays the latest edition's clock times onto the dates, and checks they make a coherent weekend. */
export function momentsFor(
  pattern: SchedulePattern,
  start: string,
  end: string,
  timeZone: string,
): Moments | string {
  const startDay = parseDay(start);
  const endDay = parseDay(end);
  if (!startDay || !endDay) return "Dates are written YYYY-MM-DD.";
  if (daysBetween(startDay, endDay) < 0)
    return "The end date is before the start date.";
  const moments = applyPattern(pattern, startDay, endDay, timeZone);
  const ms = (iso: string) => Date.parse(iso);
  const inOrder =
    ms(moments.start) <= ms(moments.hacking.start) &&
    ms(moments.hacking.start) < ms(moments.hacking.end) &&
    ms(moments.hacking.end) <= ms(moments.end);
  if (!inOrder) {
    return `With the latest edition's times, the weekend would not run in order (${moments.start} to ${moments.end}). Pick a later end date.`;
  }
  return moments;
}

export function validateEnd(
  value: string,
  start: string,
  pattern: SchedulePattern,
  timeZone: string,
): true | string {
  const day = dayOrMessage(value, "The end date");
  if (typeof day === "string") return day;
  const moments = momentsFor(pattern, start, value, timeZone);
  return typeof moments === "string" ? moments : true;
}

/** A JS object literal body: the properties of `value`, without the braces. */
const propertiesOf = (value: Record<string, unknown>) => {
  const text = JSON.stringify(value, null, 2);
  return text.slice(text.indexOf("\n") + 1, text.lastIndexOf("\n"));
};

interface BoardRow {
  /** Source of a template literal, so the weekday follows the dates. */
  when: string;
  event: string;
  accent: boolean;
}

export interface Plan {
  year: number;
  prev: number;
  siteName: string;
  /** "Hacklytics 2099, Neon Dawn": the edition as a heading. */
  heading: string;
  themeName: string;
  /** Public path of the share image the edition starts with. */
  shareImage: string;
  copyTheme: boolean;
  latestDir: string;
  /** `src/event.config.ts` properties carried over or computed, as source. */
  core: string;
  carried: string;
  seo: string;
  board: BoardRow[];
  /** Site files whose text is computed here rather than rendered from a template. */
  packageJson: string;
  themeCss: string;
  /** Files copied byte for byte from the latest site: `[from, to]`, both relative to a site. */
  copies: [string, string][];
}

export function buildPlan(answers: Answers, inputs: Inputs): Plan {
  const { latest, existing } = inputs;
  const year = Number(answers.year);
  const checks = [
    validateYear(answers.year, existing),
    validateTheme(answers.theme),
  ];
  const failed = checks.find((check) => check !== true);
  if (typeof failed === "string") throw new Error(failed);

  const startOk = validateStart(answers.start, answers.year);
  if (startOk !== true) throw new Error(startOk);

  const { timeZone } = latest;
  const pattern = patternOf(latest.core, timeZone);
  const moments = momentsFor(pattern, answers.start, answers.end, timeZone);
  if (typeof moments === "string") throw new Error(moments);

  const themeName = answers.theme.trim();
  const core = structuredClone(latest.core) as EventCore;
  core.year = year;
  core.theme.name = themeName;
  if (!answers.copyTheme)
    core.theme.ground = {
      light: NEUTRAL.light["--ground"],
      dark: NEUTRAL.dark["--ground"],
    };
  core.start = moments.start;
  core.end = moments.end;
  core.hacking = moments.hacking;
  core.registration.validFrom = sameMomentInYear(
    latest.core.registration.validFrom,
    yearOfIso(latest.core.registration.validFrom, timeZone) +
      (year - latest.year),
    timeZone,
  );

  const carriedKeys = Object.keys(core).filter(
    (key) => !(ANSWERED as readonly string[]).includes(key),
  );
  const seo = Object.fromEntries(
    Object.entries(latest.seo).filter(
      ([key]) => !(NEW_SEO as readonly string[]).includes(key),
    ),
  );

  const startDay = parseDay(answers.start)!;
  const endDay = parseDay(answers.end)!;
  const lastDay = daysBetween(startDay, endDay);
  const rowAt = (
    index: number,
    clock: string,
    event: string,
    accent = false,
  ): BoardRow => ({
    when: `\${dates.days[${index}].key} ${boardTime(clock)}`,
    event,
    accent,
  });
  const board = [
    rowAt(0, pattern.start, "Check-in opens"),
    rowAt(
      pattern.hackStart.days,
      pattern.hackStart.clock,
      "Hacking begins",
      true,
    ),
    rowAt(
      lastDay + pattern.hackEnd.days,
      pattern.hackEnd.clock,
      "Hacking ends",
      true,
    ),
    rowAt(lastDay, pattern.end, "Closing ceremony"),
  ];

  const siteName = editionDirName(year);
  // The files the kit's components link to by path, which the site must serve.
  const copies: [string, string][] = latest.kit.publicFiles.map((file) => [
    `public${file}`,
    `public${file}`,
  ]);
  const image = latest.seo.image;
  if (typeof image === "string")
    copies.push([`public${image}`, `public${image}`]);
  if (answers.copyTheme) {
    for (const path of FONT_FILES) copies.push([path, path]);
  }

  return {
    year,
    prev: latest.year,
    siteName,
    heading: `${core.brand} ${year}, ${themeName}`,
    themeName,
    shareImage: typeof image === "string" ? image : "",
    copyTheme: answers.copyTheme,
    latestDir: latest.dir,
    core: propertiesOf(core),
    carried: carriedKeys.join(", "),
    seo: propertiesOf(seo),
    board,
    packageJson: carryPackageJson(inputs.packageJson, siteName),
    themeCss: answers.copyTheme
      ? `${themeHeader(themeName, latest.dir)}\n\n${extractTheme(inputs.themeCss)}\n`
      : `${neutralTheme(latest.kit.themeTokens, (token) => declaredValue(inputs.themeCss, token))}\n`,
    copies,
  };
}

function themeHeader(themeName: string, from: string): string {
  const safe = themeName.replaceAll("*/", "* /");
  return `/* styles/globals.css, ${safe}. The palette and fonts the event kit's
   components read (docs/sites/event-kit.md lists them), copied from ${from}.
   TODO: choose this edition's palette. --ground must equal theme.ground in
   src/event.config.ts for each scheme, and each text and UI pair should clear
   WCAG AA on its ground. */`;
}

function carryPackageJson(text: string, name: string): string {
  const pkg = JSON.parse(text) as Record<
    string,
    Record<string, string> | string
  >;
  pkg.name = name;
  for (const [section, entries] of Object.entries(NOT_CARRIED)) {
    const table = pkg[section] as Record<string, string> | undefined;
    for (const entry of entries) if (table) delete table[entry];
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
