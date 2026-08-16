/**
 * Dimensions for the three types the profile-image upload already allows.
 *
 * `image-size` through 2.0.2 (the latest published release) infinite-loops on
 * crafted ICNS / JXL / HEIF buffers. There is no patched version on npm, so
 * this parser understands only PNG, JPEG and WebP — the same types the data-URI
 * regex already admits. Anything else is corrupt, not "try the next format".
 */

export type ImageKind = "png" | "jpeg" | "webp";

export type ImageDimensions = {
  width: number;
  height: number;
  type: ImageKind;
};

const PNG_SIG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const isFinitePositive = (n: number) =>
  Number.isInteger(n) && n > 0 && n <= 0xffff_ffff;

const pngDimensions = (buf: Buffer): ImageDimensions | null => {
  if (buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
  return { width, height, type: "png" };
};

const jpegDimensions = (buf: Buffer): ImageDimensions | null => {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    while (offset < buf.length && buf[offset] === 0xff) offset += 1;
    if (offset >= buf.length) return null;

    const marker = buf[offset]!;
    offset += 1;

    // Standalone markers (no length): RST0–RST7, SOI, EOI, TEM.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      if (marker === 0xd9) return null;
      continue;
    }

    if (offset + 1 >= buf.length) return null;
    const length = buf.readUInt16BE(offset);
    if (length < 2 || offset + length > buf.length) return null;

    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carry the frame size.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      if (length < 7 || offset + 6 >= buf.length) return null;
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
      return { width, height, type: "jpeg" };
    }

    offset += length;
  }

  return null;
};

const readUInt24LE = (buf: Buffer, offset: number) =>
  buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16);

const webpDimensions = (buf: Buffer): ImageDimensions | null => {
  if (buf.length < 16) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WEBP") return null;

  const fourcc = buf.toString("ascii", 12, 16);
  if (buf.length < 20) return null;
  const chunkSize = buf.readUInt32LE(16);
  const payload = 20;

  if (fourcc === "VP8X") {
    // 1 byte flags + 3 reserved + 3 width-1 + 3 height-1
    if (chunkSize < 10 || buf.length < payload + 10) return null;
    const width = readUInt24LE(buf, payload + 4) + 1;
    const height = readUInt24LE(buf, payload + 7) + 1;
    if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
    return { width, height, type: "webp" };
  }

  if (fourcc === "VP8L") {
    // signature 0x2f, then 14-bit width-1 and 14-bit height-1.
    if (chunkSize < 5 || buf.length < payload + 5) return null;
    if (buf[payload] !== 0x2f) return null;
    const bits =
      buf[payload + 1]! |
      (buf[payload + 2]! << 8) |
      (buf[payload + 3]! << 16) |
      (buf[payload + 4]! << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
    return { width, height, type: "webp" };
  }

  if (fourcc === "VP8 ") {
    // 3-byte frame tag, then 0x9d 0x01 0x2a, then 16-bit width/height (14 used).
    if (chunkSize < 10 || buf.length < payload + 10) return null;
    if (
      buf[payload + 3] !== 0x9d ||
      buf[payload + 4] !== 0x01 ||
      buf[payload + 5] !== 0x2a
    ) {
      return null;
    }
    const width = buf.readUInt16LE(payload + 6) & 0x3fff;
    const height = buf.readUInt16LE(payload + 8) & 0x3fff;
    if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
    return { width, height, type: "webp" };
  }

  return null;
};

export const readImageDimensions = (buf: Buffer): ImageDimensions | null =>
  pngDimensions(buf) ?? jpegDimensions(buf) ?? webpDimensions(buf);
