import { normalizeLabel, sameLabel } from "./scope";

// Reads Devpost's "submissions" export. Pure: the file arrives as text, and
// what comes out is a list of projects ready to insert plus everything that
// was left out and why. Nothing here touches the database.
//
// The export has one row per (project, opt-in prize), so a project entered
// for three prizes appears three times. Rows are grouped by submission URL,
// and the copies must agree on who made the project and what it is, or the
// project is held back rather than guessed at.

/** The file itself cannot be used: not CSV, a missing column, no projects. */
export class DevpostFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevpostFileError";
  }
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180)

/**
 * Splits CSV text into rows of cells. Handles a leading byte-order mark,
 * quoted cells holding commas, line breaks and doubled quotes, and CRLF, LF
 * or bare CR line endings. Rows with nothing in them are dropped. A quote
 * that is never closed makes the whole file unreadable, since everything
 * after it would be read into one cell.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(cell);
    // A blank line, or a line of bare commas a spreadsheet left behind, is
    // not a row.
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    cell = "";
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += ch;
      }
      i += 1;
      continue;
    }

    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      // A stray quote inside an unquoted cell is kept as text, the way
      // spreadsheet programs read it.
      cell += ch;
    }
    i += 1;
  }

  if (quoted) {
    throw new DevpostFileError(
      "The file is not valid CSV: a quoted cell is never closed. Export it from Devpost again and upload that file unchanged.",
    );
  }
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

// ---------------------------------------------------------------------------
// Devpost export

const COLUMNS = {
  title: "Project Title",
  url: "Submission Url",
  status: "Project Status",
  createdAt: "Project Created At",
  submittedAt: "Project Submitted At",
  firstName: "Submitter First Name",
  lastName: "Submitter Last Name",
  email: "Submitter Email",
  teammates: "Additional Team Member Count",
  about: "About The Project",
  prize: "Opt-In Prize",
  tryItOut: '"Try it out" Links',
  builtWith: "Built With",
  video: "Video Demo Link",
  universities: "Team Colleges/Universities",
} as const;

const REQUIRED = [
  COLUMNS.title,
  COLUMNS.url,
  COLUMNS.status,
  COLUMNS.createdAt,
  COLUMNS.submittedAt,
  COLUMNS.firstName,
  COLUMNS.lastName,
  COLUMNS.email,
  COLUMNS.teammates,
] as const;

// Older exports name the universities column after the registration question.
const LONG_UNIVERSITIES_PREFIX = "list all of the universities";

/** Devpost allows teams of four: the submitter and three more. */
export const MAX_ADDITIONAL_MEMBERS = 3;

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 50_000;
const MAX_NAME = 255;
const MAX_EMAIL = 320;
const MAX_LABEL = 255;

export type DevpostMember = { name: string; email: string; order: number };

export type DevpostProject = {
  submissionUrl: string;
  title: string;
  description: string;
  demoLinks: string[];
  videoUrl: string | null;
  technologies: string[];
  universities: string[];
  /** Opt-in prize labels across every row of the project, deduplicated. */
  prizeCategories: string[];
  participantCount: number;
  /** Submitter first, then teammates in column order. */
  members: DevpostMember[];
  projectCreatedAt: Date | null;
  submittedAt: Date | null;
};

export type DevpostRejection = { project: string; reason: string };

export type DevpostImport = {
  projects: DevpostProject[];
  /** Every prize label any accepted project opted into, deduplicated. */
  labels: string[];
  rejected: DevpostRejection[];
  /** Projects only ever seen as drafts. */
  drafts: number;
  /** Extra rows folded into a project already seen. */
  collapsedRows: number;
};

