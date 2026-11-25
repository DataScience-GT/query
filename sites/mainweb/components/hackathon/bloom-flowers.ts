import type { FoodGroup } from "@query/api/discord-config";

/**
 * One pixel flower per food group, in the house pixel style of
 * sites/hacklytics2027/src/components/pixel/sprites.ts. A sprite is a string
 * per row and a character per pixel, looked up in a palette, "." is clear.
 *
 *   p  petal shade   P  petal (the tint)   c  petal highlight
 *   g  stem          G  leaf
 *   the rest are each flower's own parts (eye, seeds, anthers, lip)
 *
 * `tint` is the flower's identity colour. The Discord role carries the same
 * hex, so the picture and the role match. The petal shades derive from it.
 */
export type BloomFlower = {
  map: string[];
  colors: Record<string, string>;
  tint: string;
};

/** Every flower stands on the same eight rows of stem and leaves. */
const STEM_ROWS = [
  "......g......",
  "..GGG.g......",
  ".G...Gg......",
  "......g.GG...",
  "......gG..G..",
  "......g......",
  "......g......",
  ".....ggg.....",
];
export const STEM = { g: "#2f6b3a", G: "#4c9a55" };

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Shade and highlight of the tint, same hue, so a pale tint stays pale. */
function petalColors(tint: string) {
  const [h, s, l] = hexToHsl(tint);
  return {
    p: hslToHex(h, Math.min(1, s * 1.05), l - Math.min(0.22, l * 0.4)),
    P: tint,
    c: hslToHex(h, s * 0.9, l + (1 - l) * 0.55),
  };
}

function flower(
  tint: string,
  head: string[],
  parts: Record<string, string> = {},
): BloomFlower {
  return {
    tint,
    map: [...head, ...STEM_ROWS],
    colors: { ...STEM, ...petalColors(tint), ...parts },
  };
}

/** The key union is the type, so a food group without a flower fails typecheck. */
export const BLOOM_FLOWERS: Record<FoodGroup["key"], BloomFlower> = {
  cherry_blossom: flower(
    "#F7B3CB",
    [
      ".....p.p.....",
      "....pPpPp....",
      "....pPPPp....",
      ".ppppPPPpppp.",
      ".pPPcpPpcPPp.",
      "pPPPPYYYPPPPp",
      ".pPPPYcYpPPp.",
      "..pcpYYYPcp..",
      "..pPPPPpPPp..",
      "..pPPPcPPPp..",
      "..ppPPpPPpp..",
      "....pp.pp....",
    ],
    { Y: "#d9467a" },
  ),
  sunflower: flower(
    "#F5C518",
    [
      "....PppPp....",
      "...PpPPpPp...",
      "..PPPpPPPpp..",
      ".PPpPdddPPPp.",
      "PpPPdbBbdPPpp",
      "pPpdbBbBbdPpp",
      "pPPdBbBbBdPPp",
      "PppdbBbBbdppp",
      "pPPPdbBbdPPpp",
      ".pppPdddPppp.",
      "..pPPpPpPpp..",
      "...pppPppp...",
      "....ppppp....",
    ],
    { b: "#5a3a1a", B: "#7a5226", d: "#3b2410" },
  ),
  tulip: flower("#E5484D", [
    "..p...p...p..",
    "..pp.pPp.pp..",
    "..pPpPcPpPp..",
    "..pPpPcPpPp..",
    "..pPpPcPpPp..",
    "..pPpPPPpPp..",
    "...pPPPPPp...",
    "....pPPPp....",
    ".....pPp.....",
    "......p......",
  ]),
  lily: flower(
    "#F08A3C",
    [
      "......p......",
      ".....pPp.....",
      ".p...PcP...p.",
      ".pPp.PcP.pPp.",
      "..pPpPwPpPp..",
      "..wPPPcPPPw..",
      "...pPaYaPp...",
      "..wPPPcPPPw..",
      "..pPpPwPpPp..",
      ".pPp.PcP.pPp.",
      ".p...PcP...p.",
      ".....pPp.....",
      "......p......",
    ],
    { Y: "#f3e27a", w: "#8a3a12", a: "#5a2a0a" },
  ),
  lotus: flower("#E86FA6", [
    "......p......",
    ".....cPp.....",
    "..ccpcPpccp..",
    "..cPpccpcPp..",
    "..cPcPcPpPp..",
    "cppPcPcPpPpcp",
    "cPcccPcPppcPp",
    "pPPcpPcPppPPp",
    ".cPpPccpPpPp.",
    "cpPPcccppPPpp",
    "pPpPpccppPpPp",
    ".pGpppPpppGp.",
    "..pGGGpGGGp..",
  ]),
  daisy: flower(
    "#F4F4F4",
    [
      "....p.p.p....",
      "....p.p.p....",
      "..cpcppcpcp..",
      "..pPpppccPp..",
      "ppcpPYYyPccpp",
      "..ppYYzYypp..",
      "ppppYzYzypppp",
      "..ccyYzYycp..",
      "ppppPyyyPpppp",
      "..cPpppcpPp..",
      "..ppcpppppp..",
      "....p.p.p....",
      "....p.p.p....",
    ],
    { Y: "#f6c21a", y: "#c58a06", z: "#dba10d" },
  ),
  orchid: flower(
    "#B07CE8",
    [
      ".....ppp.....",
      "....pPPPp....",
      "....pPPPp....",
      ".pppppPppppp.",
      "pPcPPpPpPPcPp",
      "pPcPPPYPPPcPp",
      "pPPPPnYnPPPPp",
      "pPPPPnYnPPPPp",
      ".ppppnmnpppp.",
      "..pPPPnPPPp..",
      "..pPPPpPPPp..",
      "...ppp.ppp...",
    ],
    { Y: "#f6e27a", m: "#7a3fb5", n: "#4f2a80" },
  ),
  rose: flower("#C8143C", [
    ".....ccp.....",
    "...cpPPPcp...",
    "..pPcPppPPp..",
    ".cPPpPPPPpPp.",
    ".pPpPPppPPPp.",
    ".pcpcpcPpPpp.",
    ".pPpPpcPpPpp.",
    ".pPpPPPPpPpp.",
    ".cPPpPPpPPPp.",
    ".pPPPPPPPpPp.",
    "..GppPPpppG..",
    "...GpppppG...",
    "....G...G....",
  ]),
};

/** The flower without its stem and leaves. */
export function headRows(flower: BloomFlower) {
  return flower.map.slice(0, -STEM_ROWS.length);
}

/** A soft halo in the colour: a tight ring and a wide, faint one. */
export const glowFilter = (color: string) =>
  `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 10px ${color}73)`;

export function spriteUri(map: string[], colors: Record<string, string>) {
  let rects = "";
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`;
      }
    }),
  );
  const w = Math.max(...map.map((r) => r.length));
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${map.length}" shape-rendering="crispEdges">${rects}</svg>`,
  )}`;
}
