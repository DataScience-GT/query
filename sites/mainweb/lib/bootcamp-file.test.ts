import { describe, expect, it } from "vitest";
import {
  looksLikeZip,
  MAX_BOOTCAMP_ZIP_BYTES,
  streamBootcampZip,
  uploadedBootcampFileName,
} from "./bootcamp-file";

describe("bootcamp file rules", () => {
  it("accepts the ZIP local-file signature", () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  it("rejects a PDF and an empty body", () => {
    expect(looksLikeZip(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
    expect(looksLikeZip(new Uint8Array())).toBe(false);
  });

  it("decodes names and removes CR/LF header injection", () => {
    expect(
      uploadedBootcampFileName("week%201.zip%0d%0aX-Evil:yes"),
    ).toBe("week 1.zip");
  });

  it("rejects non-ZIP bodies before writing them", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        controller.close();
      },
    });
    const written: Uint8Array[] = [];

    await expect(
      streamBootcampZip(body, (chunk) => {
        written.push(chunk);
      }),
    ).rejects.toMatchObject({ reason: "not-zip" });
    expect(written).toEqual([]);
  });

  it("enforces the cap from streamed bytes without trusting content-length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const first = new Uint8Array(MAX_BOOTCAMP_ZIP_BYTES);
        first.set([0x50, 0x4b, 0x03, 0x04]);
        controller.enqueue(first);
        controller.enqueue(new Uint8Array([0x00]));
        controller.close();
      },
    });

    await expect(
      streamBootcampZip(body, () => undefined),
    ).rejects.toMatchObject({ reason: "too-large" });
  });
});