// Header text is matched loosely: Devpost has changed capitalisation and the
// quoting around "Try it out" between exports.
const headerKey = (header: string) =>
  header.replace(/"/g, "").trim().replace(/\s+/g, " ").toLowerCase();

const clean = (value: string | undefined) => (value ?? "").trim();

/**
 * An http(s) URL in one canonical spelling, or null for anything else.
 * Demo and video links become public hrefs, so `javascript:` and friends
 * never get through.
 */
export function httpUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  return url.toString();
}

/**
 * The key a submission is grouped and matched by. A trailing slash is the
 * same project, and re-imports must find the rows earlier imports wrote.
 */
export function submissionKey(raw: string): string | null {
  const url = httpUrl(raw);
  if (!url) return null;
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

/** Splits a list cell on semicolons, commas and line breaks. */
export function splitList(value: string | undefined): string[] {
  const seen = new Set<string>();
  for (const item of clean(value).split(/[;,\r\n]+/)) {
    const trimmed = item.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

const DATE_YMD =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i;
const DATE_MDY =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i;

function offsetMinutes(zone: string | undefined): number {
  if (!zone || /^(Z|UTC|GMT)$/i.test(zone)) return 0;
  const digits = zone.replace(":", "");
  const sign = digits.startsWith("-") ? -1 : 1;
  return sign * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
}

function utc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  zone: string | undefined,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    offsetMinutes(zone) * 60_000;
  return new Date(ms);
}

/**
 * A Devpost timestamp. A time written without a zone is read as UTC, so one
 * file always gives the same instants whatever the server's zone. Null when
 * blank or unreadable: the dates only order projects, and losing one should
 * not keep a project out of judging.
 */
export function parseDevpostDate(value: string | undefined): Date | null {
  const text = clean(value);
  if (!text) return null;

  const ymd = DATE_YMD.exec(text);
  if (ymd) {
    return utc(
      Number(ymd[1]),
      Number(ymd[2]),
      Number(ymd[3]),
      Number(ymd[4]),
      Number(ymd[5]),
      Number(ymd[6] ?? 0),
      ymd[7],
    );
  }

  const mdy = DATE_MDY.exec(text);
  if (mdy) {
    let hour = Number(mdy[4]);
    const meridiem = mdy[7]?.toUpperCase();
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    }
    return utc(
      Number(mdy[3]),
      Number(mdy[1]),
      Number(mdy[2]),
      hour,
      Number(mdy[5]),
      Number(mdy[6] ?? 0),
      mdy[8],
    );
  }

  // ISO strings with an explicit zone, mostly.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A problem with one project. Caught per project and reported. */
class ProjectProblem extends Error {}

function bounded(value: string, max: number, what: string): string {
  if (value.length > max) {
    throw new ProjectProblem(`${what} is longer than ${max} characters.`);
  }
  return value;
}

function email(value: string, what: string): string {
  bounded(value, MAX_EMAIL, what);
  if (!EMAIL.test(value)) {
    throw new ProjectProblem(`${what} "${value}" is not an email address.`);
  }
  return value.toLowerCase();
}

type Row = { cells: string[]; line: number };

/**
 * Turns the export's text into projects. Throws DevpostFileError when the
 * file as a whole is unusable; a bad project is skipped and listed in
 * `rejected` instead.
 */
export function readDevpostExport(text: string): DevpostImport {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) {
    throw new DevpostFileError(
      "The file is empty. Export the submissions CSV from Devpost and upload it here.",
    );
  }

  const index = new Map<string, number>();
  header.forEach((name, i) => {
    const key = headerKey(name);
    if (!index.has(key)) index.set(key, i);
  });

  const missing = REQUIRED.filter((name) => !index.has(headerKey(name)));
  if (missing.length > 0) {
    throw new DevpostFileError(
      `This is not a Devpost submissions export: it has no ${missing.join(", ")} column${missing.length === 1 ? "" : "s"}. In Devpost, use Manage hackathon, Metrics, Export submissions.`,
    );
  }
  if (rows.length === 1) {
    throw new DevpostFileError(
      "The file has column headings but no projects under them.",
    );
  }

  const universitiesAt =
    index.get(headerKey(COLUMNS.universities)) ??
    header.findIndex((name) =>
      headerKey(name).startsWith(LONG_UNIVERSITIES_PREFIX),
    );
  const teammatesAt = index.get(headerKey(COLUMNS.teammates))!;

  const at = (row: string[], column: string) => {
    const i = index.get(headerKey(column));
    return i === undefined ? "" : clean(row[i]);
  };

  // Teammate cells come in (first name, last name, email) triples straight
  // after the count. Reads as many triples as the row's own count says.
  const teamCells = (row: string[]) => {
    const count = Number(clean(row[teammatesAt]) || "0");
    const triples =
      Number.isInteger(count) && count >= 0 && count <= 99 ? count : 0;
    return Array.from({ length: triples * 3 }, (_, k) =>
      clean(row[teammatesAt + 1 + k]),
    );
  };

  // What every row of one project must agree on.
  const identity = (row: string[]) =>
    JSON.stringify([
      at(row, COLUMNS.title),
      at(row, COLUMNS.about),
      at(row, COLUMNS.firstName),
      at(row, COLUMNS.lastName),
      at(row, COLUMNS.email).toLowerCase(),
      clean(row[teammatesAt]),
      ...teamCells(row),
    ]);

  const groups = new Map<string, Row[]>();
  const draftKeys = new Set<string>();
  const rejected: DevpostRejection[] = [];
  let collapsedRows = 0;

  rows.slice(1).forEach((cells, offset) => {
    // Line numbers as a spreadsheet shows them: the header is line 1.
    const line = offset + 2;
    const title = at(cells, COLUMNS.title);
    const rawUrl = at(cells, COLUMNS.url);
    const key = rawUrl ? submissionKey(rawUrl) : null;

    if (!at(cells, COLUMNS.status).toLowerCase().startsWith("submitted")) {
      draftKeys.add(key ?? `line:${line}`);
      return;
    }
    if (!key) {
      rejected.push({
        project: title || `Line ${line}`,
        reason: rawUrl
          ? `Its submission URL "${rawUrl}" is not an http or https link.`
          : "It is marked submitted but has no submission URL.",
      });
      return;
    }

    const group = groups.get(key);
    if (group) {
      group.push({ cells, line });
      collapsedRows += 1;
    } else {
      groups.set(key, [{ cells, line }]);
    }
  });

  const projects: DevpostProject[] = [];
  for (const [submissionUrl, group] of groups) {
    const first = group[0]!.cells;
    const title = at(first, COLUMNS.title);
    try {
      projects.push(
        readProject(submissionUrl, group, {
          at,
          identity,
          teammatesAt,
          universitiesAt,
        }),
      );
    } catch (error) {
      if (!(error instanceof ProjectProblem)) throw error;
      rejected.push({ project: title || submissionUrl, reason: error.message });
    }
  }

  if (projects.length === 0) {
    const firstProblem = rejected[0];
    throw new DevpostFileError(
      firstProblem
        ? `None of the submitted projects in this file could be read. The first problem: ${firstProblem.project}: ${firstProblem.reason}`
        : "This file has no submitted projects, only drafts. Export again after the submission deadline.",
    );
  }

  const labels: string[] = [];
  for (const project of projects) {
    for (const label of project.prizeCategories) {
      if (!labels.some((known) => sameLabel(known, label))) labels.push(label);
    }
  }
  labels.sort((a, b) => a.localeCompare(b));

  return {
    projects,
    labels,
    rejected,
    drafts: [...draftKeys].filter((key) => !groups.has(key)).length,
    collapsedRows,
  };
}

function readProject(
  submissionUrl: string,
  group: Row[],
  read: {
    at: (row: string[], column: string) => string;
    identity: (row: string[]) => string;
    teammatesAt: number;
    universitiesAt: number;
  },
): DevpostProject {
  const { at, identity, teammatesAt, universitiesAt } = read;
  const first = group[0]!.cells;

  const title = bounded(at(first, COLUMNS.title), MAX_TITLE, "The title");
  if (!title) throw new ProjectProblem("It has no project title.");

  const signature = identity(first);
  const disagreeing = group.find((row) => identity(row.cells) !== signature);
  if (disagreeing) {
    throw new ProjectProblem(
      `Its rows disagree (lines ${group[0]!.line} and ${disagreeing.line} give a different title, description, submitter or team for the same URL). Fix the export and import again.`,
    );
  }

  const description = bounded(
    at(first, COLUMNS.about),
    MAX_DESCRIPTION,
    "The description",
  );

  const countCell = clean(first[teammatesAt]);
  const additional = Number(countCell || "0");
  if (!Number.isInteger(additional) || additional < 0) {
    throw new ProjectProblem(
      `Its Additional Team Member Count "${countCell}" is not a whole number.`,
    );
  }
  if (additional > MAX_ADDITIONAL_MEMBERS) {
    throw new ProjectProblem(
      `It lists ${additional} teammates besides the submitter; teams are at most ${MAX_ADDITIONAL_MEMBERS + 1} people.`,
    );
  }

  const submitterName = [at(first, COLUMNS.firstName), at(first, COLUMNS.lastName)]
    .filter(Boolean)
    .join(" ");
  const submitterEmail = at(first, COLUMNS.email);
  if (!submitterName || !submitterEmail) {
    throw new ProjectProblem("It is missing the submitter's name or email.");
  }

  const members: DevpostMember[] = [
    {
      name: bounded(submitterName, MAX_NAME, "The submitter's name"),
      email: email(submitterEmail, "The submitter's email"),
      order: 0,
    },
  ];
  for (let k = 0; k < additional; k += 1) {
    const start = teammatesAt + 1 + k * 3;
    const name = [clean(first[start]), clean(first[start + 1])]
      .filter(Boolean)
      .join(" ");
    const address = clean(first[start + 2]);
    // Devpost leaves the cells of a teammate who never accepted blank.
    if (!name && !address) continue;
    if (!name || !address) {
      throw new ProjectProblem(
        `Teammate ${k + 1} has ${name ? "a name but no email" : "an email but no name"}.`,
      );
    }
    members.push({
      name: bounded(name, MAX_NAME, `Teammate ${k + 1}'s name`),
      email: email(address, `Teammate ${k + 1}'s email`),
      order: members.length,
    });
  }

  const prizeCategories: string[] = [];
  for (const row of group) {
    const label = normalizeLabel(at(row.cells, COLUMNS.prize));
    if (!label) continue;
    bounded(label, MAX_LABEL, "An opt-in prize name");
    if (CONTROL.test(label)) {
      throw new ProjectProblem(
        "An opt-in prize name holds control characters.",
      );
    }
    if (!prizeCategories.some((known) => sameLabel(known, label))) {
      prizeCategories.push(label);
    }
  }
  prizeCategories.sort((a, b) => a.localeCompare(b));

  const demoLinks = [
    ...new Set(
      splitList(at(first, COLUMNS.tryItOut))
        .map(httpUrl)
        .filter((url): url is string => url !== null),
    ),
  ];
  const video = at(first, COLUMNS.video);

  return {
    submissionUrl,
    title,
    description,
    demoLinks,
    videoUrl: video ? httpUrl(video) : null,
    technologies: splitList(at(first, COLUMNS.builtWith)),
    universities:
      universitiesAt >= 0 ? splitList(first[universitiesAt]) : [],
    prizeCategories,
    participantCount: additional + 1,
    members,
    projectCreatedAt: parseDevpostDate(at(first, COLUMNS.createdAt)),
    submittedAt: parseDevpostDate(at(first, COLUMNS.submittedAt)),
  };
}
