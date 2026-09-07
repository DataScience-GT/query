/**
 * Per-file cap. A Word or LaTeX resume runs 100-500KB, so 2MB passes every
 * real one. This is a quality call now, not a storage one — files that need
 * more are scans, which read badly through an applicant tracker.
 */
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

/** The extension is not evidence; the first five bytes are. */
export function looksLikePdf(bytes: Uint8Array) {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * `Ada Lovelace.pdf`, from the name on file — an uploaded filename is
 * attacker-controlled text heading for a Content-Disposition header, and for
 * a path inside a ZIP that thousands of people will extract.
 */
export function resumeFileName(name: string | null | undefined) {
  const safe = (name ?? "resume")
    .replace(/[^\p{L}\p{N} .-]/gu, "")
    .trim()
    .slice(0, 80);
  return `${safe || "resume"}.pdf`;
}

/** Decode a URI-encoded header without throwing on a truncated `%xx`. */
function decodeHeader(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The original filename from `x-resume-filename`. Stored decoded so the
 * settings page can render it; a sliced `%xx` must not crash `decodeURIComponent`.
 */
export function uploadedResumeFileName(header: string | null | undefined) {
  const raw = (header ?? "resume.pdf").split(/[\r\n]/)[0] ?? "resume.pdf";
  const cleaned = decodeHeader(raw).trim().slice(0, 255);
  return cleaned || "resume.pdf";
}

/** Labels already on file, including ones stored URI-encoded before this fix. */
export function decodeStoredFileName(name: string) {
  return decodeHeader(name);
}

export const displayResumeFileName = decodeStoredFileName;

/** RFC 5987 so a Unicode display name survives Content-Disposition. */
export function resumeContentDisposition(
  displayName: string,
  kind: "inline" | "attachment" = "inline",
) {
  const fileName = resumeFileName(displayName);
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Names inside the ZIP. Two people called Chen get `Chen.pdf` and
 * `Chen (2).pdf` rather than one silently overwriting the other on extract.
 */
export function uniqueZipName(taken: Set<string>, displayName: string) {
  const base = resumeFileName(displayName).replace(/\.pdf$/, "");
  let candidate = `${base}.pdf`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    candidate = `${base} (${n}).pdf`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Enough for every hand-picked selection the table can build, and a bound on the IN list a crafted URL can ask for. */
export const MAX_BOOK_IDS = 1000;

/** The `ids` query parameter: deduplicated, capped, or undefined for "no explicit set". */
export function parseResumeIds(raw: string | null | undefined) {
  if (!raw) return undefined;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_BOOK_IDS);
  return ids.length > 0 ? ids : undefined;
}
