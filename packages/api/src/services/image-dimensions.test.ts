import { describe, it, expect } from "vitest";
import { readImageDimensions } from "./image-dimensions";

const png = (width: number, height: number) => {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
};

const jpegSof = (width: number, height: number) => {
  // SOI (2) + SOF0 marker (2) + length-inclusive segment (11)
  const buf = Buffer.alloc(15);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xc0;
  buf.writeUInt16BE(11, 4);
  buf[6] = 8;
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  buf[11] = 1;
  return buf;
};

const webpVp8x = (width: number, height: number) => {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8);
  buf.write("VP8X", 12);
  buf.writeUInt32LE(10, 16);
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
};

describe("readImageDimensions", () => {
  it("reads PNG IHDR width and height", () => {
    expect(readImageDimensions(png(640, 480))).toEqual({
      width: 640,
      height: 480,
      type: "png",
    });
  });

  it("reads JPEG SOF0 width and height", () => {
    expect(readImageDimensions(jpegSof(32, 16))).toEqual({
      width: 32,
      height: 16,
      type: "jpeg",
    });
  });

  it("reads WebP VP8X canvas size", () => {
    expect(readImageDimensions(webpVp8x(200, 100))).toEqual({
      width: 200,
      height: 100,
      type: "webp",
    });
  });

  it("refuses zero-sized and truncated buffers instead of looping", () => {
    expect(readImageDimensions(png(0, 10))).toBeNull();
    expect(readImageDimensions(Buffer.from("icns"))).toBeNull();
    expect(readImageDimensions(Buffer.alloc(0))).toBeNull();
    // A zero-size JXL/HEIF box used to hang image-size. We never parse those.
    const jxlish = Buffer.alloc(32, 0);
    jxlish.write("JXL ", 4);
    expect(readImageDimensions(jxlish)).toBeNull();
  });
});
