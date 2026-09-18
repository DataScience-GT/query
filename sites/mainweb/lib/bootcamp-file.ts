/**
 * A 20MB policy cap leaves headroom below Cloud Run's 32MiB HTTP/1 request
 * ceiling and bounds per-request memory and storage use under high concurrency.
 */
export const MAX_BOOTCAMP_ZIP_BYTES = 20 * 1024 * 1024;

/** ZIP files begin with the local-file header, not merely a `.zip` suffix. */
export function looksLikeZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Validation failures are client errors; storage failures remain route-level 502s. */
export class BootcampZipError extends Error {
  constructor(
    readonly reason: "empty" | "not-zip" | "too-large",
    message: string,
  ) {
    super(message);
    this.name = "BootcampZipError";
  }
}

/**
 * Validates a ZIP as it flows and hands accepted chunks to storage. Holding
 * only the short signature prefix makes the mid-stream cap independently
 * testable without credentials or a bucket.
 */
export async function streamBootcampZip(
  body: ReadableStream<Uint8Array>,
  write: (chunk: Uint8Array) => void | Promise<void>,
) {
  const reader = body.getReader();
  let size = 0;
  let prefix = new Uint8Array();
  let signatureAccepted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      size += value.length;
      if (size > MAX_BOOTCAMP_ZIP_BYTES) {
        throw new BootcampZipError(
          "too-large",
          "Workshop ZIP must be 20MB or smaller.",
        );
      }

      if (!signatureAccepted) {
        const joined = new Uint8Array(prefix.length + value.length);
        joined.set(prefix);
        joined.set(value, prefix.length);
        prefix = joined;
        if (prefix.length < 4) continue;
        if (!looksLikeZip(prefix.subarray(0, 4))) {
          throw new BootcampZipError("not-zip", "That file is not a ZIP.");
        }
        signatureAccepted = true;
        await write(prefix);
        prefix = new Uint8Array();
        continue;
      }

      await write(value);
    }

    if (size === 0) {
      throw new BootcampZipError("empty", "No file received.");
    }
    if (!signatureAccepted) {
      throw new BootcampZipError("not-zip", "That file is not a ZIP.");
    }
    return size;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
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
 * The browser sends the original label in a header. CR/LF is stripped before
 * storage so attacker-controlled text can never become a response header.
 */
export function uploadedBootcampFileName(
  header: string | null | undefined,
) {
  const raw = (header ?? "workshop.zip").split(/[\r\n]/)[0] ?? "workshop.zip";
  // Split again after decoding because `%0d%0a` is just as dangerous as a
  // literal newline once it becomes stored text.
  const decoded = decodeHeader(raw).split(/[\r\n]/)[0] ?? "workshop.zip";
  const cleaned = decoded.trim().slice(0, 255);
  return cleaned || "workshop.zip";
}

/** A server-derived ASCII download name, never the uploaded client label. */
export function bootcampDownloadName(
  week: number,
  kind: "materials" | "solution",
) {
  return `bootcamp-week-${week}-${kind}.zip`;
}
