/**
 * The deploy wiring a new edition needs, as small transforms from a file's
 * text to its new text. Each reads the file for what is already there (the
 * live target, the site directories, the latest archive's jobs) instead of
 * naming it, and each is a no-op when its edit is already in place, so a run
 * that stopped halfway can be run again.
 *
 * The model: one Firebase Hosting target serves the latest edition. Every
 * older edition keeps its own target, named after the live one plus its year.
 * Making a new edition live turns the previous live edition into an archive.
 */
import { SITES_DIR, editionDirName } from "./paths";

export interface Handover {
  /** The edition leaving the live target: the latest that exists. */
  prev: number;
  /** The edition being made live. */
  next: number;
}

interface HostingEntry {
  target?: string;
  site?: string;
  public?: string;
  [key: string]: unknown;
}

interface FirebaseJson {
  hosting: HostingEntry[];
  [key: string]: unknown;
}

const siteDir = (year: number) => `${SITES_DIR}/${editionDirName(year)}/`;
const servesEdition = (entry: HostingEntry, year: number) =>
  typeof entry.public === "string" && entry.public.startsWith(siteDir(year));

/** `firebase.json` and `.firebaserc` are written the way the repo already has them. */
const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The hosting target that serves the newest edition. Before the edit it serves
 * `prev`, after it serves `next`.
 */
export function liveTargetOf(firebaseJson: string, { prev, next }: Handover): string {
  const { hosting } = JSON.parse(firebaseJson) as FirebaseJson;
  const entry =
    hosting.find((candidate) => servesEdition(candidate, next)) ??
    hosting.find((candidate) => servesEdition(candidate, prev));
  if (!entry?.target) {
    throw new Error(
      `firebase.json has no hosting entry with a target whose public dir is under ${siteDir(prev)}`,
    );
  }
  return entry.target;
}

/** The target an edition keeps once it is no longer live. */
export const archiveTarget = (live: string, year: number) => `${live}${year}`;

/** The Hosting site id to create, or replace, for an archive target. */
export const archiveSiteId = (live: string, year: number) => `${archiveTarget(live, year)}-archive`;

/**
 * Points the live entry at `next`, and gives `prev` an archive entry that is a
 * copy of the live one as it stood, so its URLs, caching and headers behave as
 * they did while it was live.
 */
export function wireFirebaseJson(text: string, { prev, next }: Handover): string {
  const config = JSON.parse(text) as FirebaseJson;
  const live = liveTargetOf(text, { prev, next });
  const liveIndex = config.hosting.findIndex((entry) => entry.target === live);
  const entry = config.hosting[liveIndex];

  if (!servesEdition(entry, next)) {
    const archive: HostingEntry = {
      ...structuredClone(entry),
      target: archiveTarget(live, prev),
    };
    entry.public = entry.public!.replace(editionDirName(prev), editionDirName(next));
    config.hosting.splice(liveIndex + 1, 0, archive);
  } else if (!config.hosting.some((other) => other.target === archiveTarget(live, prev))) {
    throw new Error(
      `firebase.json serves ${editionDirName(next)} live but has no ${archiveTarget(live, prev)} entry. ` +
        `Restore the file with git checkout and run the generator again.`,
    );
  }
  return toJson(config);
}

interface FirebaseRc {
  targets?: Record<string, { hosting?: Record<string, string[]> }>;
  [key: string]: unknown;
}

/** Maps the new archive target to a placeholder site id, next to the live target. */
export function wireFirebaseRc(text: string, { prev }: Handover, live: string): string {
  const rc = JSON.parse(text) as FirebaseRc;
  const archive = archiveTarget(live, prev);
  let wired = false;
  for (const project of Object.values(rc.targets ?? {})) {
    const hosting = project.hosting;
    if (!hosting || !(live in hosting)) continue;
    wired = true;
    if (archive in hosting) continue;
    const ordered: Record<string, string[]> = {};
    for (const [target, sites] of Object.entries(hosting)) {
      ordered[target] = sites;
      if (target === live) ordered[archive] = [archiveSiteId(live, prev)];
    }
    project.hosting = ordered;
  }
  if (!wired) throw new Error(`.firebaserc maps no hosting target named "${live}"`);
  return toJson(rc);
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/** Index after the last line of the block that starts at `start`, trailing blank lines excluded. */
function blockEnd(lines: string[], start: number): number {
  const indent = indentOf(lines[start]);
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > indent)) end++;
  while (lines[end - 1].trim() === "") end--;
  return end;
}

