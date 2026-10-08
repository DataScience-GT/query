export type ImportedProject = {
  externalId: string;
  name: string;
  teamName: string | null;
  tableNumber: number | null;
};

/** Devpost exports and a plain name,team,table sheet. The first row is headers.
 * A column map renames headers: `name: Project Title`.
 */
export function parseProjectCsv(
  text: string,
  columnMap: Record<string, string> = {},
): ImportedProject[] {
  const rows = parseRows(text);
  const header = rows[0];
  if (!header) return [];
  const index = new Map(header.map((cell, i) => [cell.trim().toLowerCase(), i]));
  const nameAt = column(index, columnMap.name, ["project title", "name"]);
  if (nameAt === undefined) {
    throw new Error("CSV needs a name or Project Title column");
  }
  const teamAt = column(index, columnMap.team, ["team name", "team"]);
  const tableAt = column(index, columnMap.table, ["table", "table number"]);
  const idAt = column(index, columnMap.externalId, ["submission url", "external id", "id"]);

  return rows.slice(1).flatMap((row) => {
    const name = row[nameAt]?.trim();
    if (!name) return [];
    const tableRaw = tableAt === undefined ? "" : (row[tableAt] ?? "");
    const tableNumber = tableRaw.trim() === "" ? null : Number(tableRaw);
    return [
      {
        externalId: (idAt === undefined ? "" : (row[idAt] ?? "")).trim() || name,
        name,
        teamName: teamAt === undefined ? null : row[teamAt]?.trim() || null,
        tableNumber: tableNumber !== null && Number.isFinite(tableNumber) ? tableNumber : null,
      },
    ];
  });
}

export type ExportedResult = {
  project: string;
  track: string;
  placement: number | null;
  score: number;
};

export function formatResultsCsv(rows: readonly ExportedResult[]): string {
  const lines = ["project,track,placement,score"];
  for (const row of rows) {
    lines.push(
      [cell(row.project), cell(row.track), row.placement ?? "", row.score].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function formatResultsJson(rows: readonly ExportedResult[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function parseColumnMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf(":");
    if (split === -1) continue;
    map[trimmed.slice(0, split).trim()] = trimmed.slice(split + 1).trim();
  }
  return map;
}

function column(
  index: Map<string, number>,
  mapped: string | undefined,
  fallbacks: string[],
): number | undefined {
  const names = mapped ? [mapped.toLowerCase(), ...fallbacks] : fallbacks;
  for (const name of names) {
    const at = index.get(name);
    if (at !== undefined) return at;
  }
  return undefined;
}

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
}
