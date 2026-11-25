import type { FoodGroup } from "@query/api/discord-config";
import { QRCodeSVG } from "qrcode.react";
import {
  BLOOM_FLOWERS,
  headRows,
  spriteUri,
  spriteWidth,
} from "./bloom-flowers";
import { FlowerSprite } from "./FoodGroupBloom";

/** An accepted hacker's flower, the name it goes by, and who holds the pass. */
export type PassBloom = {
  key: FoodGroup["key"];
  name: string;
  holder?: string | null;
};

const QR_SIZE = 240;
/** The modules never take the tint: pale flowers would not scan on white. */
const INK = "#131715";
const PAPER = "#ffffff";
/** Level H repairs 30% of the code; the flower covers well under a tenth. */
const HEAD_SHARE = 0.22;

/** Black or white, whichever reads better on the flower's colour. */
function inkOn(tint: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(tint.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against INK (luminance ~0.008) versus white.
  return (luminance + 0.05) / 0.058 >= 1.05 / (luminance + 0.05) ? INK : PAPER;
}

/**
 * The check-in QR with the hacker's flower head left in the middle. Same
 * payload as the plain pass; only the error correction and the centre change.
 */
export function BloomQr({
  value,
  flowerKey,
}: {
  value: string;
  flowerKey: FoodGroup["key"];
}) {
  const flower = BLOOM_FLOWERS[flowerKey];
  const rows = headRows(flower);
  const cols = spriteWidth(rows);
  const pixel = Math.floor((QR_SIZE * HEAD_SHARE) / cols);
  return (
    <QRCodeSVG
      value={value}
      size={QR_SIZE}
      level="H"
      fgColor={INK}
      bgColor={PAPER}
      className="block h-auto w-full"
      imageSettings={{
        src: spriteUri(rows, flower.colors),
        width: cols * pixel,
        height: rows.length * pixel,
        excavate: true,
      }}
    />
  );
}

/** The Digital Bloom ticket: the code on white, the flower's colour around it. */
export function BloomPass({ value, bloom }: { value: string; bloom: PassBloom }) {
  const { tint } = BLOOM_FLOWERS[bloom.key];
  const ink = inkOn(tint);
  return (
    <div
      data-testid="bloom-pass"
      className="mx-auto mt-5 w-full max-w-[320px] overflow-hidden rounded-[var(--radius-sm)] border-[3px]"
      style={{
        borderColor: tint,
        boxShadow: `0 0 0 1px ${tint}33, 0 0 26px ${tint}40`,
      }}
    >
      <div className="bg-[#ffffff] p-4">
        <BloomQr value={value} flowerKey={bloom.key} />
      </div>
      <div
        className="flex items-center gap-3 border-t-[3px] border-dashed px-4 py-3"
        style={{ background: tint, color: ink, borderColor: ink }}
      >
        <FlowerSprite groupKey={bloom.key} scale={3} headOnly />
        <div className="min-w-0">
          <p
            className="text-[15px] leading-5 text-balance"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {bloom.name} bloom
          </p>
          {bloom.holder && (
            <p className="mt-0.5 truncate text-[13px] leading-5 opacity-80">
              {bloom.holder}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