/** The block of the YAML sequence item or mapping key that holds line `at`, found by walking up. */
function enclosingItem(lines: string[], at: number, itemPattern: RegExp): number {
  for (let i = at; i >= 0; i--) if (itemPattern.test(lines[i])) return i;
  throw new Error(`no enclosing block for line ${at + 1}`);
}

function withYear(lines: string[], live: string, from: number, to: number): string[] {
  const tokens = new RegExp(`(${live} ?)${from}`, "gi");
  return lines.map((line) => line.replace(tokens, `$1${to}`));
}

/**
 * Makes the live jobs build `next`, and gives `prev` the artifact upload and
 * the preview and deploy jobs it needs as an archive, copied from the newest
 * archive already in the file.
 */
export function wireCi(text: string, { prev, next }: Handover, live: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const artifact = (target: string) => `name: ${target}-out`;

  // 1. Live artifact: the `path:` under `name: <live>-out` follows the live edition.
  const liveName = artifact(live);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i - 1].trim() === liveName && lines[i].trim().startsWith("path:")) {
      lines[i] = lines[i].replace(editionDirName(prev), editionDirName(next));
    }
  }

  // 2. Archive upload step and jobs for `prev`, modelled on the newest archive.
  const archivePreview = new RegExp(`^  preview-${live}(\\d{4}):$`);
  const archives = lines.flatMap((line) => {
    const match = archivePreview.exec(line);
    return match ? [Number(match[1])] : [];
  });
  if (archives.includes(prev)) return lines.join(eol);
  const model = Math.max(...archives.filter((year) => year < prev));
  if (!Number.isFinite(model)) {
    throw new Error(
      `ci.yml has no preview-${live}<year> job to copy for ${archiveTarget(live, prev)}. ` +
        `Add the archive jobs by hand.`,
    );
  }

  const modelArtifact = artifact(archiveTarget(live, model));
  const nameLine = lines.findIndex((line) => line.trim() === modelArtifact);
  if (nameLine < 0) throw new Error(`ci.yml has no step that uploads ${modelArtifact}`);
  const stepStart = enclosingItem(lines, nameLine, /^\s*- /);
  const stepClone = withYear(lines.slice(stepStart, blockEnd(lines, stepStart)), live, model, prev);

  const jobStart = (name: string) => {
    const at = lines.findIndex((line) => line === `  ${name}:`);
    if (at < 0) throw new Error(`ci.yml has no ${name} job`);
    return at;
  };
  const previewAt = jobStart(`preview-${archiveTarget(live, model)}`);
  const deployAt = jobStart(`deploy-${archiveTarget(live, model)}`);
  const jobClone = (at: number) =>
    withYear(lines.slice(at, blockEnd(lines, at)), live, model, prev);
  const jobsClone = [...jobClone(previewAt), "", ...jobClone(deployAt), ""];

  // Insert the later position first so the earlier index stays valid.
  lines.splice(previewAt, 0, ...jobsClone);
  lines.splice(stepStart, 0, ...stepClone, "");
  return lines.join(eol);
}

/** The Firebase project that owns the live target, as `.firebaserc` names it. */
export function firebaseProjectOf(text: string, live: string): string {
  const rc = JSON.parse(text) as FirebaseRc;
  const project = Object.entries(rc.targets ?? {}).find(
    ([, project]) => live in (project.hosting ?? {}),
  );
  if (!project) throw new Error(`.firebaserc maps no hosting target named "${live}"`);
  return project[0];
}
