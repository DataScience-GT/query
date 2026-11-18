/** Where an edition lives. Shared by the discovery code and the deploy wiring. */
export const SITES_DIR = "sites";

const PREFIX = "hacklytics";

export const editionDirName = (year: number) => `${PREFIX}${year}`;

/** The year in an edition's directory name, or null for any other directory. */
export function editionYearOf(dirName: string): number | null {
  const match = new RegExp(String.raw`^${PREFIX}(\d{4})$`).exec(dirName);
  return match ? Number(match[1]) : null;
}
