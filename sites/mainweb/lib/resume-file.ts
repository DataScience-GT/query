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
