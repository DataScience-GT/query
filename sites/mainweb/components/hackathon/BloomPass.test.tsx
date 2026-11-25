import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { QRCodeSVG } from "qrcode.react";
import { prepareZXingModule, readBarcodesFromImageData } from "zxing-wasm/reader";
import { FOOD_GROUPS } from "@query/api/discord-config";

import { BloomPass, BloomQr } from "./BloomPass";

Object.assign(globalThis, { React });

// What the door scanner reads: the same three fields the plain pass carries.
const PAYLOAD = JSON.stringify({
  type: "CHECK_IN",
  hackathonId: "3f6c1e52-8a0b-4d7e-9c41-0b2f7a5d1e90",
  participantId: "c9a4b7d2-15e3-4f08-a6b1-7d3e90f2c458",
});

const PADDING = 16; // the white panel around the code, px
const QR_PX = 240;

// zxing-wasm fetches its binary from a CDN by default; read it from disk.
beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm");
  await prepareZXingModule({
    overrides: { wasmBinary: readFileSync(wasm).buffer as ArrayBuffer },
    fireImmediately: true,
  });
});

/** The code as a phone shows it: on the white panel, `scale` device pixels per css pixel. */
async function screenshot(codeSvg: string, scale: number) {
  const side = QR_PX + PADDING * 2;
  const inner = codeSvg.replace(/^<svg /, `<svg x="${PADDING}" y="${PADDING}" `);
  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#ffffff"/>${inner}</svg>`;
  const { data, info } = await sharp(Buffer.from(page), { density: 72 * scale })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    colorSpace: "srgb" as const,
  };
}

async function decode(codeSvg: string, scale: number) {
  const image = await screenshot(codeSvg, scale);
  const results = await readBarcodesFromImageData(image, { formats: ["QRCode"] });
  return results.filter((r) => r.isValid).map((r) => r.text);
}

const codeFor = (key: (typeof FOOD_GROUPS)[number]["key"]) =>
  renderToStaticMarkup(<BloomQr value={PAYLOAD} flowerKey={key} />);

describe("bloom pass QR", () => {
  it("has all eight flowers to check", () => {
    expect(FOOD_GROUPS).toHaveLength(8);
  });

  for (const group of FOOD_GROUPS) {
    it(`${group.name}: decodes to the check-in payload at 0.8x, 1x, 2x and 3x`, async () => {
      const svg = codeFor(group.key);
      for (const scale of [0.8, 1, 2, 3]) {
        expect(await decode(svg, scale), `${group.key} at ${scale}x`).toEqual([PAYLOAD]);
      }
    });

    it(`${group.name}: the flower takes at most 22% of the code's width`, () => {
      const svg = codeFor(group.key);
      const width = Number(/<image[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
      expect(width).toBeGreaterThan(0);
      expect(width / QR_PX).toBeLessThanOrEqual(0.22);
      expect(svg).toContain("<image");
      // Modules are the one dark ink, never the flower's colour.
      expect(svg.match(/fill="(#[0-9a-f]{6})"/gi)?.sort()).toEqual([
        'fill="#131715"',
        'fill="#ffffff"',
      ]);
    });
  }

  it("the harness can fail: a flower covering half the code does not decode", async () => {
    const svg = renderToStaticMarkup(
      <QRCodeSVG
        value={PAYLOAD}
        size={QR_PX}
        level="M"
        fgColor="#131715"
        bgColor="#ffffff"
        imageSettings={{
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          width: QR_PX * 0.55,
          height: QR_PX * 0.55,
          excavate: true,
        }}
      />,
    );
    expect(await decode(svg, 2)).toEqual([]);
  });
});

describe("bloom pass ticket", () => {
  const [, sunflower] = FOOD_GROUPS;

  it("names the flower and who holds the pass", () => {
    const html = renderToStaticMarkup(
      <BloomPass value={PAYLOAD} bloom={{ ...sunflower, holder: "Ada Lovelace" }} />,
    );
    expect(html).toContain("Sunflower bloom");
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toMatch(/food group/i);
  });

  it("leaves the name off when there is none", () => {
    const html = renderToStaticMarkup(<BloomPass value={PAYLOAD} bloom={sunflower} />);
    expect(html).toContain("Sunflower bloom");
    expect(html).not.toContain("null");
  });
});
